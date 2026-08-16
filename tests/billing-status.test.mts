import assert from "node:assert/strict";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  handleBillingStatusRequest,
  InvalidBillingStatusTokenError,
  resolveBillingStatus,
  verifyBillingStatusIdToken,
  type BillingStatusDependencies,
} from "../src/lib/billingStatusService.ts";
import type { BillingRecord } from "../src/lib/billingTypes.ts";
import type { BillingCheckoutState } from "../src/lib/checkoutTypes.ts";

const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const TOKEN = "header.payload.signature";
const NOW = new Date("2026-08-15T12:00:00.000Z");

const billingRecord = (overrides: Partial<BillingRecord> = {}): BillingRecord => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const checkoutState = (
  overrides: Partial<BillingCheckoutState> = {},
): BillingCheckoutState => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  operationState: "READY",
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const setup = () => {
  let identity = { uid: OWNER_ID };
  let user: Record<string, unknown> | null = {
    role: "owner",
    pageSlug: PAGE_SLUG,
    plan: "free",
  };
  let page: Record<string, unknown> | null = {
    userId: OWNER_ID,
    slug: PAGE_SLUG,
    plan: "free",
  };
  let billing: BillingRecord | null = null;
  let state: BillingCheckoutState | null = null;
  let stripeCustomer = {
    id: "cus_owner_a",
    deleted: false,
    livemode: false,
    metadata: {
      beautyProOwnerId: OWNER_ID,
      beautyProPageSlug: PAGE_SLUG,
    },
  } as { id: string; deleted: boolean; livemode: boolean; metadata: Record<string, string> } | null;
  const calls = {
    userUids: [] as string[],
    pageSlugs: [] as string[],
    billingOwnerIds: [] as string[],
    checkoutOwnerIds: [] as string[],
    customerIds: [] as string[],
  };
  const logged: Array<{ ownerId?: string; error: unknown }> = [];

  const dependencies: BillingStatusDependencies = {
    async verifyIdToken() { return identity; },
    accounts: {
      async getUser(uid) { calls.userUids.push(uid); return user; },
      async getPage(pageSlug) { calls.pageSlugs.push(pageSlug); return page; },
    },
    billing: {
      async getBillingByOwnerId(ownerId) { calls.billingOwnerIds.push(ownerId); return billing; },
    },
    checkoutState: {
      async get(ownerId) { calls.checkoutOwnerIds.push(ownerId); return state; },
    },
    stripe: {
      async retrieveCustomer(customerId) {
        calls.customerIds.push(customerId);
        return stripeCustomer;
      },
    },
    now: () => NOW,
    logError: (entry) => logged.push(entry),
  };

  return {
    dependencies,
    calls,
    logged,
    setIdentity(uid: string) { identity = { uid }; },
    setUser(value: Record<string, unknown> | null) { user = value; },
    setPage(value: Record<string, unknown> | null) { page = value; },
    setBilling(value: BillingRecord | null) { billing = value; },
    setState(value: BillingCheckoutState | null) { state = value; },
    setCustomer(value: typeof stripeCustomer) { stripeCustomer = value; },
  };
};

const portalCustomer = (overrides: Partial<{
  id: string; deleted: boolean; livemode: boolean; metadata: Record<string, string>;
}> = {}) => ({
  id: "cus_owner_a",
  deleted: false,
  livemode: false,
  metadata: {
    beautyProOwnerId: OWNER_ID,
    beautyProPageSlug: PAGE_SLUG,
  },
  ...overrides,
});

const request = (authorization = `Bearer ${TOKEN}`) =>
  new Request("https://beautypro.test/api/billing/status", {
    method: "GET",
    headers: authorization ? { authorization } : {},
  });

const execute = (context = setup(), authorization?: string) =>
  handleBillingStatusRequest(request(authorization), context.dependencies);

const bodyOf = (response: Response) => response.json() as Promise<Record<string, unknown>>;

const activeCustomerContext = () => {
  const context = setup();
  context.setBilling(billingRecord({ status: "active", stripeCustomerId: "cus_owner_a" }));
  context.setState(checkoutState({ stripeCustomerId: "cus_owner_a" }));
  return context;
};

test("sem token retorna 401 e no-store", async () => {
  const response = await execute(setup(), "");
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await bodyOf(response) as { error: { code: string } }).error.code, "UNAUTHORIZED");
});

test("token inválido retorna 401", async () => {
  const context = setup();
  context.dependencies.verifyIdToken = async () => { throw new InvalidBillingStatusTokenError(); };
  const response = await execute(context);
  assert.equal(response.status, 401);
  assert.equal((await bodyOf(response) as { error: { code: string } }).error.code, "UNAUTHORIZED");
});

