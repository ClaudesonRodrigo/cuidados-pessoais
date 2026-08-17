import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  handleAdminAppointmentStatusRequest,
  type AdminAppointmentsDependencies,
  type AdminAppointmentsStore,
  type AppointmentStatus,
} from "../src/lib/adminAppointmentsService.ts";
import {
  requireCommercialAccess,
  type CommercialContextDependencies,
} from "../src/lib/commercialAccessService.ts";
import type { BillingRecord } from "../src/lib/billingTypes.ts";

const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const APPOINTMENT_ID = "legacy-appointment_A.2024";
const TOKEN = "header.payload.signature";
const NOW = new Date("2026-08-17T12:00:00.000Z");
type Data = Record<string, unknown>;

const billingRecord = (overrides: Partial<BillingRecord> = {}): BillingRecord => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

class MemoryAdminAppointmentsStore implements AdminAppointmentsStore {
  appointments = new Map<string, Data>([[APPOINTMENT_ID, {
    pageSlug: PAGE_SLUG,
    status: "pending",
    customerId: "customer-a",
  }]]);
  transactionIds: string[] = [];
  updateCalls = 0;
  failWith: unknown;

  async runAppointmentTransaction(
    appointmentId: string,
    operation: (appointment: Data | null) => AppointmentStatus,
  ): Promise<AppointmentStatus> {
    this.transactionIds.push(appointmentId);
    if (this.failWith) throw this.failWith;
    const current = this.appointments.get(appointmentId);
    const status = operation(current ? structuredClone(current) : null);
    this.appointments.set(appointmentId, { ...current, status });
    this.updateCalls += 1;
    return status;
  }
}

const setup = () => {
  let identity = { uid: OWNER_ID };
  let user: Data | null = { role: "owner", pageSlug: PAGE_SLUG, plan: "free" };
  let page: Data | null = { userId: OWNER_ID, slug: PAGE_SLUG, plan: "free" };
  let billing: BillingRecord | null = billingRecord({ status: "active" });
  let tokenFailure: unknown;
  const calls = {
    verifiedTokens: [] as string[],
    userUids: [] as string[],
    pageSlugs: [] as string[],
    billingOwnerIds: [] as string[],
  };
  const store = new MemoryAdminAppointmentsStore();
  const logged: Array<{ ownerId?: string; appointmentId?: string; error: unknown }> = [];
  const commercialDependencies: CommercialContextDependencies = {
    async verifyIdToken(token) {
      calls.verifiedTokens.push(token);
      if (tokenFailure) throw tokenFailure;
      return identity;
    },
    accounts: {
      async getUser(uid) { calls.userUids.push(uid); return user; },
      async getPage(pageSlug) { calls.pageSlugs.push(pageSlug); return page; },
    },
    billing: {
      async getBillingByOwnerId(ownerId) { calls.billingOwnerIds.push(ownerId); return billing; },
    },
    now: () => NOW,
  };
  const dependencies: AdminAppointmentsDependencies = {
    requireCommercialAccess: (request) => requireCommercialAccess(request, commercialDependencies),
    store,
    logError: (entry) => logged.push(entry),
  };
  return {
    dependencies,
    store,
    calls,
    logged,
    setIdentity(uid: string) { identity = { uid }; },
    setUser(value: Data | null) { user = value; },
    setPage(value: Data | null) { page = value; },
    setBilling(value: BillingRecord | null) { billing = value; },
    failToken(error: unknown) { tokenFailure = error; },
  };
};

