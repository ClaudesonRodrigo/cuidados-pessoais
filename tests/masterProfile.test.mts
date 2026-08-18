import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  handleMasterProfileRequest,
  type MasterProfileDependencies,
} from "../src/lib/masterProfileService.ts";
import {
  requireSuperadminTenantContext,
  type SuperadminTenantContextDependencies,
} from "../src/lib/superadminTenantContextService.ts";
import type { AdminProfileStore } from "../src/lib/adminProfileService.ts";

const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const TOKEN = "header.payload.signature";

type Data = Record<string, unknown>;

class MemoryProfileStore implements AdminProfileStore {
  page: Data | null = {
    userId: OWNER_ID,
    slug: PAGE_SLUG,
    title: "Original",
    theme: "dark",
  };
  calls: string[] = [];
  failWith: unknown;

  async runProfileTransaction(
    pageSlug: string,
    operation: (page: Data | null) => Data,
  ): Promise<void> {
    this.calls.push(pageSlug);
    if (this.failWith) throw this.failWith;
    const update = operation(this.page ? structuredClone(this.page) : null);
    if (!this.page) throw new Error("missing page");
    this.page = { ...this.page, ...structuredClone(update) };
  }
}

const setup = () => {
  let identity = { uid: OFFICIAL_SUPERADMIN_UID };
  let user: Data | null = { pageSlug: PAGE_SLUG, plan: "blocked" };
  let page: Data | null = { userId: OWNER_ID, slug: PAGE_SLUG, plan: "blocked" };
  let tokenFailure: unknown;
  const calls = {
    users: [] as string[],
    pages: [] as string[],
  };
  const store = new MemoryProfileStore();
  const logged: Array<{ targetOwnerId?: string; error: unknown }> = [];
  const contextDependencies: SuperadminTenantContextDependencies = {
    async verifyIdToken() {
      if (tokenFailure) throw tokenFailure;
      return identity;
    },
    isOfficialSuperAdminUid: (uid) => uid === OFFICIAL_SUPERADMIN_UID,
    accounts: {
      async getUser(ownerId) {
        calls.users.push(ownerId);
        return user;
      },
      async getPage(pageSlug) {
        calls.pages.push(pageSlug);
        return page;
      },
    },
  };
  const dependencies: MasterProfileDependencies = {
    requireSuperadminTenantContext: (request, targetOwnerId) =>
      requireSuperadminTenantContext(request, targetOwnerId, contextDependencies),
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
    failToken(error: unknown) { tokenFailure = error; },
  };
};

