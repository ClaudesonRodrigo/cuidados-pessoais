import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID, isOfficialSuperAdminUid } from "../src/lib/adminIdentity.ts";
import {
  countValidTenants,
  getMasterOverview,
  handleMasterOverviewRequest,
  type MasterOverviewDependencies,
  type TenantReferences,
} from "../src/lib/masterOverviewService.ts";
import {
  requireSuperadminIdentity,
  superadminIdentityErrorResponse,
  type SuperadminIdentityDependencies,
} from "../src/lib/superadminIdentityService.ts";

const TOKEN = "header.payload.signature";
const NOW = new Date("2026-08-23T12:00:00.000Z");

const validReferences = (): TenantReferences => ({
  users: [{ id: "owner-a", role: "owner", pageSlug: "salao-a" }],
  pages: [{ id: "salao-a", userId: "owner-a", slug: "salao-a" }],
});

const setup = () => {
  let uid: unknown = OFFICIAL_SUPERADMIN_UID;
  let verifyFailure: unknown;
  let storeFailure: unknown;
  let references = validReferences();
  const calls = {
    tokens: [] as string[],
    officialUids: [] as string[],
    reads: 0,
  };
  const identityDependencies: SuperadminIdentityDependencies = {
    async verifyIdToken(token) {
      calls.tokens.push(token);
      if (verifyFailure) throw verifyFailure;
      return { uid };
    },
    isOfficialSuperAdminUid(value) {
      calls.officialUids.push(value);
      return isOfficialSuperAdminUid(value);
    },
  };
  const dependencies: MasterOverviewDependencies = {
    requireSuperadminIdentity: (request) =>
      requireSuperadminIdentity(request, identityDependencies),
    store: {
      async readTenantReferences() {
        calls.reads += 1;
        if (storeFailure) throw storeFailure;
        return references;
      },
    },
    now: () => NOW,
  };
  return {
    calls,
    dependencies,
    identityDependencies,
    setUid(value: unknown) { uid = value; },
    setReferences(value: TenantReferences) { references = value; },
    failVerify(error: unknown) { verifyFailure = error; },
    failStore(error: unknown) { storeFailure = error; },
  };
};

const request = (
  authorization = `Bearer ${TOKEN}`,
  suffix = "",
) => {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  return new Request(`https://beautypro.test/api/master/overview${suffix}`, {
    method: "GET",
    headers,
  });
};

const body = async (response: Response) => response.json() as Promise<Record<string, any>>;

const assertError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status);
  const value = await body(response);
  assert.equal(value.error.code, code);
  assert.deepEqual(Object.keys(value.error).sort(), ["code", "message"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
};

test("requireSuperadminIdentity rejeita ausência e Bearer malformado com 401", async () => {
  for (const authorization of ["", "Basic token", "Bearer invalid", "Bearer token com espaço"]) {
    const context = setup();
    await assert.rejects(
      () => requireSuperadminIdentity(request(authorization), context.identityDependencies),
      (error: any) => error.status === 401 && error.code === "UNAUTHORIZED",
    );
    assert.deepEqual(context.calls.tokens, []);
  }
});

test("requireSuperadminIdentity aceita somente o UID oficial verificado", async () => {
  const context = setup();
  assert.deepEqual(
    await requireSuperadminIdentity(request(), context.identityDependencies),
    { uid: OFFICIAL_SUPERADMIN_UID },
  );
  assert.deepEqual(context.calls.tokens, [TOKEN]);
  assert.deepEqual(context.calls.officialUids, [OFFICIAL_SUPERADMIN_UID]);
});

test("token Firebase inválido retorna 401 sanitizado", async () => {
  const context = setup();
  context.failVerify(Object.assign(new Error("SECRET_TOKEN"), { code: "auth/id-token-expired" }));
  try {
    await requireSuperadminIdentity(request(), context.identityDependencies);
    assert.fail("deveria rejeitar");
  } catch (error) {
    const response = superadminIdentityErrorResponse(error as never);
    assert.equal(response.status, 401);
    const serialized = JSON.stringify(await body(response));
    assert.match(serialized, /UNAUTHORIZED/);
    assert.equal(serialized.includes("SECRET_TOKEN"), false);
  }
});

test("falha operacional de verificação retorna 503 sanitizado", async () => {
  const context = setup();
  context.failVerify(new Error("SECRET_ADMIN_VERIFY"));
  await assertError(
    await handleMasterOverviewRequest(request(), context.dependencies),
    503,
    "SUPERADMIN_IDENTITY_UNAVAILABLE",
  );
  assert.equal(context.calls.reads, 0);
});

for (const [label, uid] of [["customer", "customer-a"], ["owner comum", "owner-a"]]) {
  test(`${label} recebe 403 sem leitura global`, async () => {
    const context = setup();
    context.setUid(uid);
    await assertError(
      await handleMasterOverviewRequest(request(), context.dependencies),
      403,
      "SUPERADMIN_REQUIRED",
    );
    assert.equal(context.calls.reads, 0);
  });
}

test("anonymous recebe 401 sem leitura global", async () => {
  const context = setup();
  await assertError(
    await handleMasterOverviewRequest(request(""), context.dependencies),
    401,
    "UNAUTHORIZED",
  );
  assert.equal(context.calls.reads, 0);
});

test("browser não escolhe autoridade por query param, email ou role", async () => {
  const context = setup();
  context.setUid("owner-a");
  context.identityDependencies.verifyIdToken = async () => ({
    uid: "owner-a",
    email: "admin@example.com",
    role: "superadmin",
  });
  await assertError(
    await handleMasterOverviewRequest(
      request(undefined, `?uid=${OFFICIAL_SUPERADMIN_UID}&role=superadmin`),
      context.dependencies,
    ),
    403,
    "SUPERADMIN_REQUIRED",
  );
  assert.equal(context.calls.reads, 0);
});

test("superadmin oficial recebe DTO inicial sanitizado com 200", async () => {
  const context = setup();
  const response = await handleMasterOverviewRequest(request(), context.dependencies);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await body(response), {
    tenants: { total: 1 },
    generatedAt: NOW.toISOString(),
  });
  assert.equal(context.calls.reads, 1);
});

