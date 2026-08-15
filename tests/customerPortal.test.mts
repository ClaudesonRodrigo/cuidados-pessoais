import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  handleCustomerPortalRequest,
  InvalidCustomerPortalTokenError,
  resolveCustomerPortalConfig,
  verifyCustomerPortalIdToken,
  type CustomerPortalCustomer,
  type CustomerPortalDependencies,
} from "../src/lib/customerPortalService.ts";
import type { BillingRecord } from "../src/lib/billingTypes.ts";
import type { BillingCheckoutState } from "../src/lib/checkoutTypes.ts";

const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const CUSTOMER_ID = "cus_owner_a";
const TOKEN = "header.payload.signature";
const PORTAL_URL = "https://billing.stripe.com/p/session/test_portal";
const NOW = new Date("2026-08-14T12:00:00.000Z");

const billingRecord = (overrides: Partial<BillingRecord> = {}): BillingRecord => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  stripeCustomerId: CUSTOMER_ID,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const checkoutState = (
  overrides: Partial<BillingCheckoutState> = {},
): BillingCheckoutState => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  stripeCustomerId: CUSTOMER_ID,
  operationState: "READY",
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const customer = (
  overrides: Partial<CustomerPortalCustomer> = {},
): CustomerPortalCustomer => ({
  id: CUSTOMER_ID,
  deleted: false,
  livemode: false,
  metadata: {
    beautyProOwnerId: OWNER_ID,
    beautyProPageSlug: PAGE_SLUG,
  },
  ...overrides,
});

const setup = () => {
  let user: Record<string, unknown> | null = { role: "owner", pageSlug: PAGE_SLUG };
  let page: Record<string, unknown> | null = { userId: OWNER_ID, slug: PAGE_SLUG };
  let billing: BillingRecord | null = billingRecord();
  let state: BillingCheckoutState | null = checkoutState();
  let stripeCustomer: CustomerPortalCustomer | null = customer();
  const customerIds: string[] = [];
  const sessionInputs: Array<{ customer: string; returnUrl: string }> = [];
  const logged: Array<{ ownerId?: string; error: unknown }> = [];
  let portalUrl = PORTAL_URL;
  let stripeFailure: unknown;

  const dependencies: CustomerPortalDependencies = {
    async verifyIdToken() { return { uid: OWNER_ID }; },
    accounts: {
      async getUser() { return user; },
      async getPage() { return page; },
    },
    billing: {
      async getBillingByOwnerId() { return billing; },
    },
    checkoutState: {
      async get() { return state; },
    },
    stripe: {
      async retrieveCustomer(customerId) {
        customerIds.push(customerId);
        return stripeCustomer;
      },
      async createPortalSession(input) {
        sessionInputs.push(structuredClone(input));
        if (stripeFailure) throw stripeFailure;
        return { url: portalUrl };
      },
    },
    getConfig: () => ({ appUrl: "https://beautypro.test" }),
    logError: (entry) => logged.push(entry),
  };

  return {
    dependencies,
    customerIds,
    sessionInputs,
    logged,
    setUser(value: Record<string, unknown> | null) { user = value; },
    setPage(value: Record<string, unknown> | null) { page = value; },
    setBilling(value: BillingRecord | null) { billing = value; },
    setState(value: BillingCheckoutState | null) { state = value; },
    setCustomer(value: CustomerPortalCustomer | null) { stripeCustomer = value; },
    setPortalUrl(value: string) { portalUrl = value; },
    failStripe(value: unknown) { stripeFailure = value; },
  };
};

const request = (
  body: unknown | undefined = {},
  authorization = `Bearer ${TOKEN}`,
): Request => {
  const headers = new Headers({ authorization });
  if (body === undefined) {
    return new Request("https://attacker.example/api/billing/portal", {
      method: "POST",
      headers,
    });
  }
  headers.set("content-type", "application/json");
  return new Request("https://attacker.example/api/billing/portal", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

const execute = (context = setup(), portalRequest = request()) =>
  handleCustomerPortalRequest(portalRequest, context.dependencies);

const bodyOf = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

const assertError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await bodyOf(response) as { error: { code: string; message: string } };
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
};

test("sem Authorization retorna 401", async () => {
  await assertError(await execute(setup(), request({}, "")), 401, "UNAUTHORIZED");
});

for (const authorization of ["Bearer", "Basic abc", "Bearer token com espaco", "bearer token"]) {
  test(`Authorization malformada é rejeitada: ${authorization}`, async () => {
    await assertError(await execute(setup(), request({}, authorization)), 401, "UNAUTHORIZED");
  });
}

test("token Firebase estruturalmente inválido retorna 401", async () => {
  const context = setup();
  context.dependencies.verifyIdToken = (token) =>
    verifyCustomerPortalIdToken(token, async () => ({ uid: OWNER_ID }));
  await assertError(await execute(context, request({}, "Bearer invalido")), 401, "UNAUTHORIZED");
});

test("falha na verificação do token retorna 401", async () => {
  const context = setup();
  context.dependencies.verifyIdToken = async () => { throw new InvalidCustomerPortalTokenError(); };
  await assertError(await execute(context), 401, "UNAUTHORIZED");
});

test("owner válido abre o Portal", async () => {
  const response = await execute();
  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { url: PORTAL_URL });
});

