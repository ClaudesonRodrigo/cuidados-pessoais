import assert from "node:assert/strict";
import test from "node:test";

import {
  createBillingService,
  type BillingProjectionStore,
} from "../src/lib/billingServiceCore.ts";
import type { BillingRecord, BillingStripeSnapshot } from "../src/lib/billingTypes.ts";
import { resolveBillingStatus } from "../src/lib/billingStatusService.ts";
import {
  handleBookingRequest,
  type BookingStore,
} from "../src/lib/bookingService.ts";
import {
  CommercialAccessError,
  requireCommercialAccess,
  resolveCommercialContext,
} from "../src/lib/commercialAccessService.ts";
import {
  PAST_DUE_GRACE_MS,
  resolveCommercialEntitlement,
} from "../src/lib/commercialEntitlement.ts";
import { handleCustomerPortalRequest } from "../src/lib/customerPortalService.ts";
import {
  handleStripeWebhookRequest,
  type CanonicalSubscription,
  type StripeWebhookEvent,
  type WebhookDependencies,
} from "../src/lib/webhookService.ts";

type Data = Record<string, unknown>;

const OWNER_ID = "owner-recovery";
const PAGE_SLUG = "salao-recovery";
const CUSTOMER_ID = "cus_recovery";
const SUBSCRIPTION_ID = "sub_recovery";
const PRICE_ID = "price_recovery";
const TOKEN = "header.payload.signature";
const PORTAL_URL = "https://billing.stripe.com/p/session/recovery";
const INITIAL_NOW = new Date("2026-08-19T12:00:00.000Z");
const BOOKING_DAY = "2026-09-01";

const clone = <T>(value: T): T => structuredClone(value);

const user: Data = { role: "owner", pageSlug: PAGE_SLUG, plan: "free" };
const page: Data = {
  userId: OWNER_ID,
  slug: PAGE_SLUG,
  plan: "free",
  isOpen: true,
  links: [{
    title: "Corte",
    type: "service",
    durationMinutes: 30,
    price: "50,00",
    order: 1,
  }],
  schedule: { open: "00:00", close: "23:59" },
};

const metadata = {
  beautyProOwnerId: OWNER_ID,
  beautyProPageSlug: PAGE_SLUG,
};

const billingMemory = () => {
  const documents = new Map<string, Data>();
  const store: BillingProjectionStore = {
    async get(ownerId) {
      const value = documents.get(ownerId);
      return value ? clone(value) : null;
    },
    async runTransaction(ownerId, operation) {
      const current = documents.get(ownerId);
      const mutation = operation(current ? clone(current) : null);
      if (mutation.replacement) documents.set(ownerId, clone(mutation.replacement));
      return mutation.result;
    },
  };
  return { documents, store };
};

const bookingMemory = (
  getBilling: () => Promise<BillingRecord | null>,
): BookingStore & {
  appointments: Map<string, Data>;
  locks: Map<string, Data>;
} => {
  const appointments = new Map<string, Data>();
  const locks = new Map<string, Data>();
  return {
    appointments,
    locks,
    async runTransaction(operation) {
      const pendingAppointments = new Map<string, Data>();
      const pendingLocks = new Map<string, Data>();
      const result = await operation({
        async getPage(slug) { return slug === PAGE_SLUG ? clone(page) : null; },
        async getUser(ownerId) { return ownerId === OWNER_ID ? clone(user) : null; },
        async getBilling(ownerId) { return ownerId === OWNER_ID ? getBilling() : null; },
        async getAppointment(id) {
          const value = appointments.get(id);
          return value ? clone(value) : null;
        },
        async getLocks(ids) {
          return ids.map((id) => ({ id, data: locks.has(id) ? clone(locks.get(id)!) : null }));
        },
        async getAppointments(ids) {
          return new Map(ids.map((id) => [id, appointments.has(id) ? clone(appointments.get(id)!) : null]));
        },
        async findAppointmentsStartingBefore(slug, endAt) {
          return [...appointments.values()]
            .filter((appointment) =>
              appointment.pageSlug === slug &&
              appointment.startAt instanceof Date &&
              appointment.startAt < endAt)
            .map(clone);
        },
        createAppointment(id, data) { pendingAppointments.set(id, clone(data)); },
        setLock(id, data) { pendingLocks.set(id, clone(data)); },
      });
      pendingAppointments.forEach((value, key) => appointments.set(key, value));
      pendingLocks.forEach((value, key) => locks.set(key, value));
      return result;
    },
  };
};