const request = (
  body: unknown = { action: "confirm" },
  authorization = `Bearer ${TOKEN}`,
  suffix = "",
): Request => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request(`https://beautypro.test/api/admin/appointments/${APPOINTMENT_ID}/status${suffix}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

const execute = (
  context = setup(),
  body?: unknown,
  authorization?: string,
  suffix?: string,
  appointmentId: unknown = APPOINTMENT_ID,
) => handleAdminAppointmentStatusRequest(
  request(body, authorization, suffix),
  appointmentId,
  context.dependencies,
);

const responseBody = (response: Response) => response.json() as Promise<Data>;
const assertError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await responseBody(response) as { error: { code: string; message: string } };
  assert.equal(body.error.code, code);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
};

test("sem Authorization retorna 401", async () => {
  await assertError(await execute(setup(), undefined, ""), 401, "UNAUTHORIZED");
});

test("token inválido retorna 401", async () => {
  const context = setup();
  context.failToken(Object.assign(new Error("expired"), { code: "auth/id-token-expired" }));
  await assertError(await execute(context), 401, "UNAUTHORIZED");
});

test("falha operacional Firebase Admin retorna 503 sanitizado", async () => {
  const context = setup();
  context.failToken(new Error("SECRET_FIREBASE_FAILURE"));
  const response = await execute(context);
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /COMMERCIAL_CONTEXT_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_FIREBASE_FAILURE"), false);
});

for (const [current, action, expected] of [
  ["pending", "confirm", "confirmed"],
  ["pending", "cancel", "cancelled"],
  ["confirmed", "complete", "completed"],
  ["confirmed", "cancel", "cancelled"],
] as const) {
  test(`${current} + ${action} persiste ${expected}`, async () => {
    const context = setup();
    context.store.appointments.get(APPOINTMENT_ID)!.status = current;
    const response = await execute(context, { action });
    assert.equal(response.status, 200);
    assert.equal(context.store.appointments.get(APPOINTMENT_ID)?.status, expected);
    assert.equal(context.store.updateCalls, 1);
    assert.deepEqual(await responseBody(response), {
      ok: true,
      appointment: { id: APPOINTMENT_ID, status: expected },
    });
  });
}

for (const [label, configure] of [
  ["ACTIVE Stripe", (context: ReturnType<typeof setup>) => context.setBilling(billingRecord({ status: "active" }))],
  ["ACTIVE legacy", (context: ReturnType<typeof setup>) => {
    context.setBilling(null);
    context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro" });
    context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro" });
  }],
  ["TRIAL_ACTIVE", (context: ReturnType<typeof setup>) => {
    const trialDeadline = new Date(NOW.getTime() + 86_400_000);
    context.setBilling(null);
    context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro", trialDeadline });
    context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro", trialDeadline });
  }],
  ["PAST_DUE_GRACE", (context: ReturnType<typeof setup>) => context.setBilling(billingRecord({
    status: "past_due",
    pastDueSince: new Date(NOW.getTime() - 71 * 60 * 60 * 1_000),
  }))],
] as const) {
  test(`${label} permite mutation`, async () => {
    const context = setup();
    configure(context);
    assert.equal((await execute(context)).status, 200);
  });
}

test("BLOCKED retorna 403 sem transaction", async () => {
  const context = setup();
  context.setBilling(null);
  await assertError(await execute(context), 403, "COMMERCIAL_ACCESS_BLOCKED");
  assert.deepEqual(context.store.transactionIds, []);
});

test("ADMIN_BYPASS sem tenant retorna 409 sem transaction", async () => {
  const context = setup();
  context.setIdentity(OFFICIAL_SUPERADMIN_UID);
  context.setUser(null);
  context.setPage(null);
  context.setBilling(null);
  await assertError(await execute(context), 409, "TENANT_CONTEXT_REQUIRED");
  assert.deepEqual(context.store.transactionIds, []);
});

test("appointment inexistente retorna 404 sem update", async () => {
  const context = setup();
  await assertError(await execute(context, undefined, undefined, undefined, "missing"), 404, "APPOINTMENT_NOT_FOUND");
  assert.equal(context.store.updateCalls, 0);
});

test("appointment cross-tenant retorna 404 sem update", async () => {
  const context = setup();
  context.store.appointments.get(APPOINTMENT_ID)!.pageSlug = "salao-b";
  await assertError(await execute(context), 404, "APPOINTMENT_NOT_FOUND");
  assert.equal(context.store.updateCalls, 0);
});

for (const [current, action] of [
  ["completed", "cancel"],
  ["cancelled", "confirm"],
  ["pending", "complete"],
  ["confirmed", "confirm"],
] as const) {
  test(`${current} + ${action} retorna 409 e zero update`, async () => {
    const context = setup();
    context.store.appointments.get(APPOINTMENT_ID)!.status = current;
    await assertError(await execute(context, { action }), 409, "APPOINTMENT_STATE_INVALID");
    assert.equal(context.store.updateCalls, 0);
  });
}

test("estado canônico cancelled vence pending visto pela UI", async () => {
  const context = setup();
  context.store.appointments.get(APPOINTMENT_ID)!.status = "cancelled";
  await assertError(await execute(context, { action: "confirm" }), 409, "APPOINTMENT_STATE_INVALID");
  assert.equal(context.store.updateCalls, 0);
});

test("estado canônico completed vence confirmed visto pela UI", async () => {
  const context = setup();
  context.store.appointments.get(APPOINTMENT_ID)!.status = "completed";
  await assertError(await execute(context, { action: "cancel" }), 409, "APPOINTMENT_STATE_INVALID");
  assert.equal(context.store.updateCalls, 0);
});

for (const body of [
  { pageSlug: "salao-b" },
  { customerId: "customer-b" },
  { status: "confirmed" },
  { action: "reopen" },
  { action: "confirm", extra: true },
]) {
  test(`body fechado rejeita ${Object.keys(body).join("+")}`, async () => {
    await assertError(await execute(setup(), body), 400, "INVALID_REQUEST");
  });
}

test("query string inesperada retorna 400", async () => {
  await assertError(await execute(setup(), undefined, undefined, "?pageSlug=salao-b"), 400, "INVALID_REQUEST");
});

test("payload acima de 4 KiB retorna 400", async () => {
  await assertError(await execute(setup(), { action: "confirm", padding: "x".repeat(4_096) }), 400, "INVALID_REQUEST");
});

for (const id of ["", "a/b", "control\u0000id", "x".repeat(201)]) {
  test("appointmentId defensivo rejeita valor inválido", async () => {
    await assertError(await execute(setup(), undefined, undefined, undefined, id), 400, "INVALID_REQUEST");
  });
}

test("appointmentId legado não hexadecimal é aceito e argumentos são preservados", async () => {
  const context = setup();
  assert.equal((await execute(context)).status, 200);
  assert.deepEqual(context.calls.verifiedTokens, [TOKEN]);
  assert.deepEqual(context.calls.userUids, [OWNER_ID]);
  assert.deepEqual(context.calls.pageSlugs, [PAGE_SLUG]);
  assert.deepEqual(context.calls.billingOwnerIds, [OWNER_ID]);
  assert.deepEqual(context.store.transactionIds, [APPOINTMENT_ID]);
});

test("erro Firestore inesperado retorna 503 ADMIN_APPOINTMENTS_UNAVAILABLE sanitizado", async () => {
  const context = setup();
  context.store.failWith = new Error("SECRET_FIRESTORE_FAILURE");
  const response = await execute(context);
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /ADMIN_APPOINTMENTS_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_FIRESTORE_FAILURE"), false);
});

test("adapter real usa appointments/id e update somente após get/operação", async () => {
  const source = await readFile("src/lib/adminAppointments.ts", "utf8");
  assert.match(source, /firestore\.collection\("appointments"\)\.doc\(appointmentId\)/);
  assert.match(source, /runTransaction/);
  assert.match(source, /transaction\.get\(reference\)/);
  assert.match(source, /operation\(snapshot/);
  assert.match(source, /transaction\.update\(reference, \{ status \}\)/);
  assert.ok(source.indexOf("transaction.get(reference)") < source.indexOf("transaction.update(reference"));
});

test("client Owner usa token/API e não importa Firestore nem envia tenant", async () => {
  const client = await readFile("src/lib/adminAppointmentsClient.ts", "utf8");
  assert.match(client, /auth\.currentUser/);
  assert.match(client, /getIdToken\(\)/);
  assert.match(client, /\/api\/admin\/appointments\//);
  assert.equal(client.includes("firebase/firestore"), false);
  for (const forbidden of ["pageSlug", "ownerId", "customerId", "billingStatus", "entitlement"]) {
    assert.equal(client.includes(forbidden), false);
  }
});

test("dashboard preserva ações Owner/Master e desativa fidelidade após complete", async () => {
  const [dashboard, pageService] = await Promise.all([
    readFile("src/app/admin/dashboard/page.tsx", "utf8"),
    readFile("src/lib/pageService.ts", "utf8"),
  ]);
  assert.match(dashboard, /updateAdminAppointmentStatus\(id, action\)/);
  assert.match(dashboard, /isSuperAdmin && adminViewId/);
  assert.match(dashboard, /updateMasterAppointmentStatus\(adminViewId, id, action\)/);
  assert.match(dashboard, /handleStatusChange\(app\.id!, 'confirm'\)/);
  assert.match(dashboard, /handleStatusChange\(app\.id!, 'cancel'\)/);
  assert.match(dashboard, /handleStatusChange\(app\.id!, 'complete'\)/);
  assert.match(dashboard, /app\.status === 'pending' \|\| app\.status === 'confirmed'/);
  assert.equal(dashboard.includes("addLoyaltyPoint"), false);
  assert.equal(dashboard.includes("Fidelizar cliente?"), false);
  assert.equal(pageService.includes("export const updateAppointmentStatus ="), false);
  assert.equal(pageService.includes("updateAppointmentStatusForMaster"), false);
});

test("serviço reutiliza requireCommercialAccess sem entitlement financeiro duplicado", async () => {
  const source = await readFile("src/lib/adminAppointmentsService.ts", "utf8");
  assert.match(source, /requireCommercialAccess/);
  assert.equal(source.includes("resolveCommercialEntitlement"), false);
  assert.doesNotMatch(source, /billing(?:\?|)\.status/);
});