test("superadmin oficial é rejeitado", async () => {
  const context = setup();
  context.dependencies.verifyIdToken = async () => ({ uid: "HYyAPj9xDEYKPTymoRdklZxxXR33" });
  await assertError(await execute(context), 403, "PORTAL_NOT_ALLOWED");
  assert.equal(context.sessionInputs.length, 0);
});

test("body vazio é aceito", async () => {
  assert.equal((await execute(setup(), request(undefined))).status, 200);
});

test("body {} é aceito", async () => {
  assert.equal((await execute(setup(), request({}))).status, 200);
});

for (const field of [
  "ownerId", "uid", "pageSlug", "stripeCustomerId", "customerId",
  "stripeSubscriptionId", "subscriptionId", "stripePriceId", "priceId",
  "returnUrl", "redirect", "callback", "origin",
]) {
  test(`campo de autoridade ${field} é rejeitado`, async () => {
    const context = setup();
    await assertError(await execute(context, request({ [field]: "attacker" })), 400, "INVALID_REQUEST");
    assert.equal(context.customerIds.length, 0);
  });
}

test("user ausente retorna ACCOUNT_NOT_READY", async () => {
  const context = setup();
  context.setUser(null);
  await assertError(await execute(context), 409, "ACCOUNT_NOT_READY");
});

test("pageSlug ausente retorna ACCOUNT_NOT_READY", async () => {
  const context = setup();
  context.setUser({ role: "owner" });
  await assertError(await execute(context), 409, "ACCOUNT_NOT_READY");
});

test("page ausente retorna ACCOUNT_NOT_READY", async () => {
  const context = setup();
  context.setPage(null);
  await assertError(await execute(context), 409, "ACCOUNT_NOT_READY");
});

for (const page of [
  { userId: "owner-b", slug: PAGE_SLUG },
  { userId: OWNER_ID, slug: "salao-b" },
]) {
  test("page divergente falha com TENANT_INCONSISTENT", async () => {
    const context = setup();
    context.setPage(page);
    await assertError(await execute(context), 409, "TENANT_INCONSISTENT");
  });
}

test("billing.pageSlug divergente falha fechado", async () => {
  const context = setup();
  context.setBilling(billingRecord({ pageSlug: "salao-b" }));
  await assertError(await execute(context), 409, "TENANT_INCONSISTENT");
});

test("checkoutState.pageSlug divergente falha fechado", async () => {
  const context = setup();
  context.setState(checkoutState({ pageSlug: "salao-b" }));
  await assertError(await execute(context), 409, "CUSTOMER_BINDING_CONFLICT");
});

test("billing e state com o mesmo Customer continuam", async () => {
  const context = setup();
  assert.equal((await execute(context)).status, 200);
  assert.deepEqual(context.customerIds, [CUSTOMER_ID]);
});

test("billing e state com Customers diferentes conflitam", async () => {
  const context = setup();
  context.setState(checkoutState({ stripeCustomerId: "cus_other" }));
  await assertError(await execute(context), 409, "CUSTOMER_BINDING_CONFLICT");
  assert.equal(context.customerIds.length, 0);
});

test("somente billing é aceito com binding completo", async () => {
  const context = setup();
  context.setState(null);
  assert.equal((await execute(context)).status, 200);
  assert.deepEqual(context.customerIds, [CUSTOMER_ID]);
});

test("somente checkoutState é aceito com binding completo", async () => {
  const context = setup();
  context.setBilling(null);
  assert.equal((await execute(context)).status, 200);
  assert.deepEqual(context.customerIds, [CUSTOMER_ID]);
});

test("nenhum Customer retorna PORTAL_NOT_AVAILABLE sem criar recursos", async () => {
  const context = setup();
  context.setBilling(billingRecord({ stripeCustomerId: undefined }));
  context.setState(checkoutState({ stripeCustomerId: undefined }));
  await assertError(await execute(context), 409, "PORTAL_NOT_AVAILABLE");
  assert.equal(context.customerIds.length, 0);
  assert.equal(context.sessionInputs.length, 0);
});

for (const [label, mutate] of [
  ["inexistente", (context: ReturnType<typeof setup>) => context.setCustomer(null)],
  ["deleted", (context: ReturnType<typeof setup>) => context.setCustomer(customer({ deleted: true }))],
  ["livemode", (context: ReturnType<typeof setup>) => context.setCustomer(customer({ livemode: true }))],
  ["id divergente", (context: ReturnType<typeof setup>) => context.setCustomer(customer({ id: "cus_other" }))],
] as const) {
  test(`Customer ${label} é rejeitado`, async () => {
    const context = setup();
    mutate(context);
    await assertError(await execute(context), 409, "CUSTOMER_BINDING_CONFLICT");
    assert.equal(context.sessionInputs.length, 0);
  });
}

