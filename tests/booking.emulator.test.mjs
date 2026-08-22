import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import {
  BookAppointmentRequestError,
} from "../src/lib/bookingClient.ts";
import {
  bookingAppointmentId,
  bookingLockIds,
  createFirestoreBookingStore,
  handleBookingRequest,
  InvalidBookingTokenError,
  verifyBookingIdToken,
} from "../src/lib/bookingService.ts";
import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  createFirestoreAvailabilityStore,
  handlePublicAvailabilityRequest,
} from "../src/lib/publicAvailability.ts";

const PROJECT_ID = "demo-beautypro-booking";
const TOKEN = "header.payload.signature";
const NOW = new Date("2099-01-01T00:00:00.000Z");
const DAY = "2099-03-01";
const SERVICE = { title: "Corte", type: "service", durationMinutes: 60, price: "50,00", order: 1 };

let app;
let db;

const clearFirestore = async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(host, "FIRESTORE_EMULATOR_HOST deve estar definido");
  const response = await fetch(
    `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  assert.equal(response.ok, true);
};

const page = (overrides = {}) => ({
  userId: "owner-a",
  slug: "salao-a",
  title: "Salão A",
  bio: "A",
  plan: "pro",
  trialDeadline: null,
  isOpen: true,
  timezone: "UTC",
  links: [SERVICE],
  schedule: { open: "00:00", close: "23:59" },
  ...overrides,
});

const seedPages = async () => {
  await Promise.all([
    db.collection("pages").doc("salao-a").set(page()),
    db.collection("pages").doc("salao-b").set(page({
      userId: "owner-b", slug: "salao-b", title: "Salão B",
    })),
    db.collection("users").doc("owner-a").set({
      role: "owner", pageSlug: "salao-a", plan: "pro", trialDeadline: null,
    }),
    db.collection("users").doc("owner-b").set({
      role: "owner", pageSlug: "salao-b", plan: "pro", trialDeadline: null,
    }),
  ]);
};

const seedBilling = async (ownerId, overrides = {}) => {
  await db.collection("billing").doc(ownerId).set({
    ownerId,
    pageSlug: ownerId === "owner-b" ? "salao-b" : "salao-a",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
};

const body = (overrides = {}) => ({
  pageSlug: "salao-a",
  startAt: `${DAY}T10:00:00.000Z`,
  services: ["Corte"],
  customerName: "Cliente",
  customerPhone: "55000000000",
  idempotencyKey: "booking-attempt-0001",
  ...overrides,
});

const request = (payload, authorization = `Bearer ${TOKEN}`) =>
  new Request("http://localhost/api/book", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

const responseBody = async (response) => response.json();

const book = async (
  payload = body(),
  uid = "customer-a",
  store = createFirestoreBookingStore(db),
  currentNow = NOW,
) => {
  const response = await handleBookingRequest(request(payload), {
    verifyIdToken: async () => ({ uid, email: `${uid}@example.com` }),
    store,
    now: () => currentNow,
  });
  return { response, payload: await responseBody(response) };
};

const seedLegacy = async ({
  id = `legacy-${Math.random()}`,
  pageSlug = "salao-a",
  startAt = `${DAY}T10:00:00.000Z`,
  endAt = `${DAY}T11:00:00.000Z`,
  status = "pending",
} = {}) => {
  await db.collection("appointments").doc(id).set({
    pageSlug,
    serviceId: "legacy",
    serviceName: "Legado",
    customerId: "legacy-customer",
    customerName: "Legado",
    customerPhone: "5500",
    startAt: new Date(startAt),
    endAt: new Date(endAt),
    status,
    createdAt: NOW,
    totalValue: 10,
  });
  return id;
};

const list = async (collection) => (await db.collection(collection).get()).docs;
const blockingAppointments = async () =>
  (await list("appointments")).filter((snapshot) => snapshot.data().status !== "cancelled");
const assertNoBookingWrites = async () => {
  assert.equal((await list("appointments")).length, 0);
  assert.equal((await list("bookingLocks")).length, 0);
};

before(async () => {
  app = initializeApp({ projectId: PROJECT_ID }, `booking-tests-${Date.now()}`);
  db = getFirestore(app);
});

beforeEach(async () => {
  await clearFirestore();
  await seedPages();
});

after(async () => {
  await deleteApp(app);
});

test("primeiro booking livre cria appointment pending e locks atômicos", async () => {
  const result = await book();
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.status, "BOOKED");
  const appointment = (await db.collection("appointments").doc(result.payload.appointmentId).get()).data();
  assert.equal(appointment.customerId, "customer-a");
  assert.equal(appointment.status, "pending");
  assert.equal(appointment.serviceName, "Corte");
  assert.equal(appointment.totalValue, 50);
  assert.equal(appointment.customerPhoto, undefined);
  const locks = await list("bookingLocks");
  assert.equal(locks.length, 2);
  assert.equal(locks.every((lock) => lock.data().appointmentId === result.payload.appointmentId), true);
});

test("22/08/2026 16:00 Bahia não falha quando o runtime conceitual é UTC", async () => {
  await db.collection("pages").doc("salao-a").update({
    timezone: "America/Bahia",
    schedule: { open: "09:00", close: "19:00", workingDays: [6] },
    links: [{ ...SERVICE, durationMinutes: 30 }],
  });
  const result = await book(
    body({
      startAt: "2026-08-22T19:00:00.000Z",
      idempotencyKey: "manual-timezone-1600",
    }),
    "customer-a",
    createFirestoreBookingStore(db),
    new Date("2026-08-21T12:00:00.000Z"),
  );
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.startAt, "2026-08-22T19:00:00.000Z");
  const appointment = (
    await db.collection("appointments").doc(result.payload.appointmentId).get()
  ).data();
  assert.equal(appointment.startAt.toDate().toISOString(), "2026-08-22T19:00:00.000Z");
  assert.equal(appointment.endAt.toDate().toISOString(), "2026-08-22T19:30:00.000Z");
});

test("Stripe ACTIVE permite novo booking", async () => {
  await seedBilling("owner-a");
  const result = await book(body({ idempotencyKey: "commercial-active-01" }));
  assert.equal(result.response.status, 201);
  assert.equal((await list("appointments")).length, 1);
  assert.equal((await list("bookingLocks")).length, 2);
});

test("promotional trial ativo permite novo booking", async () => {
  const deadline = new Date(NOW.getTime() + 24 * 60 * 60 * 1_000);
  await Promise.all([
    db.collection("users").doc("owner-a").update({ trialDeadline: deadline }),
    db.collection("pages").doc("salao-a").update({ trialDeadline: deadline }),
  ]);
  assert.equal((await book(body({ idempotencyKey: "commercial-trial-01" }))).response.status, 201);
});

test("past_due dentro da grace permite novo booking", async () => {
  await seedBilling("owner-a", {
    status: "past_due",
    pastDueSince: new Date(NOW.getTime() - 24 * 60 * 60 * 1_000),
  });
  assert.equal((await book(body({ idempotencyKey: "commercial-grace-01" }))).response.status, 201);
});

test("BLOCKED nega booking com resposta genérica e zero writes", async () => {
  await Promise.all([
    db.collection("users").doc("owner-a").update({ plan: "free" }),
    db.collection("pages").doc("salao-a").update({ plan: "free" }),
  ]);
  const result = await book(body({ idempotencyKey: "commercial-blocked-01" }));
  assert.equal(result.response.status, 403);
  assert.deepEqual(result.payload, {
    error: {
      code: "COMMERCIAL_BOOKING_BLOCKED",
      message: "Novos agendamentos estão indisponíveis para este estabelecimento.",
    },
  });
  await assertNoBookingWrites();
});

test("past_due fora da grace nega booking com zero writes", async () => {
  await seedBilling("owner-a", {
    status: "past_due",
    pastDueSince: new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1_000),
  });
  await Promise.all([
    db.collection("users").doc("owner-a").update({ plan: "free" }),
    db.collection("pages").doc("salao-a").update({ plan: "free" }),
  ]);
  const result = await book(body({ idempotencyKey: "commercial-expired-01" }));
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, "COMMERCIAL_BOOKING_BLOCKED");
  await assertNoBookingWrites();
});

test("binding owner/page inconsistente falha fechado com zero writes", async () => {
  await db.collection("users").doc("owner-a").update({ pageSlug: "salao-b" });
  const result = await book(body({ idempotencyKey: "binding-mismatch-0001" }));
  assert.equal(result.response.status, 503);
  await assertNoBookingWrites();
});

test("billing cross-tenant falha fechado com zero writes", async () => {
  await seedBilling("owner-a", { pageSlug: "salao-b" });
  const result = await book(body({ idempotencyKey: "billing-cross-tenant" }));
  assert.equal(result.response.status, 503);
  await assertNoBookingWrites();
});

test("ADMIN_BYPASS não autoriza booking público e não escreve", async () => {
  await Promise.all([
    db.collection("pages").doc("salao-a").update({ userId: OFFICIAL_SUPERADMIN_UID }),
    db.collection("users").doc(OFFICIAL_SUPERADMIN_UID).set({ pageSlug: "salao-a" }),
  ]);
  const result = await book(body({ idempotencyKey: "admin-bypass-booking" }));
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, "COMMERCIAL_BOOKING_BLOCKED");
  await assertNoBookingWrites();
});
test("estado comercial fora da whitelist falha fechado sem writes", async () => {
  const response = await handleBookingRequest(request(body({
    idempotencyKey: "unknown-commercial-state",
  })), {
    verifyIdToken: async () => ({ uid: "customer-a" }),
    store: createFirestoreBookingStore(db),
    resolveCommercialEntitlement: () => ({ state: "FUTURE_STATE" }),
    now: () => NOW,
  });
  const payload = await responseBody(response);
  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "COMMERCIAL_BOOKING_BLOCKED");
  await assertNoBookingWrites();
});


test("retry idempotente permanece ALREADY_BOOKED após tenant virar BLOCKED", async () => {
  const first = await book(body({ idempotencyKey: "blocked-retry-existing" }));
  await Promise.all([
    db.collection("users").doc("owner-a").update({ plan: "free" }),
    db.collection("pages").doc("salao-a").update({ plan: "free" }),
  ]);
  const appointmentsBefore = (await list("appointments")).length;
  const locksBefore = (await list("bookingLocks")).length;
  const retry = await book(body({ idempotencyKey: "blocked-retry-existing" }));
  assert.equal(first.response.status, 201);
  assert.equal(retry.response.status, 200);
  assert.equal(retry.payload.status, "ALREADY_BOOKED");
  assert.equal((await list("appointments")).length, appointmentsBefore);
  assert.equal((await list("bookingLocks")).length, locksBefore);
});

test("duas requisições concorrentes para o mesmo slot produzem um vencedor real", async () => {
  const [a, b] = await Promise.all([
    book(body({ idempotencyKey: "concurrent-customer-a" }), "customer-a"),
    book(body({ idempotencyKey: "concurrent-customer-b" }), "customer-b"),
  ]);
  assert.deepEqual([a.response.status, b.response.status].sort(), [201, 409]);
  assert.equal(
    [a.payload.error?.code, b.payload.error?.code].includes("SLOT_UNAVAILABLE"),
    true,
  );
  assert.equal((await blockingAppointments()).length, 1);
  const locks = await list("bookingLocks");
  assert.equal(locks.length, 2);
  assert.equal(new Set(locks.map((lock) => lock.data().appointmentId)).size, 1);
});

for (const [name, key, startAt, endAt] of [
  ["overlap parcial no início", "overlap-start-0001", `${DAY}T09:30:00.000Z`, `${DAY}T10:30:00.000Z`],
  ["overlap parcial no fim", "overlap-end-000001", `${DAY}T10:30:00.000Z`, `${DAY}T11:30:00.000Z`],
  ["novo intervalo envolve existente", "overlap-contains-01", `${DAY}T09:30:00.000Z`, `${DAY}T11:30:00.000Z`],
  ["novo intervalo contido no existente", "overlap-contained-1", `${DAY}T10:30:00.000Z`, `${DAY}T11:00:00.000Z`],
]) {
  test(`${name} é negado pela defesa de legado`, async () => {
    const durationMinutes =
      (new Date(endAt).getTime() - new Date(startAt).getTime()) / (60 * 1000);
    await db.collection("pages").doc("salao-a").update({
      links: [{ ...SERVICE, durationMinutes }],
    });
    await seedLegacy({
      startAt: `${DAY}T10:00:00.000Z`,
      endAt: name.includes("contido") ? `${DAY}T11:30:00.000Z` : `${DAY}T11:00:00.000Z`,
    });
    const result = await book(body({
      startAt,
      idempotencyKey: key,
      services: ["Corte"],
    }));
    assert.equal(result.response.status, 409);
    assert.equal(result.payload.error.code, "SLOT_UNAVAILABLE");
    assert.equal((await list("bookingLocks")).length, 0);
    assert.equal((await list("appointments")).length, 1);
    assert.ok(new Date(endAt) > new Date(startAt));
  });
}

test("terminar exatamente quando o existente começa é permitido", async () => {
  await seedLegacy({ startAt: `${DAY}T10:00:00.000Z`, endAt: `${DAY}T11:00:00.000Z` });
  const result = await book(body({
    startAt: `${DAY}T09:00:00.000Z`, idempotencyKey: "boundary-before-0001",
  }));
  assert.equal(result.response.status, 201);
});

test("começar exatamente quando o existente termina é permitido", async () => {
  await seedLegacy({ startAt: `${DAY}T10:00:00.000Z`, endAt: `${DAY}T11:00:00.000Z` });
  const result = await book(body({
    startAt: `${DAY}T11:00:00.000Z`, idempotencyKey: "boundary-after-0001",
  }));
  assert.equal(result.response.status, 201);
});

for (const status of ["pending", "confirmed", "completed", "unexpected"]) {
  test(`appointment legado ${status} bloqueia`, async () => {
    await seedLegacy({ status });
    const result = await book(body({ idempotencyKey: `legacy-status-${status}-0001` }));
    assert.equal(result.response.status, 409);
    assert.equal(result.payload.error.code, "SLOT_UNAVAILABLE");
  });
}

test("appointment legado cancelled não bloqueia", async () => {
  await seedLegacy({ status: "cancelled" });
  assert.equal((await book(body({ idempotencyKey: "legacy-cancelled-0001" }))).response.status, 201);
});

test("tenant A não bloqueia tenant B", async () => {
  await seedLegacy();
  const result = await book(body({
    pageSlug: "salao-b", idempotencyKey: "other-tenant-booking-01",
  }), "customer-b");
  assert.equal(result.response.status, 201);
});

test("mesmo UID, key e payload retorna o mesmo appointment", async () => {
  const first = await book();
  const retry = await book();
  assert.equal(first.response.status, 201);
  assert.equal(retry.response.status, 200);
  assert.equal(retry.payload.status, "ALREADY_BOOKED");
  assert.equal(retry.payload.appointmentId, first.payload.appointmentId);
  assert.equal((await list("appointments")).length, 1);
});

test("duplo clique concorrente é idempotente", async () => {
  const [a, b] = await Promise.all([book(), book()]);
  assert.deepEqual([a.response.status, b.response.status].sort(), [200, 201]);
  assert.equal(a.payload.appointmentId, b.payload.appointmentId);
  assert.equal((await list("appointments")).length, 1);
});

test("retry após resposta perdida simulada recupera o mesmo appointment", async () => {
  const lost = await book(body({ idempotencyKey: "lost-response-attempt" }));
  const recovered = await book(body({ idempotencyKey: "lost-response-attempt" }));
  assert.equal(lost.payload.appointmentId, recovered.payload.appointmentId);
  assert.equal(recovered.payload.status, "ALREADY_BOOKED");
});

test("mesma key com payload diferente gera IDEMPOTENCY_CONFLICT", async () => {
  await book();
  const conflict = await book(body({ customerName: "Outro nome" }));
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.payload.error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal((await list("appointments")).length, 1);
});

test("UIDs diferentes com a mesma key geram IDs independentes", async () => {
  const first = await book(body({ startAt: `${DAY}T08:00:00.000Z` }), "customer-a");
  const second = await book(body({ startAt: `${DAY}T12:00:00.000Z` }), "customer-b");
  assert.notEqual(first.payload.appointmentId, second.payload.appointmentId);
  assert.equal(first.payload.appointmentId, bookingAppointmentId("customer-a", body().idempotencyKey));
  assert.equal((await list("appointments")).length, 2);
});

test("falha injetada antes do commit não deixa escrita parcial", async () => {
  const failingStore = createFirestoreBookingStore(db, {
    beforeTransactionCommit: () => { throw new Error("falha injetada"); },
  });
  const result = await book(body({ idempotencyKey: "atomic-failure-0001" }), "customer-a", failingStore);
  assert.equal(result.response.status, 503);
  assert.equal((await list("appointments")).length, 0);
  assert.equal((await list("bookingLocks")).length, 0);
});

test("lock órfão falha fechado", async () => {
  const start = new Date(body().startAt);
  const lockId = bookingLockIds("salao-a", start, new Date(start.getTime() + 60 * 60 * 1000))[0];
  await db.collection("bookingLocks").doc(lockId).set({
    pageSlug: "salao-a", slotStart: start, appointmentId: "missing", createdAt: NOW,
  });
  const result = await book();
  assert.equal(result.response.status, 503);
  assert.equal((await list("appointments")).length, 0);
});

test("pending cancelado libera availability e permite reclaim dos locks", async () => {
  const first = await book();
  await db.collection("appointments").doc(first.payload.appointmentId).update({ status: "cancelled" });
  const availabilityStore = createFirestoreAvailabilityStore(() => db);
  const availability = await handlePublicAvailabilityRequest(
    new Request("http://localhost/api/availability", {
      method: "POST",
      body: JSON.stringify({
        pageSlug: "salao-a",
        startAt: `${DAY}T10:00:00.000Z`,
        endAt: `${DAY}T11:00:00.000Z`,
      }),
    }),
    availabilityStore,
  );
  assert.deepEqual((await availability.json()).busyIntervals, []);
  const replacement = await book(body({ idempotencyKey: "replacement-after-cancel" }), "customer-b");
  assert.equal(replacement.response.status, 201);
  const locks = await list("bookingLocks");
  assert.equal(locks.every((lock) => lock.data().appointmentId === replacement.payload.appointmentId), true);
  assert.equal((await blockingAppointments()).length, 1);
});

test("confirmed cancelado também permite reutilização", async () => {
  const first = await book(body({ idempotencyKey: "confirmed-cancel-old" }));
  const ref = db.collection("appointments").doc(first.payload.appointmentId);
  await ref.update({ status: "confirmed" });
  await ref.update({ status: "cancelled" });
  const replacement = await book(body({ idempotencyKey: "confirmed-cancel-new" }), "customer-b");
  assert.equal(replacement.response.status, 201);
  assert.equal((await blockingAppointments()).length, 1);
});

test("cancelamento concorrente com novo booking nunca deixa dois bloqueadores", async () => {
  const first = await book(body({ idempotencyKey: "cancel-race-old-0001" }));
  const oldRef = db.collection("appointments").doc(first.payload.appointmentId);
  const replacementBody = body({ idempotencyKey: "cancel-race-new-0001" });
  const [cancelResult, attempt] = await Promise.allSettled([
    db.runTransaction(async (transaction) => {
      await transaction.get(oldRef);
      transaction.update(oldRef, { status: "cancelled" });
    }),
    book(replacementBody, "customer-b"),
  ]);
  assert.equal(cancelResult.status, "fulfilled");
  if (attempt.status === "rejected" || attempt.value.response.status !== 201) {
    assert.equal((await book(replacementBody, "customer-b")).response.status, 201);
  }
  assert.equal((await blockingAppointments()).length, 1);
});

test("requisição sem autenticação não cria", async () => {
  const response = await handleBookingRequest(request(body(), ""), {
    verifyIdToken: async () => ({ uid: "forged" }),
    store: createFirestoreBookingStore(db),
  });
  assert.equal(response.status, 401);
  assert.equal((await list("appointments")).length, 0);
});

test("token inválido não cria", async () => {
  const response = await handleBookingRequest(request(body()), {
    verifyIdToken: async () => { throw new InvalidBookingTokenError(); },
    store: createFirestoreBookingStore(db),
  });
  assert.equal(response.status, 401);
  assert.equal((await list("appointments")).length, 0);
});

test("classificação de token distingue credencial de infraestrutura", async () => {
  await assert.rejects(verifyBookingIdToken("inválido", async () => ({ uid: "x" })), InvalidBookingTokenError);
  await assert.rejects(
    verifyBookingIdToken(TOKEN, async () => {
      throw { code: "auth/invalid-id-token", message: "inválido" };
    }),
    InvalidBookingTokenError,
  );
  await assert.rejects(
    verifyBookingIdToken(TOKEN, async () => { throw new Error("infra"); }),
    /infra/,
  );
});

for (const forbidden of [
  "customerId", "status", "createdAt", "endAt", "totalValue", "durationMinutes",
  "ownerId",
  "plan",
  "trialDeadline",
  "billingStatus",
  "entitlement",
]) {
  test(`campo controlado pelo cliente é rejeitado: ${forbidden}`, async () => {
    const result = await book(body({ [forbidden]: forbidden === "totalValue" ? 1 : "forged" }));
    assert.equal(result.response.status, 400);
    assert.equal((await list("appointments")).length, 0);
  });
}

test("customerId e email persistidos vêm somente do token", async () => {
  const result = await book();
  const appointment = (await db.collection("appointments").doc(result.payload.appointmentId).get()).data();
  assert.equal(appointment.customerId, "customer-a");
  assert.equal(appointment.customerEmail, "customer-a@example.com");
});

test("serviço inexistente é rejeitado", async () => {
  const result = await book(body({ services: ["Inexistente"] }));
  assert.equal(result.response.status, 400);
});

test("serviço ambíguo é rejeitado", async () => {
  await db.collection("pages").doc("salao-a").update({ links: [SERVICE, { ...SERVICE, order: 2 }] });
  const result = await book();
  assert.equal(result.response.status, 400);
});

test("serviço desativado é rejeitado", async () => {
  await db.collection("pages").doc("salao-a").update({ links: [{ ...SERVICE, active: false }] });
  assert.equal((await book()).response.status, 400);
});

test("duração e preço persistidos são derivados da page", async () => {
  const result = await book();
  const appointment = (await db.collection("appointments").doc(result.payload.appointmentId).get()).data();
  assert.equal(appointment.endAt.toDate().toISOString(), `${DAY}T11:00:00.000Z`);
  assert.equal(appointment.totalValue, 50);
});

test("grade, passado, fechamento e almoço são validados no servidor", async () => {
  assert.equal((await book(body({
    startAt: `${DAY}T10:15:00.000Z`, idempotencyKey: "off-grid-attempt-0001",
  }))).response.status, 400);
  assert.equal((await book(body({
    startAt: "2000-01-01T10:00:00.000Z", idempotencyKey: "past-attempt-0000001",
  }))).response.status, 409);
  await db.collection("pages").doc("salao-a").update({
    schedule: { open: "09:00", close: "11:00", lunchStart: "10:00", lunchEnd: "10:30" },
  });
  assert.equal((await book(body({ idempotencyKey: "lunch-attempt-000001" }))).response.status, 409);
  assert.equal((await book(body({
    startAt: `${DAY}T10:30:00.000Z`, idempotencyKey: "closing-attempt-0001",
  }))).response.status, 409);
});

test("cliente de booking rejeita resposta inválida", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ status: "BOOKED" });
  try {
    await assert.rejects(
      import("../src/lib/bookingClient.ts").then(({ bookAppointment }) =>
        bookAppointment(body(), TOKEN)),
      BookAppointmentRequestError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
