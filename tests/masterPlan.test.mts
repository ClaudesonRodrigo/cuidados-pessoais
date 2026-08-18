import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  handleMasterPlanRequest,
  MasterPlanError,
  type MasterPlan,
  type MasterPlanDependencies,
  type MasterPlanStore,
} from "../src/lib/masterPlanService.ts";
import {
  requireSuperadminTenantContext,
  type SuperadminTenantContextDependencies,
} from "../src/lib/superadminTenantContextService.ts";

const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const TOKEN = "header.payload.signature";
const TRIAL = new Date("2099-03-01T12:00:00.000Z");

type Data = Record<string, unknown>;

class MemoryPlanStore implements MasterPlanStore {
  user: Data = {
    pageSlug: PAGE_SLUG,
    plan: "free",
    trialDeadline: TRIAL,
    displayName: "Owner",
  };
  page: Data = {
    userId: OWNER_ID,
    slug: PAGE_SLUG,
    plan: "free",
    trialDeadline: TRIAL,
    title: "Salão",
  };
  calls: Array<{ targetOwnerId: string; pageSlug: string; plan: MasterPlan }> = [];
  failBeforeCommit: unknown;

  async updatePlanAtomically(
    targetOwnerId: string,
    pageSlug: string,
    plan: MasterPlan,
  ): Promise<void> {
    this.calls.push({ targetOwnerId, pageSlug, plan });
    const user = structuredClone(this.user);
    const page = structuredClone(this.page);
    if (
      user.pageSlug !== pageSlug ||
      page.userId !== targetOwnerId ||
      page.slug !== pageSlug
    ) {
      throw new MasterPlanError(409, "TENANT_INCONSISTENT", "Tenant inconsistente.");
    }
    user.plan = plan;
    user.trialDeadline = null;
    page.plan = plan;
    page.trialDeadline = null;
    if (this.failBeforeCommit) throw this.failBeforeCommit;
    this.user = user;
    this.page = page;
  }
}

const setup = () => {
  let identity = { uid: OFFICIAL_SUPERADMIN_UID };
  let targetUser: Data | null = { pageSlug: PAGE_SLUG, plan: "free" };
  let targetPage: Data | null = { userId: OWNER_ID, slug: PAGE_SLUG, plan: "free" };
  const store = new MemoryPlanStore();
  const logged: Array<{ targetOwnerId?: string; error: unknown }> = [];
  const contextDependencies: SuperadminTenantContextDependencies = {
    async verifyIdToken() {
      return identity;
    },
    isOfficialSuperAdminUid: (uid) => uid === OFFICIAL_SUPERADMIN_UID,
    accounts: {
      async getUser() {
        return targetUser;
      },
      async getPage() {
        return targetPage;
      },
    },
  };
  const dependencies: MasterPlanDependencies = {
    requireSuperadminTenantContext: (request, targetOwnerId) =>
      requireSuperadminTenantContext(request, targetOwnerId, contextDependencies),
    store,
    logError: (entry) => logged.push(entry),
  };

  return {
    dependencies,
    store,
    logged,
    setIdentity(uid: string) { identity = { uid }; },
    setTargetUser(value: Data | null) { targetUser = value; },
    setTargetPage(value: Data | null) { targetPage = value; },
  };
};

const request = (
  body: unknown,
  authorization = `Bearer ${TOKEN}`,
): Request => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request("https://beautypro.test/api/master/users/plan", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
};

const execute = (
  context = setup(),
  body: unknown = { targetOwnerId: OWNER_ID, plan: "pro" },
  authorization?: string,
) => handleMasterPlanRequest(request(body, authorization), context.dependencies);

const bodyOf = (response: Response) => response.json() as Promise<Data>;

const assertError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await bodyOf(response) as { error: { code: string; message: string } };
  assert.equal(body.error.code, code);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
};

test("public retorna 401", async () => {
  await assertError(await execute(setup(), undefined, ""), 401, "UNAUTHORIZED");
});

test("owner comum retorna 403", async () => {
  const context = setup();
  context.setIdentity(OWNER_ID);
  await assertError(await execute(context), 403, "SUPERADMIN_REQUIRED");
  assert.deepEqual(context.store.calls, []);
});

for (const plan of ["pro", "free"] as const) {
  test(`superadmin atualiza user e page juntos para ${plan}`, async () => {
    const context = setup();
    context.store.user.plan = plan === "pro" ? "free" : "pro";
    context.store.page.plan = plan === "pro" ? "free" : "pro";
    assert.equal((await execute(context, { targetOwnerId: OWNER_ID, plan })).status, 200);
    assert.deepEqual(context.store.calls, [{ targetOwnerId: OWNER_ID, pageSlug: PAGE_SLUG, plan }]);
    assert.equal(context.store.user.plan, plan);
    assert.equal(context.store.page.plan, plan);
    assert.equal(context.store.user.trialDeadline, null);
    assert.equal(context.store.page.trialDeadline, null);
    assert.equal(context.store.user.displayName, "Owner");
    assert.equal(context.store.page.title, "Salão");
  });
}

