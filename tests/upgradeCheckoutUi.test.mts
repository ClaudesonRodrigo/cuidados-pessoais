import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createCheckoutHandler,
  type CheckoutUiStatus,
  type CheckoutUser,
} from "../src/lib/upgradeCheckout.ts";

const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_ui";
const GENERIC_ERROR = "Não foi possível iniciar a assinatura agora. Tente novamente.";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function harness(options: {
  user?: CheckoutUser | null;
  response?: Response;
  fetch?: typeof fetch;
} = {}) {
  const statuses: CheckoutUiStatus[] = [];
  const redirects: string[] = [];
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const user = options.user === undefined
    ? { getIdToken: async () => "firebase-token" }
    : options.user;
  const fetchCheckout = options.fetch ?? (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return options.response ?? jsonResponse(200, { url: CHECKOUT_URL });
  });

  const handler = createCheckoutHandler({
    getCurrentUser: () => user,
    fetch: fetchCheckout,
    redirect: (url) => redirects.push(url),
    onStatusChange: (status) => statuses.push(status),
  });

  return { handler, statuses, redirects, calls };
}

test("owner autenticado: solicita o ID token do Firebase", async () => {
  let tokenCalls = 0;
  const owner = {
    async getIdToken() {
      tokenCalls += 1;
      return "owner-token";
    },
  };
  const context = harness({ user: owner });

  await context.handler();

  assert.equal(tokenCalls, 1);
});

test("envia POST para /api/billing/checkout", async () => {
  const context = harness();

  await context.handler();

  assert.equal(context.calls[0].input, "/api/billing/checkout");
  assert.equal(context.calls[0].init?.method, "POST");
});

test("envia Authorization Bearer com o ID token", async () => {
  const context = harness({ user: { getIdToken: async () => "secure-token" } });

  await context.handler();

  assert.equal((context.calls[0].init?.headers as Record<string, string>).Authorization, "Bearer secure-token");
});

test("envia body exatamente igual a {}", async () => {
  const context = harness();

  await context.handler();

  assert.equal(context.calls[0].init?.body, "{}");
  assert.deepEqual(JSON.parse(String(context.calls[0].init?.body)), {});
});

test("não envia ownerId", async () => {
  const context = harness();

  await context.handler();

  assert.equal(String(context.calls[0].init?.body).includes("ownerId"), false);
});

test("não envia pageSlug", async () => {
  const context = harness();

  await context.handler();

  assert.equal(String(context.calls[0].init?.body).includes("pageSlug"), false);
});

test("não envia priceId", async () => {
  const context = harness();

  await context.handler();

  assert.equal(String(context.calls[0].init?.body).includes("priceId"), false);
});

test("loading desabilita o CTA e mostra Preparando pagamento", async () => {
  let release!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const context = harness({ fetch: async () => pending });
  const request = context.handler();

  assert.deepEqual(context.statuses, [{ state: "loading" }]);

  const component = await readFile("src/components/UpgradeModal.tsx", "utf8");
  assert.equal(component.includes("disabled={isLoading}"), true);
  assert.equal(component.includes("Preparando pagamento..."), true);

  release(jsonResponse(200, { url: CHECKOUT_URL }));
  await request;
});

test("200 com URL Stripe redireciona para o Checkout hospedado", async () => {
  const context = harness();

  await context.handler();

  assert.deepEqual(context.redirects, [CHECKOUT_URL]);
});

test("URL inválida não redireciona e produz erro seguro", async () => {
  const context = harness({ response: jsonResponse(200, { url: "https://example.com/falso" }) });

  await context.handler();

  assert.deepEqual(context.redirects, []);
  assert.deepEqual(context.statuses.at(-1), { state: "error", message: GENERIC_ERROR });
});

test("409 ALREADY_SUBSCRIBED mostra mensagem correta", async () => {
  const context = harness({
    response: jsonResponse(409, { error: { code: "ALREADY_SUBSCRIBED" } }),
  });

  await context.handler();

  assert.deepEqual(context.statuses.at(-1), {
    state: "error",
    message: "Você já possui uma assinatura ativa.",
  });
});

test("409 PAYMENT_REQUIRES_ACTION mostra mensagem correta", async () => {
  const context = harness({
    response: jsonResponse(409, { error: { code: "PAYMENT_REQUIRES_ACTION" } }),
  });

  await context.handler();

  assert.deepEqual(context.statuses.at(-1), {
    state: "error",
    message: "Existe uma assinatura que precisa de regularização.",
  });
});

test("409 CHECKOUT_IN_PROGRESS mostra mensagem correta", async () => {
  const context = harness({
    response: jsonResponse(409, { error: { code: "CHECKOUT_IN_PROGRESS" } }),
  });

  await context.handler();

  assert.deepEqual(context.statuses.at(-1), {
    state: "error",
    message: "Já existe um checkout em andamento.",
  });
});

test("503 mostra mensagem genérica segura", async () => {
  const context = harness({
    response: jsonResponse(503, { error: { code: "BILLING_UNAVAILABLE", message: "segredo técnico" } }),
  });

  await context.handler();

  assert.deepEqual(context.statuses.at(-1), { state: "error", message: GENERIC_ERROR });
  assert.equal(JSON.stringify(context.statuses).includes("segredo técnico"), false);
});

test("sem currentUser falha de forma controlada sem chamar a API", async () => {
  const context = harness({ user: null });

  await context.handler();

  assert.equal(context.calls.length, 0);
  assert.deepEqual(context.statuses.at(-1), { state: "error", message: GENERIC_ERROR });
});

test("segundo clique durante loading não dispara uma segunda request", async () => {
  let release!: (response: Response) => void;
  let fetchCalls = 0;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const context = harness({
    fetch: async () => {
      fetchCalls += 1;
      return pending;
    },
  });

  const first = context.handler();
  const second = context.handler();
  await second;

  assert.equal(fetchCalls, 1);

  release(jsonResponse(200, { url: CHECKOUT_URL }));
  await first;
});
