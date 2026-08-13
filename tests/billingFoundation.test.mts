import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createBillingService,
  type BillingProjectionStore,
} from "../src/lib/billingServiceCore.ts";
import type {
  BillingRecord,
  BillingStripeSnapshot,
  StripeBillingStatus,
  StripeEventCursor,
} from "../src/lib/billingTypes.ts";
import { getStripeSecretKey } from "../src/lib/stripeServerConfig.ts";

type Data = Record<string, unknown>;

const NOW = new Date("2099-02-10T12:00:00.000Z");
const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";

const event = (id: string, created: number): StripeEventCursor => ({ id, created });

const stripeSnapshot = (
  status?: StripeBillingStatus,
  overrides: Partial<BillingStripeSnapshot> = {},
): BillingStripeSnapshot => ({ status, ...overrides });

const storedBilling = (overrides: Data = {}): Data => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  status: "active",
  createdAt: new Date("2099-01-01T00:00:00.000Z"),
  updatedAt: new Date("2099-02-01T00:00:00.000Z"),
  lastStripeEventId: "evt_previous0001",
  lastStripeEventCreated: 1_000,
  ...overrides,
});

const memoryStore = (initial?: Data) => {
  const documents = new Map<string, Data>();
  if (initial) documents.set(OWNER_ID, structuredClone(initial));
  const metrics = { getCalls: 0, transactionCalls: 0, writes: 0 };

  const store: BillingProjectionStore = {
    async get(ownerId) {
      metrics.getCalls += 1;
      const data = documents.get(ownerId);
      return data ? structuredClone(data) : null;
    },
    async runTransaction(ownerId, operation) {
      metrics.transactionCalls += 1;
      const current = documents.get(ownerId);
      const mutation = operation(current ? structuredClone(current) : null);
      if (mutation.replacement) {
        metrics.writes += 1;
        documents.set(ownerId, structuredClone(mutation.replacement));
      }
      return mutation.result;
    },
  };

  return { documents, metrics, store };
};

const setup = (initial?: Data) => {
  const memory = memoryStore(initial);
  const service = createBillingService({ store: memory.store, now: () => NOW });
  const apply = (
    stripeEvent: StripeEventCursor,
    snapshot: BillingStripeSnapshot,
    overrides: Partial<{ ownerId: string; pageSlug: string }> = {},
  ) => service.applyStripeBillingSnapshot({
    ownerId: OWNER_ID,
    pageSlug: PAGE_SLUG,
    event: stripeEvent,
    snapshot,
    ...overrides,
  });
  const reconcile = (
    stripeEvent: StripeEventCursor,
    snapshot: BillingStripeSnapshot,
    overrides: Partial<{ ownerId: string; pageSlug: string }> = {},
  ) => service.reconcileStripeBillingSnapshot({
    ownerId: OWNER_ID,
    pageSlug: PAGE_SLUG,
    event: stripeEvent,
    snapshot,
    ...overrides,
  });
  return { ...memory, apply, reconcile, service };
};

test("evento mais novo é aplicado atomicamente", async () => {
  const context = setup(storedBilling());
  const result = await context.apply(event("evt_newer000001", 1_001), stripeSnapshot("canceled"));
  assert.equal(result.decision, "APPLIED");
  assert.equal(result.billing?.status, "canceled");
  assert.deepEqual(context.metrics, { getCalls: 0, transactionCalls: 1, writes: 1 });
});

test("mesmo event.id é DUPLICATE e não reaplica", async () => {
  const context = setup(storedBilling());
  const first = await context.apply(event("evt_newer000001", 1_001), stripeSnapshot("canceled"));
  const afterFirst = structuredClone(context.documents.get(OWNER_ID));
  const duplicate = await context.apply(event("evt_newer000001", 1_001), stripeSnapshot("active"));
  assert.equal(first.decision, "APPLIED");
  assert.equal(duplicate.decision, "DUPLICATE");
  assert.deepEqual(context.documents.get(OWNER_ID), afterFirst);
  assert.equal(context.metrics.writes, 1);
});

test("evento anterior é STALE e não regride projeção", async () => {
  const context = setup(storedBilling({ status: "active" }));
  const result = await context.apply(event("evt_delayed0001", 999), stripeSnapshot("canceled"));
  assert.equal(result.decision, "STALE");
  assert.equal(context.documents.get(OWNER_ID)?.status, "active");
  assert.equal(context.metrics.writes, 0);
});

test("evento antigo após canceled não reativa assinatura", async () => {
  const context = setup(storedBilling({ status: "canceled" }));
  const result = await context.apply(event("evt_oldactive01", 999), stripeSnapshot("active"));
  assert.equal(result.decision, "STALE");
  assert.equal(context.documents.get(OWNER_ID)?.status, "canceled");
  assert.equal(context.metrics.writes, 0);
});

