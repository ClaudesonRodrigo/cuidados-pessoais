import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  resolveCheckoutAppUrl,
  resolveCheckoutServerConfig,
} from "../src/lib/checkoutConfigCore.ts";
import {
  handleCheckoutRequest,
  InvalidCheckoutTokenError,
  resolvePromotionalTrial,
  type CheckoutErrorCode,
} from "../src/lib/checkoutService.ts";
import type {
  BillingCheckoutState,
  CheckoutDependencies,
  CheckoutOperationalStore,
  CheckoutSessionCreateInput,
  CheckoutStripeGateway,
  HostedCheckoutSession,
} from "../src/lib/checkoutTypes.ts";
import type { BillingRecord, StripeBillingStatus } from "../src/lib/billingTypes.ts";

type Data = Record<string, unknown>;

const NOW = new Date("2099-04-10T12:00:00.000Z");
const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const TOKEN = "header.payload.signature";
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_default";
const DAY_MS = 24 * 60 * 60 * 1_000;

const metadata = () => ({
  beautyProOwnerId: OWNER_ID,
  beautyProPageSlug: PAGE_SLUG,
});

const hostedSession = (
  attemptId: string,
  overrides: Partial<HostedCheckoutSession> = {},
): HostedCheckoutSession => ({
  id: `cs_${attemptId}`,
  url: CHECKOUT_URL,
  status: "open",
  expiresAt: 4_000_000_000,
  customerId: "cus_owner_a",
  livemode: false,
  mode: "subscription",
  clientReferenceId: OWNER_ID,
  metadata: { ...metadata(), beautyProCheckoutAttemptId: attemptId },
  priceIds: ["price_beautypro"],
  ...overrides,
});

const operationState = (overrides: Partial<BillingCheckoutState> = {}): BillingCheckoutState => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  stripeCustomerId: "cus_owner_a",
  customerProvisioningKey: "customer-key",
  operationState: "READY",
  createdAt: new Date("2099-04-01T00:00:00.000Z"),
  updatedAt: NOW,
  ...overrides,
});

class MemoryOperations implements CheckoutOperationalStore {
  state: BillingCheckoutState | null = null;
  recordFailuresRemaining = 0;
  provisioningProposals: string[] = [];
  attemptProposals: string[] = [];

  async get(ownerId: string) {
    assert.equal(ownerId, OWNER_ID);
    return this.state ? structuredClone(this.state) : null;
  }

  async reserveCustomer(input: Parameters<CheckoutOperationalStore["reserveCustomer"]>[0]) {
    this.provisioningProposals.push(input.proposedProvisioningKey);
    if (this.state) {
      assert.equal(this.state.ownerId, input.ownerId);
      assert.equal(this.state.pageSlug, input.pageSlug);
      if (this.state.stripeCustomerId || this.state.customerProvisioningKey) {
        return structuredClone(this.state);
      }
    }
    this.state = {
      ownerId: input.ownerId,
      pageSlug: input.pageSlug,
      customerProvisioningKey: input.proposedProvisioningKey,
      operationState: "CUSTOMER_PROVISIONING",
      operationStartedAt: input.now,
      operationLeaseUntil: input.leaseUntil,
      createdAt: this.state?.createdAt ?? input.now,
      updatedAt: input.now,
    };
    return structuredClone(this.state);
  }

  async bindCustomer(input: Parameters<CheckoutOperationalStore["bindCustomer"]>[0]) {
    assert.ok(this.state);
    assert.equal(this.state.customerProvisioningKey, input.provisioningKey);
    if (this.state.stripeCustomerId) assert.equal(this.state.stripeCustomerId, input.stripeCustomerId);
    this.state = {
      ...this.state,
      stripeCustomerId: input.stripeCustomerId,
      operationState: "READY",
      operationStartedAt: undefined,
      operationLeaseUntil: undefined,
      updatedAt: input.now,
    };
    return structuredClone(this.state);
  }

  async reserveCheckoutAttempt(
    input: Parameters<CheckoutOperationalStore["reserveCheckoutAttempt"]>[0],
  ) {
    this.attemptProposals.push(input.proposedAttemptId);
    assert.ok(this.state?.stripeCustomerId);
    if (this.state.checkoutAttemptId) {
      if (!input.replaceAttemptId || this.state.checkoutAttemptId !== input.replaceAttemptId) {
        return structuredClone(this.state);
      }
    }
    this.state = {
      ownerId: input.ownerId,
      pageSlug: input.pageSlug,
      stripeCustomerId: this.state.stripeCustomerId,
      customerProvisioningKey: this.state.customerProvisioningKey,
      checkoutAttemptId: input.proposedAttemptId,
      checkoutExpiresAt: input.expiresAt,
      checkoutTrialEnd: input.trialEnd,
      checkoutTrialPeriodDays: input.trialPeriodDays,
      operationState: "CHECKOUT_PROVISIONING",
      operationStartedAt: input.now,
      operationLeaseUntil: input.leaseUntil,
      createdAt: this.state.createdAt,
      updatedAt: input.now,
    };
    return structuredClone(this.state);
  }