test("targetOwnerId inválido retorna 400", async () => {
  await assertError(
    await execute(setup(), { targetOwnerId: "../owner", plan: "pro" }),
    400,
    "INVALID_REQUEST",
  );
});

test("target inexistente retorna 404", async () => {
  const context = setup();
  context.setTargetUser(null);
  await assertError(await execute(context), 404, "TARGET_TENANT_NOT_FOUND");
  assert.deepEqual(context.store.calls, []);
});

test("binding inconsistente retorna 404 antes da transaction", async () => {
  const context = setup();
  context.setTargetPage({ userId: "owner-b", slug: PAGE_SLUG });
  await assertError(await execute(context), 404, "TARGET_TENANT_NOT_FOUND");
  assert.deepEqual(context.store.calls, []);
});

test("binding alterado antes do commit falha sem write parcial", async () => {
  const context = setup();
  context.store.page.userId = "owner-b";
  const beforeUser = structuredClone(context.store.user);
  const beforePage = structuredClone(context.store.page);
  await assertError(await execute(context), 409, "TENANT_INCONSISTENT");
  assert.deepEqual(context.store.user, beforeUser);
  assert.deepEqual(context.store.page, beforePage);
});

for (const plan of [null, "", "premium", true, 1]) {
  test(`plan inválido retorna 400: ${JSON.stringify(plan)}`, async () => {
    await assertError(
      await execute(setup(), { targetOwnerId: OWNER_ID, plan }),
      400,
      "INVALID_REQUEST",
    );
  });
}

for (const extra of ["ownerId", "userId", "pageSlug", "trialDeadline", "billing", "stripeCustomerId"]) {
  test(`campo extra retorna 400: ${extra}`, async () => {
    await assertError(await execute(setup(), {
      targetOwnerId: OWNER_ID,
      plan: "pro",
      [extra]: "forged",
    }), 400, "INVALID_REQUEST");
  });
}

test("falha antes do commit mantém user e page e retorna 503 sanitizado", async () => {
  const context = setup();
  const beforeUser = structuredClone(context.store.user);
  const beforePage = structuredClone(context.store.page);
  context.store.failBeforeCommit = new Error("SECRET_PLAN_TRANSACTION_FAILURE");
  const response = await execute(context);
  const serialized = JSON.stringify(await bodyOf(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /MASTER_PLAN_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_PLAN_TRANSACTION_FAILURE"), false);
  assert.equal(serialized.includes("stack"), false);
  assert.deepEqual(context.store.user, beforeUser);
  assert.deepEqual(context.store.page, beforePage);
  assert.equal(context.logged.length, 1);
});

test("adapter real relê e atualiza users e pages em uma transaction", async () => {
  const source = await readFile("src/lib/masterPlan.ts", "utf8");
  assert.equal((source.match(/runTransaction/g) ?? []).length, 1);
  assert.match(source, /collection\("users"\)\.doc\(targetOwnerId\)/);
  assert.match(source, /collection\("pages"\)\.doc\(pageSlug\)/);
  assert.match(source, /transaction\.get\(userReference\)/);
  assert.match(source, /transaction\.get\(pageReference\)/);
  assert.match(source, /user\.pageSlug !== pageSlug/);
  assert.match(source, /page\.userId !== targetOwnerId/);
  assert.match(source, /page\.slug !== pageSlug/);
  assert.equal((source.match(/transaction\.update/g) ?? []).length, 2);
});

test("client/dashboard usam API Master e writer Web SDK foi removido", async () => {
  const [client, dashboard, pageService] = await Promise.all([
    readFile("src/lib/masterPlanClient.ts", "utf8"),
    readFile("src/app/admin/dashboard/page.tsx", "utf8"),
    readFile("src/lib/pageService.ts", "utf8"),
  ]);
  assert.match(client, /auth\.currentUser/);
  assert.match(client, /getIdToken\(\)/);
  assert.match(client, /\/api\/master\/users\/plan/);
  assert.equal(client.includes("firebase/firestore"), false);
  assert.match(client, /JSON\.stringify\(\{ targetOwnerId, plan \}\)/);
  assert.match(dashboard, /updateMasterPlan\(u\.uid,/);
  assert.equal(dashboard.includes("updateUserPlan"), false);
  assert.equal(pageService.includes("updateUserPlan"), false);
});

test("endpoint Master não consulta billing ou Commercial Access", async () => {
  const source = await readFile("src/lib/masterPlanService.ts", "utf8");
  assert.match(source, /requireSuperadminTenantContext/);
  for (const forbidden of [
    "requireCommercialAccess",
    "resolveCommercialEntitlement",
    "getBillingByOwnerId",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});