const request = (
  body: unknown,
  authorization = `Bearer ${TOKEN}`,
  suffix = "",
): Request => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request(`https://beautypro.test/api/master/page/profile${suffix}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
};

const execute = (
  context = setup(),
  body: unknown = { targetOwnerId: OWNER_ID, update: { title: "Studio" } },
  authorization?: string,
) => handleMasterProfileRequest(request(body, authorization), context.dependencies);

const responseBody = (response: Response) => response.json() as Promise<Data>;

const assertError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await responseBody(response) as { error: { code: string; message: string } };
  assert.equal(body.error.code, code);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
};

test("sem auth retorna 401", async () => {
  await assertError(await execute(setup(), undefined, ""), 401, "UNAUTHORIZED");
});

test("owner comum retorna 403 SUPERADMIN_REQUIRED", async () => {
  const context = setup();
  context.setIdentity(OWNER_ID);
  await assertError(await execute(context), 403, "SUPERADMIN_REQUIRED");
  assert.deepEqual(context.store.calls, []);
});

test("superadmin com target válido persiste via pageSlug server-side", async () => {
  const context = setup();
  assert.equal((await execute(context)).status, 200);
  assert.equal(context.store.page?.title, "Studio");
  assert.deepEqual(context.calls.users, [OWNER_ID]);
  assert.deepEqual(context.calls.pages, [PAGE_SLUG]);
  assert.deepEqual(context.store.calls, [PAGE_SLUG]);
});

test("targetOwnerId inválido retorna 400", async () => {
  await assertError(
    await execute(setup(), { targetOwnerId: "../owner", update: { title: "Studio" } }),
    400,
    "INVALID_REQUEST",
  );
});

test("target inexistente retorna 404", async () => {
  const context = setup();
  context.setUser(null);
  await assertError(await execute(context), 404, "TARGET_TENANT_NOT_FOUND");
  assert.deepEqual(context.store.calls, []);
});

test("binding user/page inconsistente retorna 404", async () => {
  const context = setup();
  context.setPage({ userId: "owner-b", slug: PAGE_SLUG });
  await assertError(await execute(context), 404, "TARGET_TENANT_NOT_FOUND");
  assert.deepEqual(context.store.calls, []);
});

for (const authority of ["pageSlug", "ownerId"]) {
  test(`body com ${authority} retorna 400`, async () => {
    await assertError(
      await execute(setup(), {
        targetOwnerId: OWNER_ID,
        update: { title: "Studio" },
        [authority]: "forged",
      }),
      400,
      "INVALID_REQUEST",
    );
  });
}

test("campo desconhecido retorna 400", async () => {
  await assertError(
    await execute(setup(), { targetOwnerId: OWNER_ID, update: { unknown: true } }),
    400,
    "INVALID_REQUEST",
  );
});

test("update vazio retorna 400", async () => {
  await assertError(
    await execute(setup(), { targetOwnerId: OWNER_ID, update: {} }),
    400,
    "INVALID_REQUEST",
  );
});

test("payload inválido retorna 400", async () => {
  await assertError(
    await execute(setup(), { targetOwnerId: OWNER_ID, update: { isOpen: "true" } }),
    400,
    "INVALID_REQUEST",
  );
});

test("todos os campos válidos são normalizados e persistidos", async () => {
  const context = setup();
  const update = {
    title: "  Studio Beauty  ",
    bio: "  Bio  ",
    address: "  Rua A  ",
    whatsapp: "+55 (79) 99999-9999",
    pixKey: "  pix@example.com  ",
    isOpen: false,
    schedule: {
      open: "09:00",
      close: "18:00",
      lunchStart: "12:00",
      lunchEnd: "13:00",
      workingDays: [1, 2, 3, 4, 5],
    },
    profileImageUrl: "https://example.com/profile.jpg",
  };
  assert.equal((
    await execute(context, { targetOwnerId: OWNER_ID, update })
  ).status, 200);
  assert.deepEqual(context.store.page, {
    userId: OWNER_ID,
    slug: PAGE_SLUG,
    theme: "dark",
    ...update,
    title: "Studio Beauty",
    bio: "Bio",
    address: "Rua A",
    whatsapp: "5579999999999",
    pixKey: "pix@example.com",
  });
});

test("falha operacional retorna 503 sanitizado", async () => {
  const context = setup();
  context.store.failWith = new Error("SECRET_MASTER_PROFILE_FAILURE");
  const response = await execute(context);
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /MASTER_PROFILE_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_MASTER_PROFILE_FAILURE"), false);
  assert.equal(serialized.includes("stack"), false);
  assert.equal(context.logged.length, 1);
});

test("endpoint Master não consulta entitlement ou billing", async () => {
  const source = await readFile("src/lib/masterProfileService.ts", "utf8");
  for (const forbidden of [
    "requireCommercialAccess",
    "resolveCommercialEntitlement",
    "getBillingByOwnerId",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
  assert.match(source, /requireSuperadminTenantContext/);
  assert.match(source, /validateProfileUpdate/);
});

test("adapter usa Firebase Admin e client não importa Firestore", async () => {
  const [adapter, client, dashboard] = await Promise.all([
    readFile("src/lib/masterProfile.ts", "utf8"),
    readFile("src/lib/masterProfileClient.ts", "utf8"),
    readFile("src/app/admin/dashboard/page.tsx", "utf8"),
  ]);
  assert.match(adapter, /getAdminFirestore/);
  assert.match(adapter, /collection\("pages"\)\.doc\(pageSlug\)/);
  assert.match(adapter, /runTransaction/);
  assert.match(client, /auth\.currentUser/);
  assert.match(client, /getIdToken\(\)/);
  assert.match(client, /\/api\/master\/page\/profile/);
  assert.equal(client.includes("firebase/firestore"), false);
  assert.match(dashboard, /isSuperAdmin && adminViewId/);
  assert.match(dashboard, /updateMasterProfile\(adminViewId, update\)/);
});
