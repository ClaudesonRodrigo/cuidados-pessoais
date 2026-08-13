import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";

import type { BillingProjectionDecision, BillingRecord } from "../src/lib/billingTypes.ts";
import {
  MissingWebhookSecretError,
  resolveWebhookServerConfig,
} from "../src/lib/webhookConfig.ts";
import {
  handleStripeWebhookRequest,
  type CanonicalCustomer,
  type CanonicalSubscription,
  type StripeWebhookEvent,
  type WebhookBinding,
  type WebhookDependencies,
} from "../src/lib/webhookService.ts";

const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const CUSTOMER_ID = "cus_owner_a";
const SUBSCRIPTION_ID = "sub_owner_a";
const PRICE_ID = "price_beautypro";

const metadata = () => ({
  beautyProOwnerId: OWNER_ID,
  beautyProPageSlug: PAGE_SLUG,
});

const subscription = (
  overrides: Partial<CanonicalSubscription> = {},
): CanonicalSubscription => ({
  id: SUBSCRIPTION_ID,
  customerId: CUSTOMER_ID,
  livemode: false,
  status: "active",
  metadata: metadata(),
  items: [{ priceId: PRICE_ID, currentPeriodEnd: 4_100_000_000 }],
  cancelAtPeriodEnd: false,
  ...overrides,
});

const customer = (overrides: Partial<CanonicalCustomer> = {}): CanonicalCustomer => ({
  id: CUSTOMER_ID,
  deleted: false,
  livemode: false,
  metadata: metadata(),
  ...overrides,
});

const stripeEvent = (
  type = "customer.subscription.updated",
  object: Record<string, unknown> = { id: SUBSCRIPTION_ID },
  overrides: Partial<StripeWebhookEvent> = {},
): StripeWebhookEvent => ({
  id: "evt_webhook0001",
  created: 2_000,
  type,
  object,
  ...overrides,
});

const request = (signature = "valid") => new Request("https://beautypro.test/api/billing/webhook", {
  method: "POST",
  headers: signature ? { "Stripe-Signature": signature } : {},
  body: "raw-stripe-body",
});

const setup = () => {
  let event = stripeEvent();
  let canonicalSubscription = subscription();
  let canonicalCustomer = customer();
  let bindings: WebhookBinding[] = [];
  let checkoutState: WebhookBinding | null = null;
  let billingRecord: BillingRecord | null = null;
  let userRecord: Record<string, unknown> | null = { pageSlug: PAGE_SLUG };
  let pageRecord: Record<string, unknown> | null = { userId: OWNER_ID };
  let applyDecision: BillingProjectionDecision = "APPLIED";
  let secretMissing = false;
  let retrieveFailure = false;
  let billingFailure = false;
  const calls = { construct: 0, subscription: 0, customer: 0, apply: 0, reconcile: 0 };
  const snapshots: Array<Record<string, unknown>> = [];
  const logs: Array<Record<string, unknown>> = [];

  const dependencies: WebhookDependencies = {
    constructEvent(rawBody, signature, secret) {
      calls.construct += 1;
      assert.equal(rawBody, "raw-stripe-body");
      assert.equal(secret, "whsec_test");
      if (signature !== "valid") throw new Error("invalid signature");
      return structuredClone(event);
    },
    stripe: {
      async retrieveSubscription() {
        calls.subscription += 1;
        if (retrieveFailure) throw new Error("stripe unavailable");
        return structuredClone(canonicalSubscription);
      },
      async retrieveCustomer() {
        calls.customer += 1;
        return structuredClone(canonicalCustomer);
      },
    },
    accounts: {
      async findBindings() { return structuredClone(bindings); },
      async getUser() { return userRecord ? structuredClone(userRecord) : null; },
      async getPage() { return pageRecord ? structuredClone(pageRecord) : null; },
      async getCheckoutState() { return checkoutState ? structuredClone(checkoutState) : null; },
    },
    billing: {
      async getBillingByOwnerId() { return billingRecord ? structuredClone(billingRecord) : null; },
      async apply(input) {
        calls.apply += 1;
        snapshots.push(structuredClone(input.snapshot));
        if (billingFailure) throw new Error("firestore unavailable");
        return { decision: applyDecision, billing: billingRecord };
      },
      async reconcile(input) {
        calls.reconcile += 1;
        snapshots.push(structuredClone(input.snapshot));
        return { decision: "RECONCILED", billing: billingRecord };
      },
    },
    getConfig() {
      if (secretMissing) throw new MissingWebhookSecretError("missing");
      return { webhookSecret: "whsec_test", priceId: PRICE_ID };
    },
    log(context) { logs.push(structuredClone(context)); },
  };

  return {
    dependencies,
    calls,
    snapshots,
    logs,
    setEvent(value: StripeWebhookEvent) { event = value; },
    setSubscription(value: CanonicalSubscription) { canonicalSubscription = value; },
    setCustomer(value: CanonicalCustomer) { canonicalCustomer = value; },
    setBindings(value: WebhookBinding[]) { bindings = value; },
    setCheckoutState(value: WebhookBinding | null) { checkoutState = value; },
    setBilling(value: BillingRecord | null) { billingRecord = value; },
    setUser(value: Record<string, unknown> | null) { userRecord = value; },
    setPage(value: Record<string, unknown> | null) { pageRecord = value; },
    setDecision(value: BillingProjectionDecision) { applyDecision = value; },
    setSecretMissing(value: boolean) { secretMissing = value; },
    setRetrieveFailure(value: boolean) { retrieveFailure = value; },
    setBillingFailure(value: boolean) { billingFailure = value; },
  };
};

