import assert from "node:assert/strict";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID, isOfficialSuperAdminUid } from "../src/lib/adminIdentity.ts";
import {
  requireSuperadminTenantContext,
  superadminTenantContextErrorResponse,
  type SuperadminTenantContextDependencies,
} from "../src/lib/superadminTenantContextService.ts";

const TOKEN = "header.payload.signature";
const TARGET_OWNER_ID = "owner-target";
const PAGE_SLUG = "salao-target";
type Data = Record<string, unknown>;

const setup = () => {
  let uid = OFFICIAL_SUPERADMIN_UID;
  let user: Data | null = { pageSlug: PAGE_SLUG, role: "owner", plan: "free" };
  let page: Data | null = { userId: TARGET_OWNER_ID, slug: PAGE_SLUG, plan: "free" };
  let verifyFailure: unknown;
  let userFailure: unknown;
  const calls = {
    tokens: [] as string[],
    officialUidChecks: [] as string[],
    userIds: [] as string[],
    pageSlugs: [] as string[],
  };
  const dependencies: SuperadminTenantContextDependencies = {
    async verifyIdToken(token) {
      calls.tokens.push(token);
      if (verifyFailure) throw verifyFailure;
      return { uid };
    },
    isOfficialSuperAdminUid(value) {
      calls.officialUidChecks.push(value);
      return isOfficialSuperAdminUid(value);
    },
    accounts: {
      async getUser(value) {
        calls.userIds.push(value);
        if (userFailure) throw userFailure;
        return user;
      },
      async getPage(value) { calls.pageSlugs.push(value); return page; },
    },
  };
  return {
    dependencies,
    calls,
    setUid(value: string) { uid = value; },
    setUser(value: Data | null) { user = value; },
    setPage(value: Data | null) { page = value; },
    failVerify(error: unknown) { verifyFailure = error; },
    failUser(error: unknown) { userFailure = error; },
  };
};

const request = (authorization = `Bearer ${TOKEN}`) => {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  return new Request("https://beautypro.test/master", { headers });
};

const execute = async (context = setup(), target: unknown = TARGET_OWNER_ID, authorization?: string) => {
  try {
    return await requireSuperadminTenantContext(request(authorization), target, context.dependencies);
  } catch (error) {
    return superadminTenantContextErrorResponse(error as never);
  }
};

const assertError = async (value: unknown, status: number, code: string) => {
  assert.ok(value instanceof Response);
  assert.equal(value.status, status);
  const body = await value.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, code);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
};

test("sem Authorization retorna 401", async () => {
  const context = setup();
  await assertError(await execute(context, TARGET_OWNER_ID, ""), 401, "UNAUTHORIZED");
  assert.deepEqual(context.calls.userIds, []);
});

test("Bearer inválido retorna 401", async () => {
  const context = setup();
  await assertError(await execute(context, TARGET_OWNER_ID, "Bearer invalid"), 401, "UNAUTHORIZED");
  assert.deepEqual(context.calls.tokens, []);
});

test("credential error retorna 401", async () => {
  const context = setup();
  context.failVerify(Object.assign(new Error("expired"), { code: "auth/id-token-expired" }));
  await assertError(await execute(context), 401, "UNAUTHORIZED");
});

test("falha operacional verifyIdToken retorna 503 sanitizado", async () => {
  const context = setup();
  context.failVerify(new Error("SECRET_VERIFY"));
  const response = await execute(context);
  assert.ok(response instanceof Response);
  const serialized = JSON.stringify(await response.json());
  assert.equal(response.status, 503);
  assert.match(serialized, /SUPERADMIN_CONTEXT_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_VERIFY"), false);
});

test("owner comum retorna 403 antes de consultar target", async () => {
  const context = setup();
  context.setUid("owner-common");
  await assertError(await execute(context), 403, "SUPERADMIN_REQUIRED");
  assert.deepEqual(context.calls.officialUidChecks, ["owner-common"]);
  assert.deepEqual(context.calls.userIds, []);
  assert.deepEqual(context.calls.pageSlugs, []);
});

test("superadmin e target válido retornam contexto mínimo", async () => {
  const context = setup();
  assert.deepEqual(await execute(context, `  ${TARGET_OWNER_ID}  `), {
    identity: { uid: OFFICIAL_SUPERADMIN_UID },
    targetOwnerId: TARGET_OWNER_ID,
    pageSlug: PAGE_SLUG,
  });
  assert.deepEqual(context.calls.tokens, [TOKEN]);
  assert.deepEqual(context.calls.officialUidChecks, [OFFICIAL_SUPERADMIN_UID]);
  assert.deepEqual(context.calls.userIds, [TARGET_OWNER_ID]);
  assert.deepEqual(context.calls.pageSlugs, [PAGE_SLUG]);
});

for (const target of [null, "", "   ", "a/b", "control\u0000id", "x".repeat(201)]) {
  test("targetOwnerId inválido retorna 400 sem lookup", async () => {
    const context = setup();
    await assertError(await execute(context, target), 400, "INVALID_REQUEST");
    assert.deepEqual(context.calls.userIds, []);
  });
}

for (const [label, configure] of [
  ["user inexistente", (context: ReturnType<typeof setup>) => context.setUser(null)],
  ["user sem pageSlug", (context: ReturnType<typeof setup>) => context.setUser({ role: "owner" })],
  ["pageSlug inválido", (context: ReturnType<typeof setup>) => context.setUser({ pageSlug: "Bad Slug" })],
  ["page inexistente", (context: ReturnType<typeof setup>) => context.setPage(null)],
  ["page.userId divergente", (context: ReturnType<typeof setup>) => context.setPage({ userId: "owner-b", slug: PAGE_SLUG })],
  ["page.slug divergente", (context: ReturnType<typeof setup>) => context.setPage({ userId: TARGET_OWNER_ID, slug: "salao-b" })],
] as const) {
  test(`${label} retorna 404 sanitizado`, async () => {
    const context = setup();
    configure(context);
    await assertError(await execute(context), 404, "TARGET_TENANT_NOT_FOUND");
  });
}

test("falha Firestore operacional retorna 503 sanitizado", async () => {
  const context = setup();
  context.failUser(new Error("SECRET_FIRESTORE"));
  const response = await execute(context);
  assert.ok(response instanceof Response);
  const serialized = JSON.stringify(await response.json());
  assert.equal(response.status, 503);
  assert.match(serialized, /SUPERADMIN_CONTEXT_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_FIRESTORE"), false);
});