test("metadata owner divergente é rejeitada", async () => {
  const context = setup();
  context.setCustomer(customer({ metadata: {
    beautyProOwnerId: "owner-b",
    beautyProPageSlug: PAGE_SLUG,
  } }));
  await assertError(await execute(context), 409, "CUSTOMER_BINDING_CONFLICT");
});

test("metadata page divergente é rejeitada", async () => {
  const context = setup();
  context.setCustomer(customer({ metadata: {
    beautyProOwnerId: OWNER_ID,
    beautyProPageSlug: "salao-b",
  } }));
  await assertError(await execute(context), 409, "CUSTOMER_BINDING_CONFLICT");
});

test("Portal Session recebe Customer canônico e return_url server-side", async () => {
  const context = setup();
  await execute(context, request({}, `Bearer ${TOKEN}`));
  assert.deepEqual(context.sessionInputs, [{
    customer: CUSTOMER_ID,
    returnUrl: "https://beautypro.test/admin/dashboard",
  }]);
});

test("sucesso retorna somente URL Stripe e Cache-Control no-store", async () => {
  const response = await execute();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await bodyOf(response), { url: PORTAL_URL });
});

test("URL de Portal inválida falha fechado", async () => {
  const context = setup();
  context.setPortalUrl("https://attacker.example/session");
  await assertError(await execute(context), 503, "BILLING_UNAVAILABLE");
});

test("falha Stripe é sanitizada", async () => {
  const context = setup();
  context.failStripe(new Error("sk_test_secret metadata completo"));
  const response = await execute(context);
  const serialized = JSON.stringify(await bodyOf(response));
  assert.equal(response.status, 503);
  assert.equal(serialized.includes("sk_test_secret"), false);
  assert.equal(serialized.includes("metadata completo"), false);
  assert.equal(context.logged.length, 1);
});

test("APP_URL HTTPS válido é aceito", () => {
  assert.deepEqual(resolveCustomerPortalConfig({
    STRIPE_SECRET_KEY: "sk_test_example",
    APP_URL: "https://beautypro.test/base?ignored=true",
  }), { appUrl: "https://beautypro.test/base" });
});

test("APP_URL HTTP externo é rejeitado", () => {
  assert.throws(() => resolveCustomerPortalConfig({
    STRIPE_SECRET_KEY: "sk_test_example",
    APP_URL: "http://evil.example",
  }), /HTTPS/);
});

for (const hostname of ["localhost", "127.0.0.1"]) {
  test(`${hostname} HTTP é permitido em dev/test`, () => {
    assert.deepEqual(resolveCustomerPortalConfig({
      STRIPE_SECRET_KEY: "sk_test_example",
      APP_URL: `http://${hostname}:3000`,
      NODE_ENV: "test",
    }), { appUrl: `http://${hostname}:3000` });
  });
}

test("produção sem URL válida é rejeitada", () => {
  assert.throws(() => resolveCustomerPortalConfig({
    STRIPE_SECRET_KEY: "sk_test_example",
    NODE_ENV: "production",
  }), /não configurada/);
});

test("configuração Live é rejeitada", () => {
  assert.throws(() => resolveCustomerPortalConfig({
    STRIPE_SECRET_KEY: "sk_live_forbidden",
    APP_URL: "https://beautypro.test",
  }), /Test Mode/);
});

test("config inválida vira BILLING_CONFIG_INVALID sanitizado", async () => {
  const context = setup();
  context.dependencies.getConfig = () => { throw new Error("sk_live_secret"); };
  const response = await execute(context);
  const serialized = JSON.stringify(await bodyOf(response));
  assert.equal(response.status, 503);
  assert.equal(serialized.includes("sk_live_secret"), false);
});

test("rota expõe somente POST e GET responde 405 sem cache", async () => {
  const source = await readFile("src/app/api/billing/portal/route.ts", "utf8");
  assert.equal(source.includes("export const POST"), true);
  assert.equal(source.includes("export const GET"), true);
  assert.equal(source.includes("status: 405"), true);
  assert.equal(source.includes('Allow: "POST"'), true);
  assert.equal(source.includes('"Cache-Control": "no-store"'), true);
});

test("rota cria somente Billing Portal Session com autoridade server-side", async () => {
  const source = await readFile("src/app/api/billing/portal/route.ts", "utf8");
  assert.equal(source.includes("billingPortal.sessions.create"), true);
  assert.equal(source.includes("checkout.sessions.create"), false);
  assert.equal(source.includes("subscriptions"), false);
  assert.equal(source.includes('request.headers.get("host")'), false);
  assert.equal(source.includes("return_url: input.returnUrl"), true);
});