test("assinatura válida processa raw body e aplica snapshot canônico", async () => {
  const context = setup();
  const response = await handleStripeWebhookRequest(request(), context.dependencies);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.deepEqual(context.calls, { construct: 1, subscription: 1, customer: 1, apply: 1, reconcile: 0 });
});

test("Stripe SDK oficial valida assinatura sobre o raw body", async () => {
  const context = setup();
  const stripe = new Stripe("sk_test_placeholder");
  const payload = JSON.stringify({
    id: "evt_official0001",
    object: "event",
    api_version: "2026-07-29.preview",
    created: 2_000,
    data: { object: { id: SUBSCRIPTION_ID } },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "customer.subscription.updated",
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
  context.dependencies.constructEvent = (rawBody, header, secret) => {
    const verified = stripe.webhooks.constructEvent(rawBody, header, secret);
    return {
      id: verified.id,
      type: verified.type,
      created: verified.created,
      object: verified.data.object as unknown as Record<string, unknown>,
    };
  };
  const response = await handleStripeWebhookRequest(new Request(
    "https://beautypro.test/api/billing/webhook",
    { method: "POST", headers: { "Stripe-Signature": signature }, body: payload },
  ), context.dependencies);
  assert.equal(response.status, 200);
  assert.equal(context.calls.apply, 1);
});

test("assinatura inválida responde 400 e não escreve", async () => {
  const context = setup();
  const response = await handleStripeWebhookRequest(request("invalid"), context.dependencies);
  assert.equal(response.status, 400);
  assert.equal(context.calls.apply, 0);
});

test("Stripe-Signature ausente responde 400 antes de ler evento", async () => {
  const context = setup();
  const response = await handleStripeWebhookRequest(request(""), context.dependencies);
  assert.equal(response.status, 400);
  assert.equal(context.calls.construct, 0);
  assert.equal(context.calls.apply, 0);
});

test("webhook secret ausente responde 503 sem verificar evento", async () => {
  const context = setup();
  context.setSecretMissing(true);
  const response = await handleStripeWebhookRequest(request(), context.dependencies);
  assert.equal(response.status, 503);
  assert.equal(context.calls.construct, 0);
});

test("configuração webhook exige Test Mode, whsec e Price", () => {
  assert.deepEqual(resolveWebhookServerConfig({
    STRIPE_SECRET_KEY: "sk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_ID: PRICE_ID,
  }), { webhookSecret: "whsec_example", priceId: PRICE_ID });
  assert.throws(() => resolveWebhookServerConfig({
    STRIPE_SECRET_KEY: "sk_live_forbidden",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_ID: PRICE_ID,
  }), /Test Mode/);
  assert.throws(() => resolveWebhookServerConfig({
    STRIPE_SECRET_KEY: "sk_test_example",
    STRIPE_PRICE_ID: PRICE_ID,
  }), MissingWebhookSecretError);
});

test("evento autenticado fora do escopo é ignorado com 200", async () => {
  const context = setup();
  context.setEvent(stripeEvent("customer.created", { id: CUSTOMER_ID }));
  const response = await handleStripeWebhookRequest(request(), context.dependencies);
  assert.equal(response.status, 200);
  assert.equal(context.calls.subscription, 0);
  assert.equal(context.logs.at(-1)?.result, "IGNORED");
});

for (const decision of ["DUPLICATE", "STALE"] as const) {
  test(`${decision} responde 200 sem reconciliação`, async () => {
    const context = setup();
    context.setDecision(decision);
    const response = await handleStripeWebhookRequest(request(), context.dependencies);
    assert.equal(response.status, 200);
    assert.equal(context.calls.reconcile, 0);
  });
}

test("evento mais novo APPLIED responde 200", async () => {
  const context = setup();
  context.setDecision("APPLIED");
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 200);
  assert.equal(context.logs.at(-1)?.result, "APPLIED");
});

test("mesmo created com IDs diferentes executa canonical reconciliation explícita", async () => {
  const context = setup();
  context.setDecision("REQUIRES_STRIPE_SYNC");
  const response = await handleStripeWebhookRequest(request(), context.dependencies);
  assert.equal(response.status, 200);
  assert.equal(context.calls.reconcile, 1);
  assert.equal(context.logs.at(-1)?.result, "RECONCILED");
});

for (const status of [
  "trialing", "active", "past_due", "unpaid", "canceled", "paused", "incomplete", "incomplete_expired",
] as const) {
  test(`Subscription canônica ${status} produz status ${status}`, async () => {
    const context = setup();
    context.setSubscription(subscription({ status }));
    const response = await handleStripeWebhookRequest(request(), context.dependencies);
    assert.equal(response.status, 200);
    assert.equal(context.snapshots[0]?.status, status);
  });
}

test("Subscription/Customer conflitantes falham fechados", async () => {
  const context = setup();
  context.setCustomer(customer({ id: "cus_other" }));
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 500);
  assert.equal(context.calls.apply, 0);
});

