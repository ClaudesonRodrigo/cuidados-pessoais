import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createPortalHandler,
  fetchBillingStatus,
  isStripePortalUrl,
  type PortalUiStatus,
} from "../src/lib/billingStatusClient.ts";

const PORTAL_URL = "https://billing.stripe.com/p/session/test_portal";
const ACTIVE_DTO = {
  state: "ACTIVE",
  source: "stripe",
  billingStatus: "active",
  requiresPaymentAction: false,
  canOpenPortal: true,
  canSubscribe: false,
};

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

test("status client usa current user, getIdToken e GET autenticado", async () => {
  let tokenCalls = 0;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const body = await fetchBillingStatus({
    async getIdToken() { tokenCalls += 1; return "secure-token"; },
  }, async (input, init) => {
    calls.push({ input, init });
    return jsonResponse(200, ACTIVE_DTO);
  });
  assert.equal(tokenCalls, 1);
  assert.equal(calls[0].input, "/api/billing/status");
  assert.equal(calls[0].init?.method, "GET");
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer secure-token");
  assert.deepEqual(body, ACTIVE_DTO);
});

const portalHarness = (options: { response?: Response; fetch?: typeof fetch; user?: { getIdToken(): Promise<string> } | null } = {}) => {
  const statuses: PortalUiStatus[] = [];
  const redirects: string[] = [];
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const user = options.user === undefined ? { getIdToken: async () => "firebase-token" } : options.user;
  const handler = createPortalHandler({
    getCurrentUser: () => user,
    fetch: options.fetch ?? (async (input, init) => {
      calls.push({ input, init });
      return options.response ?? jsonResponse(200, { url: PORTAL_URL });
    }),
    redirect: (url) => redirects.push(url),
    onStatusChange: (status) => statuses.push(status),
  });
  return { handler, statuses, redirects, calls };
};

test("Portal usa currentUser, getIdToken, POST e body {} sem autoridade financeira", async () => {
  let tokenCalls = 0;
  const context = portalHarness({ user: { async getIdToken() { tokenCalls += 1; return "owner-token"; } } });
  await context.handler();
  assert.equal(tokenCalls, 1);
  assert.equal(context.calls[0].input, "/api/billing/portal");
  assert.equal(context.calls[0].init?.method, "POST");
  assert.equal(context.calls[0].init?.body, "{}");
  const serialized = JSON.stringify(context.calls[0].init);
  for (const field of ["ownerId", "pageSlug", "customerId", "subscriptionId", "priceId", "returnUrl"]) {
    assert.equal(serialized.includes(field), false);
  }
});

test("Portal aceita somente HTTPS no hostname exato billing.stripe.com", () => {
  assert.equal(isStripePortalUrl(PORTAL_URL), true);
  assert.equal(isStripePortalUrl("http://billing.stripe.com/session"), false);
  assert.equal(isStripePortalUrl("https://billing.stripe.com.attacker.example/session"), false);
  assert.equal(isStripePortalUrl("https://attacker.example/billing.stripe.com"), false);
  assert.equal(isStripePortalUrl("not-a-url"), false);
});

test("URL falsa não redireciona", async () => {
  const context = portalHarness({ response: jsonResponse(200, { url: "https://billing.stripe.com.attacker.example" }) });
  await context.handler();
  assert.deepEqual(context.redirects, []);
  assert.equal(context.statuses.at(-1)?.state, "error");
});

test("loading impede clique duplo", async () => {
  let release!: (response: Response) => void;
  let fetchCalls = 0;
  const pending = new Promise<Response>((resolve) => { release = resolve; });
  const context = portalHarness({ fetch: async () => { fetchCalls += 1; return pending; } });
  const first = context.handler();
  await context.handler();
  assert.equal(fetchCalls, 1);
  assert.deepEqual(context.statuses, [{ state: "loading" }]);
  release(jsonResponse(200, { url: PORTAL_URL }));
  await first;
});

for (const [code, message] of [
  ["PORTAL_NOT_AVAILABLE", "O gerenciamento da assinatura ainda não está disponível para esta conta."],
  ["ACCOUNT_NOT_READY", "Sua conta ainda está sendo preparada. Atualize a página e tente novamente."],
  ["CUSTOMER_BINDING_CONFLICT", "Não foi possível confirmar os dados da assinatura. Entre em contato com o suporte."],
  ["BILLING_UNAVAILABLE", "O sistema de cobrança está temporariamente indisponível. Tente novamente."],
  ["BILLING_CONFIG_INVALID", "O gerenciamento da assinatura está temporariamente indisponível."],
  ["UNAUTHORIZED", "Sua sessão expirou. Entre novamente para gerenciar sua assinatura."],
] as const) {
  test(`erro ${code} é sanitizado`, async () => {
    const context = portalHarness({ response: jsonResponse(409, { error: { code, message: "cus_secret stack metadata" } }) });
    await context.handler();
    assert.deepEqual(context.redirects, []);
    assert.deepEqual(context.statuses.at(-1), { state: "error", message });
    assert.equal(JSON.stringify(context.statuses).includes("cus_secret"), false);
  });
}

test("SubscriptionCard cobre estados e copies oficiais sem CTA administrativo", async () => {
  const source = await readFile("src/components/SubscriptionCard.tsx", "utf8");
  for (const value of [
    "ADMIN_BYPASS", "Acesso administrativo", "BeautyPro — Administração",
    "TRIAL_ACTIVE", "Teste grátis ativo", "Assinar BeautyPro",
    "Assinatura ativa", "BeautyPro Start ativo", "Gerenciar assinatura",
    "legacy_grant", "Acesso BeautyPro ativo",
    "PAST_DUE_GRACE", "Pagamento pendente", "Regularizar pagamento",
    "BLOCKED", "Acesso comercial inativo", "Regularizar assinatura",
  ]) assert.equal(source.includes(value), true, `copy/estado ausente: ${value}`);

  const adminBlock = source.slice(source.indexOf('data.state === "ADMIN_BYPASS"'), source.indexOf('data.state === "TRIAL_ACTIVE"'));
  assert.equal(adminBlock.includes("action:"), false);
  assert.equal(source.includes('disabled={content.action === "portal" && portalLoading}'), true);
});

test("dashboard remove autoridade visual legada e reutiliza UpgradeModal", async () => {
  const source = await readFile("src/app/admin/dashboard/page.tsx", "utf8");
  for (const forbidden of ["pageData?.plan", "pageData as any)?.isPro", "userData?.trialDeadline", "isProPlan"]) {
    assert.equal(source.includes(forbidden), false, `autoridade legada encontrada: ${forbidden}`);
  }
  assert.equal(source.includes("useBillingStatus(user)"), true);
  assert.equal(source.includes("hasCommercialAccess"), true);
  assert.equal(source.includes("<SubscriptionCard"), true);
  assert.equal(source.includes("<UpgradeModal"), true);
  assert.equal(source.includes("setIsUpgradeModalOpen(true)"), true);
});
