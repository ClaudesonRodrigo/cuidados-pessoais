import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID, isOfficialSuperAdminUid } from "../src/lib/adminIdentity.ts";
import {
  handleMasterAppointmentStatusRequest,
  type MasterAppointmentsDependencies,
  type MasterAppointmentsStore,
} from "../src/lib/masterAppointmentsService.ts";
import {
  requireSuperadminTenantContext,
  type SuperadminTenantContextDependencies,
} from "../src/lib/superadminTenantContextService.ts";
import type { AppointmentStatus } from "../src/lib/adminAppointmentsService.ts";

const TOKEN = "header.payload.signature";
const TARGET_OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const APPOINTMENT_ID = "legacy-appointment_A.2024";
type Data = Record<string, unknown>;

class MemoryStore implements MasterAppointmentsStore {
  appointments = new Map<string, Data>([[APPOINTMENT_ID, { pageSlug: PAGE_SLUG, status: "pending" }]]);
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
  let uid = OFFICIAL_SUPERADMIN_UID;
  let user: Data | null = { pageSlug: PAGE_SLUG };
  let page: Data | null = { userId: TARGET_OWNER_ID, slug: PAGE_SLUG };
  let tokenFailure: unknown;
  const calls = {
    tokens: [] as string[], officialUids: [] as string[], userIds: [] as string[], pageSlugs: [] as string[],
  };
  const contextDependencies: SuperadminTenantContextDependencies = {
    async verifyIdToken(token) { calls.tokens.push(token); if (tokenFailure) throw tokenFailure; return { uid }; },
    isOfficialSuperAdminUid(value) { calls.officialUids.push(value); return isOfficialSuperAdminUid(value); },
    accounts: {
      async getUser(value) { calls.userIds.push(value); return user; },
      async getPage(value) { calls.pageSlugs.push(value); return page; },
    },
  };
  const store = new MemoryStore();
  const dependencies: MasterAppointmentsDependencies = {
    requireSuperadminTenantContext: (request, target) =>
      requireSuperadminTenantContext(request, target, contextDependencies),
    store,
  };
  return {
    dependencies, store, calls,
    setUid(value: string) { uid = value; },
    setUser(value: Data | null) { user = value; },
    setPage(value: Data | null) { page = value; },
    failToken(error: unknown) { tokenFailure = error; },
  };
};

const request = (
  body: unknown = { targetOwnerId: TARGET_OWNER_ID, action: "confirm" },
  authorization = `Bearer ${TOKEN}`,
  suffix = "",
  rawBody?: string,
) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request(`https://beautypro.test/api/master/appointments/${APPOINTMENT_ID}/status${suffix}`, {
    method: "POST", headers, body: rawBody ?? JSON.stringify(body),
  });
};

const execute = (
  context = setup(), body?: unknown, authorization?: string, suffix?: string,
  appointmentId: unknown = APPOINTMENT_ID, rawBody?: string,
) => handleMasterAppointmentStatusRequest(
  request(body, authorization, suffix, rawBody), appointmentId, context.dependencies,
);

const responseBody = (response: Response) => response.json() as Promise<Data>;
const assertError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await responseBody(response) as { error: { code: string; message: string } };
  assert.equal(body.error.code, code);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
};

for (const [current, action, expected] of [
  ["pending", "confirm", "confirmed"],
  ["pending", "cancel", "cancelled"],
  ["confirmed", "complete", "completed"],
  ["confirmed", "cancel", "cancelled"],
] as const) {
  test(`SUPERADMIN target A ${current} + ${action} retorna ${expected}`, async () => {
    const context = setup();
    context.store.appointments.get(APPOINTMENT_ID)!.status = current;
    const response = await execute(context, { targetOwnerId: TARGET_OWNER_ID, action });
    assert.equal(response.status, 200);
    assert.equal(context.store.appointments.get(APPOINTMENT_ID)?.status, expected);
    assert.equal(context.store.updateCalls, 1);
  });
}

test("transition inválida retorna 409 e zero update", async () => {
  const context = setup();
  context.store.appointments.get(APPOINTMENT_ID)!.status = "completed";
  await assertError(await execute(context), 409, "APPOINTMENT_STATE_INVALID");
  assert.equal(context.store.updateCalls, 0);
});

test("cross-target retorna 404 e zero update", async () => {
  const context = setup();
  context.store.appointments.get(APPOINTMENT_ID)!.pageSlug = "salao-b";
  await assertError(await execute(context), 404, "APPOINTMENT_NOT_FOUND");
  assert.equal(context.store.updateCalls, 0);
});

test("target inexistente retorna 404 e transaction não abre", async () => {
  const context = setup();
  context.setUser(null);
  await assertError(await execute(context), 404, "TARGET_TENANT_NOT_FOUND");
  assert.deepEqual(context.store.transactionIds, []);
  assert.equal(context.store.updateCalls, 0);
});

test("owner comum retorna 403 antes de target e transaction", async () => {
  const context = setup();
  context.setUid("owner-common");
  await assertError(await execute(context), 403, "SUPERADMIN_REQUIRED");
  assert.deepEqual(context.calls.userIds, []);
  assert.deepEqual(context.store.transactionIds, []);
});