test("metadata Subscription/Customer conflitante falha fechada", async () => {
  const context = setup();
  context.setCustomer(customer({ metadata: { ...metadata(), beautyProOwnerId: "owner-b" } }));
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 500);
});

test("owner vindo de binding conflitante não é escolhido arbitrariamente", async () => {
  const context = setup();
  context.setBindings([{ ownerId: "owner-b", pageSlug: PAGE_SLUG, stripeCustomerId: CUSTOMER_ID }]);
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 500);
});

test("users/page inconsistentes falham fechados", async () => {
  const context = setup();
  context.setPage({ userId: "owner-b" });
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 500);
  assert.equal(context.calls.apply, 0);
});

test("billingCheckoutState Customer conflitante falha fechada", async () => {
  const context = setup();
  context.setCheckoutState({ ownerId: OWNER_ID, pageSlug: PAGE_SLUG, stripeCustomerId: "cus_other" });
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 500);
});

test("billing Customer conflitante falha fechada", async () => {
  const context = setup();
  context.setBilling({
    ownerId: OWNER_ID,
    pageSlug: PAGE_SLUG,
    stripeCustomerId: "cus_other",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 500);
});

test("Checkout completed recupera e sincroniza Subscription canônica", async () => {
  const context = setup();
  context.setEvent(stripeEvent("checkout.session.completed", {
    mode: "subscription",
    subscription: SUBSCRIPTION_ID,
    payment_status: "paid",
  }));
  context.setSubscription(subscription({ status: "trialing" }));
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 200);
  assert.equal(context.snapshots[0]?.status, "trialing");
});

test("Checkout completed fora de mode subscription falha fechado", async () => {
  const context = setup();
  context.setEvent(stripeEvent("checkout.session.completed", {
    mode: "payment",
    subscription: SUBSCRIPTION_ID,
  }));
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 500);
  assert.equal(context.calls.subscription, 0);
});

for (const type of [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const) {
  test(`${type} recupera Subscription em vez de projetar o payload`, async () => {
    const context = setup();
    context.setEvent(stripeEvent(type, { id: SUBSCRIPTION_ID, status: "active" }));
    context.setSubscription(subscription({ status: "canceled" }));
    assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 200);
    assert.equal(context.snapshots[0]?.status, "canceled");
  });
}

for (const [type, payloadStatus, canonicalStatus] of [
  ["invoice.payment_failed", "past_due", "active"],
  ["invoice.paid", "active", "past_due"],
] as const) {
  test(`${type} ignora inferência ${payloadStatus} e usa ${canonicalStatus} da Subscription`, async () => {
    const context = setup();
    context.setEvent(stripeEvent(type, {
      status: payloadStatus,
      parent: { subscription_details: { subscription: SUBSCRIPTION_ID } },
    }));
    context.setSubscription(subscription({ status: canonicalStatus }));
    assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 200);
    assert.equal(context.snapshots[0]?.status, canonicalStatus);
  });
}

test("Invoice sem Subscription é ignorada", async () => {
  const context = setup();
  context.setEvent(stripeEvent("invoice.paid", { id: "in_without_subscription" }));
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 200);
  assert.equal(context.calls.subscription, 0);
  assert.equal(context.logs.at(-1)?.result, "IGNORED");
});

test("Price diferente falha fechado", async () => {
  const context = setup();
  context.setSubscription(subscription({ items: [{ priceId: "price_unknown", currentPeriodEnd: 4_100_000_000 }] }));
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 500);
  assert.equal(context.calls.apply, 0);
});

test("múltiplos Prices falham fechados", async () => {
  const context = setup();
  context.setSubscription(subscription({ items: [
    { priceId: PRICE_ID, currentPeriodEnd: 4_100_000_000 },
    { priceId: "price_other", currentPeriodEnd: 4_100_000_000 },
  ] }));
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 500);
});

test("falha ao recuperar Subscription responde 503", async () => {
  const context = setup();
  context.setRetrieveFailure(true);
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 503);
  assert.equal(context.calls.apply, 0);
});

test("falha de transação Firestore responde 503", async () => {
  const context = setup();
  context.setBillingFailure(true);
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 503);
});

test("replay após APPLIED é aceito como DUPLICATE", async () => {
  const context = setup();
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 200);
  context.setDecision("DUPLICATE");
  assert.equal((await handleStripeWebhookRequest(request(), context.dependencies)).status, 200);
  assert.equal(context.logs.at(-1)?.result, "DUPLICATE");
});