test("IDs diferentes no mesmo segundo exigem sincronização e não escrevem", async () => {
  const context = setup(storedBilling());
  const result = await context.apply(event("evt_collision01", 1_000), stripeSnapshot("canceled"));
  assert.equal(result.decision, "REQUIRES_STRIPE_SYNC");
  assert.equal(context.documents.get(OWNER_ID)?.status, "active");
  assert.equal(context.metrics.writes, 0);
});

test("reconciliação canônica substitui snapshot no mesmo segundo e avança o event ID", async () => {
  const context = setup(storedBilling());
  const result = await context.reconcile(
    event("evt_collision02", 1_000),
    stripeSnapshot("canceled", { stripeCustomerId: "cus_owner_a" }),
  );
  assert.equal(result.decision, "RECONCILED");
  assert.equal(result.billing?.status, "canceled");
  assert.equal(result.billing?.lastStripeEventId, "evt_collision02");
  assert.equal(result.billing?.lastStripeEventCreated, 1_000);
  assert.equal(context.metrics.writes, 1);
});

test("reconciliação canônica rejeita cursor fora da colisão", async () => {
  const context = setup(storedBilling());
  await assert.rejects(
    context.reconcile(event("evt_collision03", 1_001), stripeSnapshot("active")),
    /Cursor incompatível/,
  );
  assert.equal(context.metrics.writes, 0);
});

test("reconciliação canônica não permite mudança de page/owner binding", async () => {
  const context = setup(storedBilling());
  await assert.rejects(
    context.reconcile(event("evt_collision04", 1_000), stripeSnapshot("active"), {
      pageSlug: "salao-b",
    }),
    /pageSlug divergente/,
  );
  assert.equal(context.metrics.writes, 0);
});

for (const invalidEvent of [
  event("", 1_001),
  event("not_an_event", 1_001),
  event("evt_short", 1_001),
  event("evt_valid0001", -1),
  event("evt_valid0001", 1.5),
]) {
  test(`evento inválido é rejeitado: ${JSON.stringify(invalidEvent)}`, async () => {
    const context = setup(storedBilling());
    await assert.rejects(context.apply(invalidEvent, stripeSnapshot("active")), /Stripe event/);
    assert.equal(context.metrics.transactionCalls, 0);
  });
}

test("snapshot canceled substitui active sem preservar estado anterior", async () => {
  const context = setup(storedBilling({ status: "active", cancelAtPeriodEnd: true }));
  await context.apply(event("evt_canceled001", 1_001), stripeSnapshot("canceled"));
  const stored = context.documents.get(OWNER_ID)!;
  assert.equal(stored.status, "canceled");
  assert.equal("cancelAtPeriodEnd" in stored, false);
});

test("snapshot sem subscription remove IDs antigos", async () => {
  const context = setup(storedBilling({
    stripeSubscriptionId: "sub_old",
    stripePriceId: "price_old",
    currentPeriodEnd: new Date("2099-03-01T00:00:00.000Z"),
  }));
  await context.apply(event("evt_nosub000001", 1_001), stripeSnapshot(undefined, {
    stripeCustomerId: "cus_owner_a",
  }));
  const stored = context.documents.get(OWNER_ID)!;
  assert.equal(stored.stripeCustomerId, "cus_owner_a");
  for (const field of ["stripeSubscriptionId", "stripePriceId", "currentPeriodEnd", "status"]) {
    assert.equal(field in stored, false, `${field} deve ser removido`);
  }
});

test("transição para active limpa pastDueSince antigo", async () => {
  const context = setup(storedBilling({
    status: "past_due",
    pastDueSince: new Date("2099-02-09T00:00:00.000Z"),
  }));
  await context.apply(event("evt_recovered01", 1_001), stripeSnapshot("active"));
  assert.equal("pastDueSince" in context.documents.get(OWNER_ID)!, false);
});

test("primeira entrada past_due recebe pastDueSince server-side dentro da transação", async () => {
  const context = setup(storedBilling({ status: "active" }));
  await context.apply(
    event("evt_firstpastdue", 1_001),
    stripeSnapshot("past_due", { pastDueSince: new Date("2000-01-01T00:00:00.000Z") }),
  );
  assert.deepEqual(context.documents.get(OWNER_ID)?.pastDueSince, NOW);
});

test("past_due repetido preserva o primeiro pastDueSince", async () => {
  const firstPastDue = new Date("2099-02-09T00:00:00.000Z");
  const context = setup(storedBilling({ status: "past_due", pastDueSince: firstPastDue }));
  await context.apply(event("evt_repeatpast01", 1_001), stripeSnapshot("past_due"));
  assert.deepEqual(context.documents.get(OWNER_ID)?.pastDueSince, firstPastDue);
});

test("entradas past_due concorrentes convergem para um único pastDueSince transacional", async () => {
  const context = setup(storedBilling({ status: "active" }));
  await Promise.all([
    context.apply(event("evt_concurrent01", 1_001), stripeSnapshot("past_due")),
    context.apply(event("evt_concurrent02", 1_002), stripeSnapshot("past_due")),
  ]);
  assert.deepEqual(context.documents.get(OWNER_ID)?.pastDueSince, NOW);
});