const bookingRequest = (idempotencyKey: string, hour: string) =>
  new Request("https://beautypro.test/api/book", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      pageSlug: PAGE_SLUG,
      startAt: `${BOOKING_DAY}T${hour}:00:00.000Z`,
      services: ["Corte"],
      customerName: "Cliente",
      customerPhone: "55000000000",
      idempotencyKey,
    }),
  });

test("ACTIVE → PAST_DUE_GRACE → BLOCKED → ACTIVE preserva o ciclo comercial", async () => {
  let now = new Date(INITIAL_NOW);
  const memory = billingMemory();
  const billing = createBillingService({ store: memory.store, now: () => new Date(now) });
  const booking = bookingMemory(() => billing.getBillingByOwnerId(OWNER_ID));
  let event: StripeWebhookEvent;
  let subscriptionStatus: CanonicalSubscription["status"] = "active";
  const webhookResults: string[] = [];
  let portalSessions = 0;

  const checkoutState = {
    ownerId: OWNER_ID,
    pageSlug: PAGE_SLUG,
    stripeCustomerId: CUSTOMER_ID,
    operationState: "READY" as const,
    createdAt: INITIAL_NOW,
    updatedAt: INITIAL_NOW,
  };
  const subscription = (): CanonicalSubscription => ({
    id: SUBSCRIPTION_ID,
    customerId: CUSTOMER_ID,
    livemode: false,
    status: subscriptionStatus,
    metadata,
    items: [{ priceId: PRICE_ID, currentPeriodEnd: 1_800_000_000 }],
    cancelAtPeriodEnd: false,
  });
  const customer = {
    id: CUSTOMER_ID,
    deleted: false,
    livemode: false,
    metadata,
  };

  const webhookDependencies: WebhookDependencies = {
    constructEvent() { return clone(event); },
    stripe: {
      async retrieveSubscription() { return clone(subscription()); },
      async retrieveCustomer() { return clone(customer); },
    },
    accounts: {
      async findBindings() {
        return [{ ownerId: OWNER_ID, pageSlug: PAGE_SLUG, stripeCustomerId: CUSTOMER_ID }];
      },
      async getUser() { return clone(user); },
      async getPage() { return clone(page); },
      async getCheckoutState() { return clone(checkoutState); },
    },
    billing: {
      getBillingByOwnerId: billing.getBillingByOwnerId,
      apply: billing.applyStripeBillingSnapshot,
      reconcile: billing.reconcileStripeBillingSnapshot,
    },
    getConfig: () => ({ webhookSecret: "whsec_recovery", priceId: PRICE_ID }),
    log(entry) { if (entry.result) webhookResults.push(entry.result); },
  };

  const commercialDependencies = {
    accounts: {
      async getUser() { return clone(user); },
      async getPage() { return clone(page); },
    },
    billing: { getBillingByOwnerId: billing.getBillingByOwnerId },
    now: () => new Date(now),
  };
  const authenticatedCommercialDependencies = {
    ...commercialDependencies,
    async verifyIdToken() { return { uid: OWNER_ID }; },
  };
  const statusDependencies = {
    ...authenticatedCommercialDependencies,
    checkoutState: { async get() { return clone(checkoutState); } },
    stripe: { async retrieveCustomer() { return clone(customer); } },
  };
  const portalDependencies = {
    ...authenticatedCommercialDependencies,
    checkoutState: { async get() { return clone(checkoutState); } },
    stripe: {
      async retrieveCustomer() { return clone(customer); },
      async createPortalSession() {
        portalSessions += 1;
        return { url: PORTAL_URL };
      },
    },
    getConfig: () => ({ appUrl: "https://beautypro.test" }),
  };

  const webhook = async (id: string, created: number) => {
    event = {
      id,
      created,
      type: "customer.subscription.updated",
      object: { id: SUBSCRIPTION_ID },
    };
    const response = await handleStripeWebhookRequest(new Request(
      "https://beautypro.test/api/billing/webhook",
      { method: "POST", headers: { "Stripe-Signature": "valid" }, body: "raw" },
    ), webhookDependencies);
    assert.equal(response.status, 200);
    return webhookResults.at(-1);
  };
  const entitlement = async () =>
    (await resolveCommercialContext({ uid: OWNER_ID }, commercialDependencies)).entitlement.state;
  const access = () => requireCommercialAccess(new Request(
    "https://beautypro.test/api/admin",
    { headers: { authorization: `Bearer ${TOKEN}` } },
  ), authenticatedCommercialDependencies);
  const status = () => resolveBillingStatus({ uid: OWNER_ID }, statusDependencies);
  const book = async (key: string, hour: string) => {
    const response = await handleBookingRequest(bookingRequest(key, hour), {
      verifyIdToken: async () => ({ uid: `customer-${key}` }),
      store: booking,
      now: () => new Date(now),
    });
    return { response, body: await response.json() as Data };
  };
  const portal = () => handleCustomerPortalRequest(new Request(
    "https://beautypro.test/api/billing/portal",
    {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: "{}",
    },
  ), portalDependencies);

  assert.equal(await webhook("evt_active000001", 1_000), "APPLIED");
  assert.equal((await billing.getBillingByOwnerId(OWNER_ID))?.status, "active");
  assert.equal(await entitlement(), "ACTIVE");
  assert.equal((await access()).entitlement.state, "ACTIVE");
  assert.equal((await status()).state, "ACTIVE");
  assert.equal((await book("recovery-active-001", "10")).response.status, 201);

  subscriptionStatus = "past_due";
  assert.equal(await webhook("evt_pastdue00001", 1_001), "APPLIED");
  const firstPastDueSince = (await billing.getBillingByOwnerId(OWNER_ID))?.pastDueSince;
  assert.ok(firstPastDueSince);
  assert.equal(firstPastDueSince.getTime(), INITIAL_NOW.getTime());

  now = new Date(INITIAL_NOW.getTime() + 60 * 60 * 1_000);
  assert.equal(await webhook("evt_pastdue00002", 1_002), "APPLIED");
  assert.equal(
    (await billing.getBillingByOwnerId(OWNER_ID))?.pastDueSince?.getTime(),
    firstPastDueSince.getTime(),
  );
  assert.equal(await webhook("evt_pastdue00002", 1_002), "DUPLICATE");
  assert.equal(await webhook("evt_stale0000001", 1_001), "STALE");
  assert.equal(
    (await billing.getBillingByOwnerId(OWNER_ID))?.pastDueSince?.getTime(),
    firstPastDueSince.getTime(),
  );

  assert.equal(await entitlement(), "PAST_DUE_GRACE");
  assert.equal((await access()).entitlement.state, "PAST_DUE_GRACE");
  assert.equal((await status()).state, "PAST_DUE_GRACE");
  assert.equal((await book("recovery-grace-0001", "12")).response.status, 201);
  assert.equal((await portal()).status, 200);

  now = new Date(firstPastDueSince.getTime() + PAST_DUE_GRACE_MS);
  assert.equal(await entitlement(), "BLOCKED");
  await assert.rejects(access(), (error: unknown) => {
    assert.ok(error instanceof CommercialAccessError);
    assert.equal(error.code, "COMMERCIAL_ACCESS_BLOCKED");
    return true;
  });
  assert.equal((await status()).state, "BLOCKED");
  assert.equal((await portal()).status, 200);
  const appointmentsBeforeBlock = booking.appointments.size;
  const locksBeforeBlock = booking.locks.size;
  const blockedBooking = await book("recovery-blocked-01", "14");
  assert.equal(blockedBooking.response.status, 403);
  assert.equal((blockedBooking.body.error as Data).code, "COMMERCIAL_BOOKING_BLOCKED");
  assert.equal(booking.appointments.size, appointmentsBeforeBlock);
  assert.equal(booking.locks.size, locksBeforeBlock);

  subscriptionStatus = "active";
  assert.equal(await webhook("evt_recovered0001", 1_003), "APPLIED");
  const recoveredBilling = await billing.getBillingByOwnerId(OWNER_ID);
  assert.equal(recoveredBilling?.status, "active");
  assert.equal(recoveredBilling?.pastDueSince, undefined);
  assert.equal(await entitlement(), "ACTIVE");
  assert.equal((await access()).entitlement.state, "ACTIVE");
  assert.equal((await status()).state, "ACTIVE");
  assert.equal((await book("recovery-active-002", "16")).response.status, 201);
  assert.equal(portalSessions, 2);
});

test("past_due malformado nunca concede grace", () => {
  const base = {
    identity: { uid: OWNER_ID },
    now: INITIAL_NOW,
  };
  const billing = (pastDueSince?: Date): BillingRecord => ({
    ownerId: OWNER_ID,
    pageSlug: PAGE_SLUG,
    status: "past_due",
    ...(pastDueSince === undefined ? {} : { pastDueSince }),
    createdAt: INITIAL_NOW,
    updatedAt: INITIAL_NOW,
  });
  for (const record of [
    billing(),
    billing(new Date(Number.NaN)),
    billing(new Date(INITIAL_NOW.getTime() + 1)),
  ]) {
    assert.equal(resolveCommercialEntitlement({ ...base, billing: record }).state, "BLOCKED");
  }
});