  async recordCheckoutSession(
    input: Parameters<CheckoutOperationalStore["recordCheckoutSession"]>[0],
  ) {
    if (this.recordFailuresRemaining > 0) {
      this.recordFailuresRemaining -= 1;
      throw new Error("synthetic persistence crash");
    }
    assert.ok(this.state);
    assert.equal(this.state.checkoutAttemptId, input.checkoutAttemptId);
    if (this.state.checkoutSessionId) assert.equal(this.state.checkoutSessionId, input.sessionId);
    this.state = {
      ...this.state,
      checkoutSessionId: input.sessionId,
      checkoutSessionUrl: input.sessionUrl,
      checkoutExpiresAt: input.expiresAt,
      operationState: "CHECKOUT_OPEN",
      operationStartedAt: undefined,
      operationLeaseUntil: undefined,
      updatedAt: input.now,
    };
    return structuredClone(this.state);
  }
}

class FakeStripe implements CheckoutStripeGateway {
  price = {
    id: "price_beautypro",
    active: true,
    currency: "brl",
    unitAmount: 2_990,
    recurringInterval: "month",
    livemode: false,
  };
  customers = new Map<string, { id: string; deleted: boolean; livemode: boolean; metadata: Record<string, string> }>();
  subscriptions = new Map<string, { id: string; status: StripeBillingStatus; customerId?: string }>();
  sessions = new Map<string, HostedCheckoutSession>();
  customerByKey = new Map<string, string>();
  sessionByKey = new Map<string, string>();
  customerCreateInputs: Array<{ input: Data; key: string }> = [];
  sessionCreateInputs: Array<{ input: CheckoutSessionCreateInput; key: string }> = [];
  calls = { price: 0, customerRetrieve: 0, customerCreate: 0, subscription: 0, subscriptionList: 0, sessionRetrieve: 0, sessionCreate: 0 };
  throwOnSessionCreate: Error | null = null;
  throwOnSubscriptionList: Error | null = null;

  async retrievePrice() {
    this.calls.price += 1;
    return structuredClone(this.price);
  }
  async retrieveCustomer(customerId: string) {
    this.calls.customerRetrieve += 1;
    const customer = this.customers.get(customerId);
    return customer ? structuredClone(customer) : null;
  }
  async createCustomer(input: { email?: string; name?: string; metadata: Record<string, string> }, key: string) {
    this.calls.customerCreate += 1;
    this.customerCreateInputs.push({ input: structuredClone(input), key });
    const existingId = this.customerByKey.get(key);
    if (existingId) return structuredClone(this.customers.get(existingId)!);
    const id = `cus_${this.customerByKey.size + 1}`;
    const customer = { id, deleted: false, livemode: false, metadata: structuredClone(input.metadata) };
    this.customerByKey.set(key, id);
    this.customers.set(id, customer);
    return structuredClone(customer);
  }
  async retrieveSubscription(subscriptionId: string) {
    this.calls.subscription += 1;
    const subscription = this.subscriptions.get(subscriptionId);
    return subscription ? structuredClone(subscription) : null;
  }
  async listCustomerSubscriptions(customerId: string) {
    this.calls.subscriptionList += 1;
    if (this.throwOnSubscriptionList) throw this.throwOnSubscriptionList;
    return [...this.subscriptions.values()]
      .filter((subscription) => subscription.customerId === customerId)
      .map((subscription) => structuredClone(subscription));
  }
  async retrieveSession(sessionId: string) {
    this.calls.sessionRetrieve += 1;
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }
  async createSession(input: CheckoutSessionCreateInput, key: string) {
    this.calls.sessionCreate += 1;
    this.sessionCreateInputs.push({ input: structuredClone(input), key });
    if (this.throwOnSessionCreate) throw this.throwOnSessionCreate;
    const existingId = this.sessionByKey.get(key);
    if (existingId) return structuredClone(this.sessions.get(existingId)!);
    const id = `cs_test_${this.sessionByKey.size + 1}`;
    const session = {
      id,
      url: `https://checkout.stripe.com/c/pay/${id}`,
      status: "open",
      expiresAt: input.expiresAt,
      customerId: input.customer,
      livemode: false,
      mode: input.mode,
      clientReferenceId: input.clientReferenceId,
      metadata: structuredClone(input.metadata),
      priceIds: [input.priceId],
    };
    this.sessionByKey.set(key, id);
    this.sessions.set(id, session);
    return structuredClone(session);
  }
}

const makeBilling = (status?: StripeBillingStatus, overrides: Partial<BillingRecord> = {}): BillingRecord => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  status,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const setup = () => {
  const stripe = new FakeStripe();
  const operations = new MemoryOperations();
  let user: Data | null = {
    role: "owner",
    pageSlug: PAGE_SLUG,
    email: "owner@example.com",
    displayName: "Owner A",
  };
  let page: Data | null = { userId: OWNER_ID, slug: PAGE_SLUG };
  let billingRecord: BillingRecord | null = null;
  let provisioningSequence = 0;
  let attemptSequence = 0;
  let billingReads = 0;
  const logged: Array<{ ownerId?: string; error: unknown }> = [];

  const dependencies: CheckoutDependencies = {
    verifyIdToken: async (token) => {
      if (token !== TOKEN) throw new InvalidCheckoutTokenError();
      return { uid: OWNER_ID, email: "token-owner@example.com" };
    },
    accounts: {
      getUser: async () => user,
      getPage: async () => page,
    },
    operations,
    billing: {
      async getBillingByOwnerId() {
        billingReads += 1;
        return billingRecord;
      },
    },
    stripe,
    getConfig: () => ({ priceId: "price_beautypro", appUrl: "https://preview.beautypro.test" }),
    now: () => NOW,
    createProvisioningKey: () => `provision-${++provisioningSequence}`,
    createCheckoutAttemptId: () => `attempt-${++attemptSequence}`,
    logError: (context) => logged.push(context),
  };

  return {
    dependencies,
    operations,
    stripe,
    logged,
    get billingReads() { return billingReads; },
    setUser(value: Data | null) { user = value; },
    setPage(value: Data | null) { page = value; },
    setBilling(value: BillingRecord | null) { billingRecord = value; },
  };
};