for (const recoveredStatus of [
  "active", "trialing", "unpaid", "canceled", "paused", "incomplete", "incomplete_expired",
] as const) {
  test(`past_due → ${recoveredStatus} remove pastDueSince`, async () => {
    const context = setup(storedBilling({
      status: "past_due",
      pastDueSince: new Date("2099-02-09T00:00:00.000Z"),
    }));
    await context.apply(
      event(`evt_clear${recoveredStatus.replaceAll("_", "")}0001`, 1_001),
      stripeSnapshot(recoveredStatus),
    );
    assert.equal("pastDueSince" in context.documents.get(OWNER_ID)!, false);
  });
}

test("createdAt é preservado e updatedAt usa horário server-side", async () => {
  const createdAt = new Date("2090-01-01T00:00:00.000Z");
  const context = setup(storedBilling({ createdAt }));
  const result = await context.apply(event("evt_timestamps1", 1_001), stripeSnapshot("active"));
  assert.deepEqual(result.billing?.createdAt, createdAt);
  assert.deepEqual(result.billing?.updatedAt, NOW);
  assert.deepEqual(context.documents.get(OWNER_ID)?.createdAt, createdAt);
  assert.deepEqual(context.documents.get(OWNER_ID)?.updatedAt, NOW);
});

test("registro novo recebe createdAt e updatedAt server-side", async () => {
  const context = setup();
  const result = await context.apply(event("evt_first000001", 1), stripeSnapshot("active"));
  assert.deepEqual(result.billing?.createdAt, NOW);
  assert.deepEqual(result.billing?.updatedAt, NOW);
});

for (const status of [
  "trialing", "active", "past_due", "unpaid", "canceled",
  "incomplete", "incomplete_expired", "paused",
] as const) {
  test(`status conhecido ${status} é aceito`, async () => {
    const context = setup();
    const result = await context.apply(event(`evt_${status.replaceAll("_", "")}00000001`, 1), stripeSnapshot(status));
    assert.equal(result.billing?.status, status);
  });
}

test("status desconhecido é rejeitado antes da transação", async () => {
  const context = setup();
  const snapshot = { status: "future_status" } as unknown as BillingStripeSnapshot;
  await assert.rejects(
    context.apply(event("evt_unknown0001", 1), snapshot),
    /Status Stripe desconhecido/,
  );
  assert.equal(context.metrics.transactionCalls, 0);
});

test("status desconhecido persistido falha explicitamente na leitura", async () => {
  const context = setup(storedBilling({ status: "future_status" }));
  await assert.rejects(context.service.getBillingByOwnerId(OWNER_ID), /Status Stripe desconhecido/);
});

for (const invalidOwnerId of ["", " owner-a", "owner/a", "owner\u0000a", "x".repeat(129)]) {
  test(`ownerId inválido é rejeitado: ${JSON.stringify(invalidOwnerId)}`, async () => {
    const context = setup();
    await assert.rejects(
      context.apply(event("evt_owner000001", 1), stripeSnapshot("active"), { ownerId: invalidOwnerId }),
      /ownerId inválido/,
    );
  });
}

test("pageSlug existente é preservado e divergência é rejeitada", async () => {
  const context = setup(storedBilling());
  await assert.rejects(
    context.apply(event("evt_wrongpage01", 1_001), stripeSnapshot("active"), { pageSlug: "salao-b" }),
    /pageSlug divergente/,
  );
  assert.equal(context.documents.get(OWNER_ID)?.pageSlug, PAGE_SLUG);
});

test("Stripe falha explicitamente sem STRIPE_SECRET_KEY", () => {
  assert.throws(() => getStripeSecretKey({}), /STRIPE_SECRET_KEY/);
});

test("BillingRecord não modela dados financeiros sensíveis", async () => {
  const source = await readFile("src/lib/billingTypes.ts", "utf8");
  for (const forbidden of ["cardNumber", "cvc", "paymentMethod:", "secretKey"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} não deve integrar o modelo`);
  }
});

test("serviço real permanece server-only e usa Firebase Admin", async () => {
  const source = await readFile("src/lib/billingService.ts", "utf8");
  const adminSource = await readFile("src/lib/firebaseAdmin.ts", "utf8");
  assert.equal(source.includes('import "server-only"'), true);
  assert.equal(source.includes("getAdminFirestore"), true);
  assert.equal(adminSource.includes("firebase-admin/firestore"), true);
  assert.equal(source.includes("firebase/firestore"), false);
});

test("fundação não implementa Checkout, Portal ou webhook HTTP", async () => {
  const sources = await Promise.all([
    readFile("src/lib/stripeServer.ts", "utf8"),
    readFile("src/lib/billingService.ts", "utf8"),
    readFile("src/lib/commercialEntitlement.ts", "utf8"),
  ]);
  const combined = sources.join("\n");
  for (const forbidden of ["checkout.sessions", "billingPortal.sessions", "webhooks.constructEvent"]) {
    assert.equal(combined.includes(forbidden), false);
  }
});