test("verificador rejeita token estruturalmente inválido", async () => {
  await assert.rejects(
    verifyBillingStatusIdToken("invalido", async () => ({ uid: OWNER_ID })),
    InvalidBillingStatusTokenError,
  );
});

test("superadmin recebe ADMIN_BYPASS sem exigir conta ou Customer", async () => {
  const context = setup();
  context.setIdentity(OFFICIAL_SUPERADMIN_UID);
  context.setUser(null);
  context.setPage(null);
  const body = await bodyOf(await execute(context));
  assert.deepEqual(body, {
    state: "ADMIN_BYPASS",
    source: "superadmin",
    requiresPaymentAction: false,
    canOpenPortal: false,
    canSubscribe: false,
  });
});

for (const status of ["active", "trialing"] as const) {
  test(`Stripe ${status} produz ACTIVE e Portal disponível`, async () => {
    const context = setup();
    context.setBilling(billingRecord({
      status,
      stripeCustomerId: "cus_owner_a",
      stripeSubscriptionId: "sub_secret",
      stripePriceId: "price_secret",
      currentPeriodEnd: new Date("2026-09-15T00:00:00.000Z"),
    }));
    context.setState(checkoutState({ stripeCustomerId: "cus_owner_a" }));
    const response = await execute(context);
    const body = await bodyOf(response);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body.state, "ACTIVE");
    assert.equal(body.source, "stripe");
    assert.equal(body.billingStatus, status);
    assert.equal(body.accessUntil, "2026-09-15T00:00:00.000Z");
    assert.equal(body.canOpenPortal, true);
    assert.equal(body.canSubscribe, false);
    const serialized = JSON.stringify(body);
    for (const secretField of ["ownerId", "pageSlug", "customerId", "subscriptionId", "priceId", "cus_owner_a", "sub_secret", "price_secret"]) {
      assert.equal(serialized.includes(secretField), false);
    }
  });
}

test("past_due com menos de 72h produz PAST_DUE_GRACE", async () => {
  const context = setup();
  context.setBilling(billingRecord({
    status: "past_due",
    pastDueSince: new Date(NOW.getTime() - 71 * 60 * 60 * 1_000),
    stripeCustomerId: "cus_owner_a",
  }));
  const body = await resolveBillingStatus({ uid: OWNER_ID }, context.dependencies);
  assert.equal(body.state, "PAST_DUE_GRACE");
  assert.equal(body.requiresPaymentAction, true);
  assert.equal(body.canOpenPortal, true);
  assert.equal(body.canSubscribe, false);
});

test("past_due a partir de 72h fica BLOCKED sem fallback", async () => {
  const context = setup();
  context.setBilling(billingRecord({
    status: "past_due",
    pastDueSince: new Date(NOW.getTime() - 72 * 60 * 60 * 1_000),
    stripeCustomerId: "cus_owner_a",
  }));
  const body = await resolveBillingStatus({ uid: OWNER_ID }, context.dependencies);
  assert.equal(body.state, "BLOCKED");
  assert.equal(body.canOpenPortal, true);
  assert.equal(body.canSubscribe, false);
});

test("grant legado concordante produz ACTIVE sem afirmar Stripe", async () => {
  const context = setup();
  context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro" });
  context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro" });
  const body = await resolveBillingStatus({ uid: OWNER_ID }, context.dependencies);
  assert.equal(body.state, "ACTIVE");
  assert.equal(body.source, "legacy_grant");
  assert.equal(body.canSubscribe, true);
});

test("trial promocional concordante produz TRIAL_ACTIVE sem pressupor Portal", async () => {
  const context = setup();
  const deadline = new Date(NOW.getTime() + 24 * 60 * 60 * 1_000);
  context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro", trialDeadline: deadline });
  context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro", trialDeadline: deadline });
  const body = await resolveBillingStatus({ uid: OWNER_ID }, context.dependencies);
  assert.equal(body.state, "TRIAL_ACTIVE");
  assert.equal(body.source, "promotional_trial");
  assert.equal(body.canOpenPortal, false);
  assert.equal(body.canSubscribe, true);
});

test("sem acesso fica BLOCKED e pode assinar quando Checkout permite", async () => {
  const body = await resolveBillingStatus({ uid: OWNER_ID }, setup().dependencies);
  assert.equal(body.state, "BLOCKED");
  assert.equal(body.canOpenPortal, false);
  assert.equal(body.canSubscribe, true);
});