const request = (body: unknown = {}, authorization = `Bearer ${TOKEN}`, url = "https://evil.example/api/billing/checkout") =>
  new Request(url, {
    method: "POST",
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const execute = (context: ReturnType<typeof setup>, body: unknown = {}, authorization = `Bearer ${TOKEN}`) =>
  handleCheckoutRequest(request(body, authorization), context.dependencies);

const rawRequest = (body: string, contentType = "application/json") => new Request(
  "https://beautypro.test/api/billing/checkout",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": contentType },
    body,
  },
);

const responseBody = (response: Response) => response.json() as Promise<Record<string, any>>;

const assertError = async (response: Response, status: number, code: CheckoutErrorCode) => {
  assert.equal(response.status, status);
  assert.equal((await responseBody(response)).error.code, code);
};

const preloadCustomer = (context: ReturnType<typeof setup>, customerOverrides: Data = {}) => {
  context.operations.state = operationState();
  context.stripe.customers.set("cus_owner_a", {
    id: "cus_owner_a",
    deleted: false,
    livemode: false,
    metadata: metadata(),
    ...customerOverrides,
  });
};

test("T01 sem Authorization retorna 401 sem Stripe", async () => {
  const context = setup();
  await assertError(await execute(context, {}, ""), 401, "UNAUTHORIZED");
  assert.deepEqual(context.stripe.calls, { price: 0, customerRetrieve: 0, customerCreate: 0, subscription: 0, subscriptionList: 0, sessionRetrieve: 0, sessionCreate: 0 });
});

test("T02 token inválido retorna 401", async () => {
  const context = setup();
  await assertError(await execute(context, {}, "Bearer invalid.token.value"), 401, "UNAUTHORIZED");
});

test("T03 customer final não pode criar Checkout", async () => {
  const context = setup();
  context.setUser({ role: "customer" });
  await assertError(await execute(context), 403, "CHECKOUT_NOT_ALLOWED");
});

test("T04 superadmin não cria Customer ou Checkout", async () => {
  const context = setup();
  context.dependencies.verifyIdToken = async () => ({ uid: OFFICIAL_SUPERADMIN_UID });
  await assertError(await execute(context), 403, "CHECKOUT_NOT_ALLOWED");
  assert.equal(context.stripe.calls.customerCreate + context.stripe.calls.sessionCreate, 0);
});

test("T05 owner válido recebe URL", async () => {
  const response = await execute(setup());
  assert.equal(response.status, 200);
  assert.match((await responseBody(response)).url, /^https:\/\/checkout\.stripe\.com\//);
});

for (const key of ["ownerId", "pageSlug", "priceId", "stripeCustomerId", "metadata", "successUrl"]) {
  test(`browser não controla ${key}`, async () => {
    const context = setup();
    await assertError(await execute(context, { [key]: "attacker" }), 400, "INVALID_REQUEST");
    assert.equal(context.stripe.calls.price, 0);
  });
}

test("T10 tenant divergente retorna TENANT_INCONSISTENT", async () => {
  const context = setup();
  context.setPage({ userId: "owner-b", slug: PAGE_SLUG });
  await assertError(await execute(context), 409, "TENANT_INCONSISTENT");
});

test("T11 página inexistente retorna ACCOUNT_NOT_READY", async () => {
  const context = setup();
  context.setPage(null);
  await assertError(await execute(context), 409, "ACCOUNT_NOT_READY");
});

test("conta owner inexistente retorna ACCOUNT_NOT_READY", async () => {
  const context = setup();
  context.setUser(null);
  await assertError(await execute(context), 409, "ACCOUNT_NOT_READY");
});

test("T12 Customer existente válido é reutilizado", async () => {
  const context = setup();
  preloadCustomer(context);
  assert.equal((await execute(context)).status, 200);
  assert.equal(context.stripe.calls.customerCreate, 0);
  assert.equal(context.stripe.sessionCreateInputs[0].input.customer, "cus_owner_a");
});

test("T13 sem Customer cria e persiste canônico", async () => {
  const context = setup();
  assert.equal((await execute(context)).status, 200);
  assert.equal(context.stripe.customers.size, 1);
  assert.equal(context.operations.state?.stripeCustomerId, "cus_1");
});

test("T14 requests concorrentes produzem um Customer canônico", async () => {
  const context = setup();
  const responses = await Promise.all([execute(context), execute(context)]);
  assert.deepEqual(responses.map((item) => item.status), [200, 200]);
  assert.equal(context.stripe.customers.size, 1);
  assert.equal(new Set(context.stripe.customerCreateInputs.map((item) => item.key)).size, 1);
});

for (const overrides of [{ deleted: true }, { metadata: {} }]) {
  test(`Customer inválido falha fechado: ${JSON.stringify(overrides)}`, async () => {
    const context = setup();
    preloadCustomer(context, overrides);
    await assertError(await execute(context), 409, "CUSTOMER_BINDING_CONFLICT");
    assert.equal(context.stripe.calls.sessionCreate, 0);
  });
}

test("T16 metadata contraditória falha fechado", async () => {
  const context = setup();
  preloadCustomer(context, { metadata: { beautyProOwnerId: "owner-b", beautyProPageSlug: PAGE_SLUG } });
  await assertError(await execute(context), 409, "CUSTOMER_BINDING_CONFLICT");
});

for (const [status, code] of [
  ["active", "ALREADY_SUBSCRIBED"],
  ["trialing", "ALREADY_SUBSCRIBED"],
  ["past_due", "PAYMENT_REQUIRES_ACTION"],
  ["unpaid", "PAYMENT_REQUIRES_ACTION"],
  ["paused", "SUBSCRIPTION_REQUIRES_ACTION"],
  ["incomplete", "SUBSCRIPTION_INCOMPLETE"],
] as const) {
  test(`status ${status} impede nova assinatura`, async () => {
    const context = setup();
    context.setBilling(makeBilling(status));
    await assertError(await execute(context), 409, code);
    assert.equal(context.stripe.calls.sessionCreate, 0);
  });
}

for (const status of ["incomplete_expired", "canceled"] as const) {
  test(`status ${status} permite Checkout`, async () => {
    const context = setup();
    context.setBilling(makeBilling(status));
    assert.equal((await execute(context)).status, 200);
  });
}

test("Subscription Stripe autoritativa impede duplicidade mesmo com billing canceled", async () => {
  const context = setup();
  preloadCustomer(context);
  context.setBilling(makeBilling("canceled", {
    stripeCustomerId: "cus_owner_a",
    stripeSubscriptionId: "sub_existing",
  }));
  context.stripe.subscriptions.set("sub_existing", {
    id: "sub_existing",
    status: "active",
    customerId: "cus_owner_a",
  });
  await assertError(await execute(context), 409, "ALREADY_SUBSCRIBED");
});

const subscriptionScenario = (
  statuses: StripeBillingStatus[],
  billing: BillingRecord | null = null,
) => {
  const context = setup();
  preloadCustomer(context);
  context.setBilling(billing);
  statuses.forEach((status, index) => context.stripe.subscriptions.set(`sub_${index}`, {
    id: `sub_${index}`,
    status,
    customerId: "cus_owner_a",
  }));
  return context;
};

test("billing inexistente + Customer active é bloqueado pela listagem autoritativa", async () => {
  await assertError(await execute(subscriptionScenario(["active"])), 409, "ALREADY_SUBSCRIBED");
});

test("billing sem subscriptionId + Customer trialing é bloqueado", async () => {
  const context = subscriptionScenario(["trialing"], makeBilling("canceled"));
  await assertError(await execute(context), 409, "ALREADY_SUBSCRIBED");
});

for (const statuses of [
  ["canceled"],
  ["incomplete_expired"],
  ["canceled", "incomplete_expired"],
] as StripeBillingStatus[][]) {
  test(`Subscriptions não bloqueantes permitem Checkout: ${statuses.join("+")}`, async () => {
    assert.equal((await execute(subscriptionScenario(statuses))).status, 200);
  });
}

test("canceled + past_due prioriza PAYMENT_REQUIRES_ACTION", async () => {
  await assertError(
    await execute(subscriptionScenario(["canceled", "past_due"])),
    409,
    "PAYMENT_REQUIRES_ACTION",
  );
});

test("múltiplas active permanecem bloqueadas", async () => {
  await assertError(
    await execute(subscriptionScenario(["active", "active"])),
    409,
    "ALREADY_SUBSCRIBED",
  );
});

test("erro ao listar Subscriptions falha fechado", async () => {
  const context = subscriptionScenario([]);
  context.stripe.throwOnSubscriptionList = new Error("falha Stripe interna");
  await assertError(await execute(context), 503, "BILLING_UNAVAILABLE");
  assert.equal(context.stripe.calls.sessionCreate, 0);
});

test("Customer sem Subscription pode abrir Checkout", async () => {
  const context = subscriptionScenario([]);
  assert.equal((await execute(context)).status, 200);
  assert.equal(context.stripe.calls.subscriptionList > 0, true);
});

test("billing active stale não vence Stripe autoritativa com somente canceled", async () => {
  const context = subscriptionScenario(["canceled"], makeBilling("active", {
    stripeCustomerId: "cus_owner_a",
  }));
  assert.equal((await execute(context)).status, 200);
});

test("subscriptionId local apontando para outro Customer falha fechado", async () => {
  const context = subscriptionScenario([], makeBilling("canceled", {
    stripeCustomerId: "cus_owner_a",
    stripeSubscriptionId: "sub_foreign",
  }));
  context.stripe.subscriptions.set("sub_foreign", {
    id: "sub_foreign", status: "canceled", customerId: "cus_other",
  });
  await assertError(await execute(context), 409, "CUSTOMER_BINDING_CONFLICT");
});

test("T25 legacy grant sem trial pode assinar sem trial novo", async () => {
  const context = setup();
  assert.equal((await execute(context)).status, 200);
  const input = context.stripe.sessionCreateInputs[0].input;
  assert.equal(input.trialEnd, undefined);
  assert.equal(input.trialPeriodDays, undefined);
});

test("T26 trial com mais de 48h preserva trial_end original", async () => {
  const context = setup();
  const deadline = new Date(NOW.getTime() + 72 * 60 * 60 * 1_000);
  context.setUser({ role: "owner", pageSlug: PAGE_SLUG, trialDeadline: deadline });
  await execute(context);
  assert.equal(context.stripe.sessionCreateInputs[0].input.trialEnd, deadline.getTime() / 1_000);
});

test("T27 trial com 47h usa dois dias", () => {
  assert.deepEqual(resolvePromotionalTrial(new Date(NOW.getTime() + 47 * 60 * 60 * 1_000), NOW), { trialPeriodDays: 2 });
});

test("T28 trial com menos de 24h usa um dia", () => {
  assert.deepEqual(resolvePromotionalTrial(new Date(NOW.getTime() + 2 * 60 * 60 * 1_000), NOW), { trialPeriodDays: 1 });
});

test("T29 trial expirado não é enviado à Stripe", () => {
  assert.deepEqual(resolvePromotionalTrial(new Date(NOW.getTime()), NOW), {});
});

for (const [label, remainingMs, expected] of [
  ["48h exatas", 48 * 60 * 60 * 1_000, { trialPeriodDays: 2 }],
  ["48h30 com margem insuficiente", 48.5 * 60 * 60 * 1_000, { trialPeriodDays: 3 }],
  ["47h59", (47 * 60 + 59) * 60 * 1_000, { trialPeriodDays: 2 }],
  ["24h exatas", 24 * 60 * 60 * 1_000, { trialPeriodDays: 1 }],
  ["23h59", (23 * 60 + 59) * 60 * 1_000, { trialPeriodDays: 1 }],
  ["poucos segundos", 10_000, { trialPeriodDays: 1 }],
] as const) {
  test(`trial na fronteira segura: ${label}`, () => {
    const deadline = new Date(NOW.getTime() + remainingMs);
    const result = resolvePromotionalTrial(deadline, NOW);
    assert.deepEqual(result, expected);
    if (result.trialPeriodDays) {
      assert.ok(NOW.getTime() + result.trialPeriodDays * DAY_MS >= deadline.getTime());
    }
  });
}

test("49h permite trial_end original com margem", () => {
  const deadline = new Date(NOW.getTime() + 49 * 60 * 60 * 1_000);
  assert.deepEqual(resolvePromotionalTrial(deadline, NOW), {
    trialEnd: deadline.getTime() / 1_000,
  });
});

test("T30 retry não reinicia trial para sete dias", async () => {
  const context = setup();
  const deadline = new Date(NOW.getTime() + 47 * 60 * 60 * 1_000);
  context.setUser({ role: "owner", pageSlug: PAGE_SLUG, trialDeadline: deadline });
  assert.equal((await execute(context)).status, 200);
  assert.equal((await execute(context)).status, 200);
  assert.equal(context.stripe.sessionCreateInputs[0].input.trialPeriodDays, 2);
  assert.equal(context.stripe.calls.sessionCreate, 1);
});

test("trial sempre coleta meio de pagamento", async () => {
  const context = setup();
  context.setUser({ role: "owner", pageSlug: PAGE_SLUG, trialDeadline: new Date(NOW.getTime() + DAY_MS) });
  await execute(context);
  assert.equal(context.stripe.sessionCreateInputs[0].input.paymentMethodCollection, "always");
});

test("T31 concorrência usa um checkoutAttemptId canônico", async () => {
  const context = setup();
  await Promise.all([execute(context), execute(context)]);
  assert.equal(new Set(context.stripe.sessionCreateInputs.map((item) => item.key)).size, 1);
  assert.equal(context.stripe.sessions.size, 1);
});

test("T32 mesma tentativa usa a mesma idempotency key", async () => {
  const context = setup();
  context.operations.recordFailuresRemaining = 1;
  await execute(context);
  await execute(context);
  assert.equal(new Set(context.stripe.sessionCreateInputs.map((item) => item.key)).size, 1);
});

test("T33 Session open retorna URL existente", async () => {
  const context = setup();
  preloadCustomer(context);
  context.operations.state = operationState({
    checkoutAttemptId: "attempt-open",
    checkoutSessionId: "cs_test_open",
    checkoutSessionUrl: CHECKOUT_URL,
    operationState: "CHECKOUT_OPEN",
  });
  context.stripe.sessions.set("cs_test_open", hostedSession("attempt-open", { id: "cs_test_open" }));
  const response = await execute(context);
  assert.equal((await responseBody(response)).url, CHECKOUT_URL);
  assert.equal(context.stripe.calls.sessionCreate, 0);
});

test("T34 Session expired cria nova tentativa após reavaliar", async () => {
  const context = setup();
  preloadCustomer(context);
  context.operations.state = operationState({
    checkoutAttemptId: "attempt-expired",
    checkoutSessionId: "cs_test_expired",
    checkoutSessionUrl: CHECKOUT_URL,
    operationState: "CHECKOUT_OPEN",
  });
  context.stripe.sessions.set("cs_test_expired", hostedSession("attempt-expired", {
    id: "cs_test_expired", status: "expired", expiresAt: 1,
  }));
  assert.equal((await execute(context)).status, 200);
  assert.notEqual(context.operations.state?.checkoutAttemptId, "attempt-expired");
  assert.ok(context.stripe.calls.subscriptionList >= 2);
});

test("Session complete não cria outra automaticamente", async () => {
  const context = setup();
  preloadCustomer(context);
  context.operations.state = operationState({ checkoutAttemptId: "attempt-complete", checkoutSessionId: "cs_complete" });
  context.stripe.sessions.set("cs_complete", hostedSession("attempt-complete", {
    id: "cs_complete", status: "complete", expiresAt: 1,
  }));
  await assertError(await execute(context), 409, "CHECKOUT_IN_PROGRESS");
  assert.equal(context.stripe.calls.sessionCreate, 0);
});

test("T35 crash após create reutiliza mesma operação Stripe", async () => {
  const context = setup();
  context.operations.recordFailuresRemaining = 1;
  await assertError(await execute(context), 503, "BILLING_UNAVAILABLE");
  assert.equal((await execute(context)).status, 200);
  assert.equal(context.stripe.sessions.size, 1);
  assert.equal(new Set(context.stripe.sessionCreateInputs.map((item) => item.key)).size, 1);
});

test("CUSTOMER_PROVISIONING com lease válido reutiliza a mesma operação", async () => {
  const context = setup();
  context.operations.state = operationState({
    stripeCustomerId: undefined,
    operationState: "CUSTOMER_PROVISIONING",
    operationStartedAt: NOW,
    operationLeaseUntil: new Date(NOW.getTime() + 60_000),
  });
  assert.equal((await execute(context)).status, 200);
  assert.match(context.stripe.customerCreateInputs[0].key, /customer-key$/);
});

test("CUSTOMER_PROVISIONING expirado não cria Customer cegamente", async () => {
  const context = setup();
  context.operations.state = operationState({
    stripeCustomerId: undefined,
    operationState: "CUSTOMER_PROVISIONING",
    operationLeaseUntil: new Date(NOW.getTime() - 1),
  });
  await assertError(await execute(context), 503, "BILLING_UNAVAILABLE");
  assert.equal(context.stripe.calls.customerCreate, 0);
});

test("CUSTOMER_PROVISIONING expirado recupera binding canônico conhecido pelo billing", async () => {
  const context = setup();
  context.operations.state = operationState({
    stripeCustomerId: undefined,
    operationState: "CUSTOMER_PROVISIONING",
    operationLeaseUntil: new Date(NOW.getTime() - 1),
  });
  context.stripe.customers.set("cus_reconciled", {
    id: "cus_reconciled", deleted: false, livemode: false, metadata: metadata(),
  });
  context.setBilling(makeBilling("canceled", { stripeCustomerId: "cus_reconciled" }));
  assert.equal((await execute(context)).status, 200);
  assert.equal(context.operations.state?.stripeCustomerId, "cus_reconciled");
  assert.equal(context.stripe.calls.customerCreate, 0);
});

test("CHECKOUT_PROVISIONING com lease válido reutiliza attempt e parâmetros", async () => {
  const context = setup();
  preloadCustomer(context);
  context.operations.state = operationState({
    checkoutAttemptId: "attempt-existing",
    checkoutExpiresAt: new Date(NOW.getTime() + 35 * 60_000),
    checkoutTrialPeriodDays: 2,
    operationState: "CHECKOUT_PROVISIONING",
    operationStartedAt: NOW,
    operationLeaseUntil: new Date(NOW.getTime() + 60_000),
  });
  assert.equal((await execute(context)).status, 200);
  assert.match(context.stripe.sessionCreateInputs[0].key, /attempt-existing$/);
  assert.equal(context.stripe.sessionCreateInputs[0].input.trialPeriodDays, 2);
});

test("CHECKOUT_PROVISIONING expirado sem Session falha fechado", async () => {
  const context = setup();
  preloadCustomer(context);
  context.operations.state = operationState({
    checkoutAttemptId: "attempt-abandoned",
    checkoutExpiresAt: new Date(NOW.getTime() + 35 * 60_000),
    operationState: "CHECKOUT_PROVISIONING",
    operationLeaseUntil: new Date(NOW.getTime() - 1),
  });
  await assertError(await execute(context), 409, "CHECKOUT_IN_PROGRESS");
  assert.equal(context.stripe.calls.sessionCreate, 0);
  assert.equal(context.stripe.calls.subscriptionList > 0, true);
});

test("CHECKOUT_PROVISIONING expirado com Session persistida recupera URL validada", async () => {
  const context = setup();
  preloadCustomer(context);
  context.operations.state = operationState({
    checkoutAttemptId: "attempt-recovered",
    checkoutSessionId: "cs_recovered",
    operationState: "CHECKOUT_PROVISIONING",
    operationLeaseUntil: new Date(NOW.getTime() - 1),
  });
  context.stripe.sessions.set("cs_recovered", hostedSession("attempt-recovered", {
    id: "cs_recovered",
  }));
  assert.equal((await responseBody(await execute(context))).url, CHECKOUT_URL);
  assert.equal(context.stripe.calls.sessionCreate, 0);
});

test("expires_at usa 35 minutos e continua válido após quatro minutos de latência", async () => {
  const context = setup();
  preloadCustomer(context);
  const moments = [NOW, new Date(NOW.getTime() + 4 * 60_000), new Date(NOW.getTime() + 4 * 60_000)];
  context.dependencies.now = () => moments.shift() ?? moments.at(-1) ?? NOW;
  assert.equal((await execute(context)).status, 200);
  const expiresAt = context.stripe.sessionCreateInputs[0].input.expiresAt;
  assert.equal(expiresAt, NOW.getTime() / 1_000 + 35 * 60);
  assert.ok(expiresAt - (NOW.getTime() / 1_000 + 4 * 60) >= 30 * 60);
  assert.ok(expiresAt - NOW.getTime() / 1_000 <= 24 * 60 * 60);
});

test("retry da mesma attempt preserva expires_at e trial persistidos", async () => {
  const context = setup();
  let clock = NOW;
  context.dependencies.now = () => clock;
  context.operations.recordFailuresRemaining = 1;
  context.setUser({
    role: "owner",
    pageSlug: PAGE_SLUG,
    trialDeadline: new Date(NOW.getTime() + 48 * 60 * 60 * 1_000),
  });
  await assertError(await execute(context), 503, "BILLING_UNAVAILABLE");
  clock = new Date(NOW.getTime() + 60_000);
  assert.equal((await execute(context)).status, 200);
  assert.equal(context.stripe.sessionCreateInputs.length, 2);
  assert.equal(
    context.stripe.sessionCreateInputs[0].input.expiresAt,
    context.stripe.sessionCreateInputs[1].input.expiresAt,
  );
  assert.equal(context.stripe.sessionCreateInputs[1].input.trialPeriodDays, 2);
});

for (const [label, mutate] of [
  ["Live Mode", (session: HostedCheckoutSession) => { session.livemode = true; }],
  ["mode", (session: HostedCheckoutSession) => { session.mode = "payment"; }],
  ["Customer", (session: HostedCheckoutSession) => { session.customerId = "cus_other"; }],
  ["client_reference_id", (session: HostedCheckoutSession) => { session.clientReferenceId = "owner-b"; }],
  ["owner metadata", (session: HostedCheckoutSession) => { session.metadata.beautyProOwnerId = "owner-b"; }],
  ["tenant metadata", (session: HostedCheckoutSession) => { session.metadata.beautyProPageSlug = "salao-b"; }],
  ["attempt metadata", (session: HostedCheckoutSession) => { session.metadata.beautyProCheckoutAttemptId = "other"; }],
  ["Price", (session: HostedCheckoutSession) => { session.priceIds = ["price_other"]; }],
] as const) {
  test(`Session recuperada com ${label} contraditório falha fechado`, async () => {
    const context = setup();
    preloadCustomer(context);
    context.operations.state = operationState({
      checkoutAttemptId: "attempt-suspect",
      checkoutSessionId: "cs_suspect",
      operationState: "CHECKOUT_OPEN",
    });
    const session = hostedSession("attempt-suspect", { id: "cs_suspect" });
    mutate(session);
    context.stripe.sessions.set(session.id, session);
    await assertError(await execute(context), 409, "CHECKOUT_SESSION_CONFLICT");
    assert.equal(context.stripe.calls.sessionCreate, 0);
  });
}

test("billing.pageSlug divergente falha fechado", async () => {
  const context = setup();
  context.setBilling(makeBilling("canceled", { pageSlug: "salao-b" }));
  await assertError(await execute(context), 409, "TENANT_INCONSISTENT");
  assert.equal(context.stripe.calls.customerCreate, 0);
});

test("JSON malformado retorna 400", async () => {
  const context = setup();
  await assertError(
    await handleCheckoutRequest(rawRequest("{"), context.dependencies),
    400,
    "INVALID_REQUEST",
  );
});

for (const key of ["trial", "amount", "plan"]) {
  test(`body não aceita ${key}`, async () => {
    await assertError(await execute(setup(), { [key]: "forged" }), 400, "INVALID_REQUEST");
  });
}

test("Content-Type inesperado não contorna validação do body", async () => {
  const context = setup();
  await assertError(
    await handleCheckoutRequest(rawRequest("{}", "text/plain"), context.dependencies),
    400,
    "INVALID_REQUEST",
  );
  assert.equal(context.stripe.calls.price, 0);
});

for (const mutate of [
  (stripe: FakeStripe) => { stripe.price = { ...stripe.price, id: "wrong" }; },
  (stripe: FakeStripe) => { stripe.price = { ...stripe.price, recurringInterval: "year" }; },
  (stripe: FakeStripe) => { stripe.price = { ...stripe.price, unitAmount: 3_000 }; },
  (stripe: FakeStripe) => { stripe.price = { ...stripe.price, currency: "usd" }; },
  (stripe: FakeStripe) => { stripe.price = { ...stripe.price, active: false }; },
  (stripe: FakeStripe) => { stripe.price = { ...stripe.price, livemode: true }; },
]) {
  test("Price inválido falha fechado", async () => {
    const context = setup();
    mutate(context.stripe);
    await assertError(await execute(context), 503, "BILLING_CONFIG_INVALID");
  });
}

test("T41 configuração Live falha fechado", async () => {
  assert.throws(
    () => resolveCheckoutServerConfig({ STRIPE_SECRET_KEY: "sk_live_secret", STRIPE_PRICE_ID: "price_x", APP_URL: "https://beautypro.test" }),
    /Test Mode/,
  );
});

test("config ausente vira erro controlado", async () => {
  const context = setup();
  context.dependencies.getConfig = () => { throw new Error("STRIPE_SECRET_KEY=secret"); };
  const response = await execute(context);
  const copy = response.clone();
  await assertError(response, 503, "BILLING_CONFIG_INVALID");
  assert.equal(JSON.stringify(await copy.json()).includes("secret"), false);
});

test("T42 success URL é server-side e não altera billing", async () => {
  const context = setup();
  await handleCheckoutRequest(request({}, `Bearer ${TOKEN}`, "https://attacker.example"), context.dependencies);
  const input = context.stripe.sessionCreateInputs[0].input;
  assert.equal(input.successUrl, "https://preview.beautypro.test/admin/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}");
});

test("T43 query manual billing=success não promove entitlement", async () => {
  const dashboard = await readFile("src/app/admin/dashboard/page.tsx", "utf8");
  assert.equal(dashboard.includes("billing=success"), false);
  assert.equal(dashboard.includes("billing.status=active"), false);
});

test("T44 cancel URL não altera trial ou billing", async () => {
  const context = setup();
  await execute(context);
  assert.equal(context.stripe.sessionCreateInputs[0].input.cancelUrl, "https://preview.beautypro.test/admin/dashboard?billing=cancelled");
  assert.equal(context.billingReads, 1);
});

test("T45 sucesso retorna somente URL", async () => {
  const body = await responseBody(await execute(setup()));
  assert.deepEqual(Object.keys(body), ["url"]);
});

test("T46 erro Stripe é sanitizado", async () => {
  const context = setup();
  context.stripe.throwOnSessionCreate = new Error("sk_test_secret PaymentMethod completo");
  const response = await execute(context);
  assert.equal(response.status, 503);
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(serialized.includes("sk_test_secret"), false);
  assert.equal(serialized.includes("PaymentMethod"), false);
  assert.equal(context.logged.length, 1);
});

test("T48 Customer recebe metadata server-side e dados mínimos", async () => {
  const context = setup();
  await execute(context);
  const input = context.stripe.customerCreateInputs[0].input;
  assert.deepEqual(input.metadata, metadata());
  assert.equal(input.email, "token-owner@example.com");
  assert.equal(input.name, "Owner A");
  assert.equal("cpfCnpj" in input, false);
});

test("T49 e T50 Checkout e Subscription recebem metadata server-side", async () => {
  const context = setup();
  await execute(context);
  const input = context.stripe.sessionCreateInputs[0].input;
  assert.deepEqual(input.metadata, {
    ...metadata(),
    beautyProCheckoutAttemptId: "attempt-1",
  });
  assert.deepEqual(input.subscriptionMetadata, metadata());
  assert.equal(input.clientReferenceId, OWNER_ID);
});

test("Price usado na Session vem exclusivamente da configuração", async () => {
  const context = setup();
  await execute(context);
  assert.equal(context.stripe.sessionCreateInputs[0].input.priceId, "price_beautypro");
});

test("idempotency keys possuem escopo e identificadores persistentes", async () => {
  const context = setup();
  await execute(context);
  assert.match(context.stripe.customerCreateInputs[0].key, /^beautypro:customer:v1:owner-a:provision-/);
  assert.match(context.stripe.sessionCreateInputs[0].key, /^beautypro:checkout:v1:owner-a:attempt-/);
});

test("resolver usa URL específica do deployment Vercel", () => {
  assert.equal(resolveCheckoutAppUrl({ VERCEL_URL: "beautypro-git-feature.vercel.app" }), "https://beautypro-git-feature.vercel.app");
});

test("resolver não aceita URL HTTP remota", () => {
  assert.throws(() => resolveCheckoutAppUrl({ APP_URL: "http://evil.example" }), /HTTPS/);
});

test("adapter de configuração privilegiada possui barreira server-only", async () => {
  const source = await readFile("src/lib/checkoutConfig.ts", "utf8");
  assert.match(source, /^import "server-only";/);
  assert.equal(source.includes("process.env"), true);
});

test("rota não escreve projeção financeira nem aceita autoridade do browser", async () => {
  const source = await readFile("src/app/api/billing/checkout/route.ts", "utf8");
  assert.equal(source.includes('runtime = "nodejs"'), true);
  assert.equal(source.includes("applyStripeBillingSnapshot"), false);
  assert.equal(source.includes('collection("billing")'), false);
  assert.equal(source.includes("request.headers.get(\"host\")"), false);
});