test("tenant total exige join user-page íntegro e não faz N+1", async () => {
  const references = {
    users: [
      { id: "owner-a", role: "owner", pageSlug: "salao-a", email: "a@secret.test" },
      { id: "owner-b", role: "owner", pageSlug: "salao-b" },
      { id: "customer-a", role: "customer", pageSlug: "salao-c" },
      { id: "owner-orphan", role: "owner", pageSlug: "salao-missing" },
    ],
    pages: [
      { id: "salao-a", userId: "owner-a", slug: "salao-a", phone: "secret" },
      { id: "salao-b", userId: "other-owner", slug: "salao-b" },
      { id: "salao-c", userId: "customer-a", slug: "salao-c" },
    ],
  } as TenantReferences;
  assert.equal(countValidTenants(references), 1);

  const calls = { reads: 0 };
  const overview = await getMasterOverview({
    async readTenantReferences() {
      calls.reads += 1;
      return references;
    },
  }, NOW);
  assert.deepEqual(overview, { tenants: { total: 1 }, generatedAt: NOW.toISOString() });
  assert.equal(calls.reads, 1);
  const serialized = JSON.stringify(overview);
  for (const forbidden of ["email", "phone", "secret", "owner-a", "salao-a"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("falha operacional do Firestore retorna 503 sem detalhes", async () => {
  const context = setup();
  context.failStore(new Error("SECRET_FIRESTORE"));
  const response = await handleMasterOverviewRequest(request(), context.dependencies);
  const serialized = JSON.stringify(await body(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /MASTER_OVERVIEW_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_FIRESTORE"), false);
  assert.equal(context.calls.reads, 1);
});

test("contrato GET é fechado e autentica antes de validar query", async () => {
  const context = setup();
  const response = await handleMasterOverviewRequest(request(undefined, "?extra=true"), context.dependencies);
  await assertError(response, 400, "INVALID_REQUEST");
  assert.equal(context.calls.officialUids.length, 1);
  assert.equal(context.calls.reads, 0);
});

test("route é fina e adapter usa somente Firebase Admin com projeções fixas", async () => {
  const [route, adapter, service] = await Promise.all([
    readFile("src/app/api/master/overview/route.ts", "utf8"),
    readFile("src/lib/masterOverview.ts", "utf8"),
    readFile("src/lib/masterOverviewService.ts", "utf8"),
  ]);
  assert.match(route, /export const GET = \(request: Request\) => handleMasterOverviewRequest\(request\)/);
  assert.equal(route.includes('runtime = "nodejs"'), true);
  assert.equal(adapter.includes("getAdminFirestore"), true);
  assert.equal(adapter.includes('collection("users")'), true);
  assert.equal(adapter.includes('collection("pages")'), true);
  assert.equal(adapter.includes('.select("pageSlug", "role")'), true);
  assert.equal(adapter.includes('.select("userId", "slug")'), true);
  assert.equal(adapter.includes("firebase/firestore"), false);
  assert.equal(service.includes("billing"), false);
  assert.equal(service.includes("appointments"), false);
});