test("Stripe prevalece sobre grant legado", async () => {
  const context = setup();
  context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro" });
  context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro" });
  context.setBilling(billingRecord({ status: "active" }));
  const body = await resolveBillingStatus({ uid: OWNER_ID }, context.dependencies);
  assert.equal(body.source, "stripe");
});

test("Customers divergentes falham fechado", async () => {
  const context = setup();
  context.setBilling(billingRecord({ status: "active", stripeCustomerId: "cus_a" }));
  context.setState(checkoutState({ stripeCustomerId: "cus_b" }));
  assert.deepEqual(await resolveBillingStatus({ uid: OWNER_ID }, context.dependencies), {
    state: "BLOCKED",
    source: "none",
    requiresPaymentAction: false,
    canOpenPortal: false,
    canSubscribe: false,
  });
});

test("consultas críticas usam exclusivamente UID autenticado e pageSlug server-side", async () => {
  const context = activeCustomerContext();
  await resolveBillingStatus({ uid: OWNER_ID }, context.dependencies);
  assert.deepEqual(context.calls.userUids, [OWNER_ID]);
  assert.deepEqual(context.calls.pageSlugs, [PAGE_SLUG]);
  assert.deepEqual(context.calls.billingOwnerIds, [OWNER_ID]);
  assert.deepEqual(context.calls.checkoutOwnerIds, [OWNER_ID]);
  assert.deepEqual(context.calls.customerIds, ["cus_owner_a"]);
});

for (const [label, mutate] of [
  ["billing.ownerId divergente", (context: ReturnType<typeof setup>) => {
    context.setBilling(billingRecord({ ownerId: "owner-b", status: "active", stripeCustomerId: "cus_owner_a" }));
  }],
  ["billing.pageSlug divergente", (context: ReturnType<typeof setup>) => {
    context.setBilling(billingRecord({ pageSlug: "salao-b", status: "active", stripeCustomerId: "cus_owner_a" }));
  }],
  ["checkoutState.ownerId divergente", (context: ReturnType<typeof setup>) => {
    context.setState(checkoutState({ ownerId: "owner-b", stripeCustomerId: "cus_owner_a" }));
  }],
  ["checkoutState.pageSlug divergente", (context: ReturnType<typeof setup>) => {
    context.setState(checkoutState({ pageSlug: "salao-b", stripeCustomerId: "cus_owner_a" }));
  }],
] as const) {
  test(label + " falha fechado antes de consultar Stripe", async () => {
    const context = activeCustomerContext();
    mutate(context);
    const body = await resolveBillingStatus({ uid: OWNER_ID }, context.dependencies);
    assert.equal(body.state, "BLOCKED");
    assert.equal(body.canOpenPortal, false);
    assert.equal(body.canSubscribe, false);
    assert.deepEqual(context.calls.customerIds, []);
  });
}

for (const [label, customer] of [
  ["inexistente", null],
  ["deleted", portalCustomer({ deleted: true })],
  ["livemode", portalCustomer({ livemode: true })],
  ["ID divergente", portalCustomer({ id: "cus_other" })],
  ["metadata owner divergente", portalCustomer({ metadata: {
    beautyProOwnerId: "owner-b",
    beautyProPageSlug: PAGE_SLUG,
  } })],
  ["metadata page divergente", portalCustomer({ metadata: {
    beautyProOwnerId: OWNER_ID,
    beautyProPageSlug: "salao-b",
  } })],
] as const) {
  test("Customer " + label + " não publica canOpenPortal", async () => {
    const context = activeCustomerContext();
    context.setCustomer(customer);
    const body = await resolveBillingStatus({ uid: OWNER_ID }, context.dependencies);
    assert.equal(body.canOpenPortal, false);
    assert.equal(body.state, "BLOCKED");
    assert.deepEqual(context.calls.customerIds, ["cus_owner_a"]);
  });
}

test("Customer válido e coerente publica canOpenPortal", async () => {
  const context = activeCustomerContext();
  context.setCustomer(portalCustomer());
  const body = await resolveBillingStatus({ uid: OWNER_ID }, context.dependencies);
  assert.equal(body.canOpenPortal, true);
  assert.equal(body.state, "ACTIVE");
  assert.deepEqual(context.calls.customerIds, ["cus_owner_a"]);
});

test("falha interna é sanitizada", async () => {
  const context = setup();
  context.dependencies.billing.getBillingByOwnerId = async () => {
    throw new Error("cus_secret metadata stack");
  };
  const response = await execute(context);
  const serialized = JSON.stringify(await bodyOf(response));
  assert.equal(response.status, 503);
  assert.equal(serialized.includes("cus_secret"), false);
  assert.equal(serialized.includes("metadata"), false);
  assert.equal(context.logged.length, 1);
});