test("public retorna 401 e transaction não abre", async () => {
  const context = setup();
  await assertError(await execute(context, undefined, ""), 401, "UNAUTHORIZED");
  assert.deepEqual(context.store.transactionIds, []);
});

test("auth inválida retorna 401 e transaction não abre", async () => {
  const context = setup();
  context.failToken(Object.assign(new Error("expired"), { code: "auth/id-token-expired" }));
  await assertError(await execute(context), 401, "UNAUTHORIZED");
  assert.deepEqual(context.store.transactionIds, []);
});

for (const forbidden of ["pageSlug", "ownerId", "adminViewId", "userId", "status", "customerId", "billingStatus", "plan", "isPro", "stripeCustomerId"]) {
  test(`body fechado rejeita ${forbidden}`, async () => {
    const body = { targetOwnerId: TARGET_OWNER_ID, action: "confirm", [forbidden]: "forbidden" };
    await assertError(await execute(setup(), body), 400, "INVALID_REQUEST");
  });
}

test("query string retorna 400", async () => {
  await assertError(await execute(setup(), undefined, undefined, "?pageSlug=x"), 400, "INVALID_REQUEST");
});

test("JSON inválido retorna 400", async () => {
  await assertError(await execute(setup(), undefined, undefined, undefined, APPOINTMENT_ID, "{"), 400, "INVALID_REQUEST");
});

test("payload excessivo retorna 400", async () => {
  await assertError(await execute(setup(), { targetOwnerId: TARGET_OWNER_ID, action: "confirm", padding: "x".repeat(4_096) }), 400, "INVALID_REQUEST");
});

test("erro Firestore inesperado retorna 503 sanitizado", async () => {
  const context = setup();
  context.store.failWith = new Error("SECRET_FIRESTORE_FAILURE");
  const response = await execute(context);
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /ADMIN_APPOINTMENTS_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_FIRESTORE_FAILURE"), false);
  assert.equal(context.store.updateCalls, 0);
});

test("argumentos de autoridade e transaction são exatos", async () => {
  const context = setup();
  assert.equal((await execute(context)).status, 200);
  assert.deepEqual(context.calls.tokens, [TOKEN]);
  assert.deepEqual(context.calls.officialUids, [OFFICIAL_SUPERADMIN_UID]);
  assert.deepEqual(context.calls.userIds, [TARGET_OWNER_ID]);
  assert.deepEqual(context.calls.pageSlugs, [PAGE_SLUG]);
  assert.deepEqual(context.store.transactionIds, [APPOINTMENT_ID]);
});

test("adapter Admin usa appointments.doc(appointmentId), get e update transacionais", async () => {
  const source = await readFile("src/lib/masterAppointments.ts", "utf8");
  assert.match(source, /collection\("appointments"\)\.doc\(appointmentId\)/);
  assert.match(source, /transaction\.get\(reference\)/);
  assert.match(source, /transaction\.update\(reference, \{ status \}\)/);
  assert.ok(source.indexOf("transaction.get(reference)") < source.indexOf("transaction.update(reference"));
});

test("client Master usa token/API, envia somente identificador+ação e não importa Firestore", async () => {
  const source = await readFile("src/lib/masterAppointmentsClient.ts", "utf8");
  assert.match(source, /auth\.currentUser/);
  assert.match(source, /getIdToken\(\)/);
  assert.match(source, /\/api\/master\/appointments\//);
  assert.match(source, /JSON\.stringify\(\{ targetOwnerId, action \}\)/);
  assert.equal(source.includes("firebase/firestore"), false);
});

test("dashboard usa API Master e helper Web SDK foi removido", async () => {
  const [dashboard, pageService] = await Promise.all([
    readFile("src/app/admin/dashboard/page.tsx", "utf8"),
    readFile("src/lib/pageService.ts", "utf8"),
  ]);
  assert.match(dashboard, /updateMasterAppointmentStatus\(adminViewId, id, action\)/);
  assert.match(dashboard, /updateAdminAppointmentStatus\(id, action\)/);
  assert.equal(dashboard.includes("updateAppointmentStatusForMaster"), false);
  assert.equal(pageService.includes("updateAppointmentStatusForMaster"), false);
});

test("Master não resolve billing, Stripe ou entitlement do target", async () => {
  const sources = await Promise.all([
    readFile("src/lib/superadminTenantContextService.ts", "utf8"),
    readFile("src/lib/masterAppointmentsService.ts", "utf8"),
  ]);
  const combined = sources.join("\n");
  assert.equal(combined.includes("requireCommercialAccess"), false);
  assert.equal(combined.includes("getBillingByOwnerId"), false);
  assert.equal(combined.includes("resolveCommercialEntitlement"), false);
  assert.doesNotMatch(combined, /stripe/i);
});

test("C2-A não altera firestore.rules", async () => {
  const rules = await readFile("firestore.rules", "utf8");
  assert.match(rules, /isSuperAdmin\(\)/);
});
