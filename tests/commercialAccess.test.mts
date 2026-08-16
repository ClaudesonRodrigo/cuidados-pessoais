import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  CommercialAccessError,
  commercialAccessErrorResponse,
  requireCommercialAccess,
  resolveAuthenticatedCommercialContext,
  type CommercialContextDependencies,
} from "../src/lib/commercialAccessService.ts";
import type { BillingRecord } from "../src/lib/billingTypes.ts";

const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const TOKEN = "header.payload.signature";
const NOW = new Date("2026-08-16T12:00:00.000Z");

const firebaseAuthError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

const billingRecord = (overrides: Partial<BillingRecord> = {}): BillingRecord => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const setup = () => {
  let identity = { uid: OWNER_ID };
  let user: Record<string, unknown> | null = {
    role: "owner",
    pageSlug: PAGE_SLUG,
    plan: "free",
  };
  let page: Record<string, unknown> | null = {
    userId: OWNER_ID,
    slug: PAGE_SLUG,
    plan: "free",
  };
  let billing: BillingRecord | null = null;
  let tokenFailure: unknown;
  const calls = {
    tokens: [] as string[],
    userUids: [] as string[],
    pageSlugs: [] as string[],
    billingOwnerIds: [] as string[],
  };

  const dependencies: CommercialContextDependencies = {
    async verifyIdToken(token) {
      calls.tokens.push(token);
      if (tokenFailure) throw tokenFailure;
      return identity;
    },
    accounts: {
      async getUser(uid) { calls.userUids.push(uid); return user; },
      async getPage(pageSlug) { calls.pageSlugs.push(pageSlug); return page; },
    },
    billing: {
      async getBillingByOwnerId(ownerId) {
        calls.billingOwnerIds.push(ownerId);
        return billing;
      },
    },
    now: () => NOW,
  };

  return {
    dependencies,
    calls,
    setIdentity(uid: string) { identity = { uid }; },
    setUser(value: Record<string, unknown> | null) { user = value; },
    setPage(value: Record<string, unknown> | null) { page = value; },
    setBilling(value: BillingRecord | null) { billing = value; },
    failToken(error: unknown) { tokenFailure = error; },
  };
};

const request = (authorization = `Bearer ${TOKEN}`) =>
  new Request(
    "https://beautypro.test/private?ownerId=attacker&pageSlug=tenant-atacante",
    { headers: authorization ? { authorization } : {} },
  );

const assertCommercialError = async (
  operation: Promise<unknown>,
  status: number,
  code: string,
) => {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof CommercialAccessError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
};

test("ADMIN_BYPASS oficial é permitido sem consultar user, page ou billing", async () => {
  const context = setup();
  context.setIdentity(OFFICIAL_SUPERADMIN_UID);
  context.setUser(null);
  context.setPage(null);
  const result = await requireCommercialAccess(request(), context.dependencies);
  assert.equal(result.entitlement.state, "ADMIN_BYPASS");
  assert.equal(result.ownerId, OFFICIAL_SUPERADMIN_UID);
  assert.equal(result.pageSlug, null);
  assert.deepEqual(context.calls.userUids, []);
  assert.deepEqual(context.calls.pageSlugs, []);
  assert.deepEqual(context.calls.billingOwnerIds, []);
});

test("ACTIVE source=stripe é permitido", async () => {
  const context = setup();
  context.setBilling(billingRecord({ status: "active" }));
  const result = await requireCommercialAccess(request(), context.dependencies);
  assert.equal(result.entitlement.state, "ACTIVE");
  assert.equal(result.entitlement.source, "stripe");
});

test("ACTIVE source=legacy_grant é permitido", async () => {
  const context = setup();
  context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro" });
  context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro" });
  const result = await requireCommercialAccess(request(), context.dependencies);
  assert.equal(result.entitlement.state, "ACTIVE");
  assert.equal(result.entitlement.source, "legacy_grant");
});

test("TRIAL_ACTIVE é permitido", async () => {
  const context = setup();
  const trialDeadline = new Date(NOW.getTime() + 86_400_000);
  context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro", trialDeadline });
  context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro", trialDeadline });
  const result = await requireCommercialAccess(request(), context.dependencies);
  assert.equal(result.entitlement.state, "TRIAL_ACTIVE");
});

test("PAST_DUE_GRACE dentro das 72 horas é permitido", async () => {
  const context = setup();
  context.setBilling(billingRecord({
    status: "past_due",
    pastDueSince: new Date(NOW.getTime() - 71 * 60 * 60 * 1_000),
  }));
  const result = await requireCommercialAccess(request(), context.dependencies);
  assert.equal(result.entitlement.state, "PAST_DUE_GRACE");
});

test("BLOCKED é negado com HTTP 403 e COMMERCIAL_ACCESS_BLOCKED", async () => {
  const context = setup();
  let caught: CommercialAccessError | undefined;
  try {
    await requireCommercialAccess(request(), context.dependencies);
  } catch (error) {
    assert.ok(error instanceof CommercialAccessError);
    caught = error;
  }
  assert.ok(caught);
  const response = commercialAccessErrorResponse(caught);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: { code: "COMMERCIAL_ACCESS_BLOCKED", message: "Acesso comercial bloqueado." },
  });
});

test("sem Bearer falha com 401 antes da verificação", async () => {
  const context = setup();
  await assertCommercialError(
    resolveAuthenticatedCommercialContext(request(""), context.dependencies),
    401,
    "UNAUTHORIZED",
  );
  assert.deepEqual(context.calls.tokens, []);
});

test("token Firebase inválido falha com 401", async () => {
  const context = setup();
  context.failToken(firebaseAuthError(
    "auth/id-token-expired",
    "The provided Firebase ID token is expired.",
  ));
  await assertCommercialError(
    resolveAuthenticatedCommercialContext(request(), context.dependencies),
    401,
    "UNAUTHORIZED",
  );
});

test("falha operacional genérica de verifyIdToken falha com 503", async () => {
  const context = setup();
  context.failToken(new Error("Operational Firebase Admin failure"));
  await assertCommercialError(
    resolveAuthenticatedCommercialContext(request(), context.dependencies),
    503,
    "COMMERCIAL_CONTEXT_UNAVAILABLE",
  );
});

test("resposta 503 de verifyIdToken não expõe detalhes operacionais", async () => {
  const context = setup();
  const sensitiveText = "SECRET_INTERNAL_FIREBASE_FAILURE";
  context.failToken(new Error(sensitiveText));

  let caught: CommercialAccessError | undefined;
  try {
    await resolveAuthenticatedCommercialContext(request(), context.dependencies);
  } catch (error) {
    assert.ok(error instanceof CommercialAccessError);
    caught = error;
  }
  assert.ok(caught);

  const response = commercialAccessErrorResponse(caught);
  const serialized = JSON.stringify(await response.json());
  assert.equal(response.status, 503);
  assert.match(serialized, /COMMERCIAL_CONTEXT_UNAVAILABLE/);
  assert.equal(serialized.includes(sensitiveText), false);
  assert.equal(serialized.includes("stack"), false);
  assert.equal(serialized.includes("details"), false);
});

test("user inexistente ou inválido falha fechado", async () => {
  for (const user of [null, { role: "staff", pageSlug: PAGE_SLUG }, { role: "owner" }]) {
    const context = setup();
    context.setUser(user);
    await assertCommercialError(
      requireCommercialAccess(request(), context.dependencies),
      403,
      "ACCOUNT_NOT_READY",
    );
  }
});

test("page/tenant divergente falha fechado", async () => {
  for (const page of [
    null,
    { userId: "owner-b", slug: PAGE_SLUG, plan: "free" },
    { userId: OWNER_ID, slug: "salao-b", plan: "free" },
  ]) {
    const context = setup();
    context.setPage(page);
    await assertCommercialError(
      requireCommercialAccess(request(), context.dependencies),
      403,
      "TENANT_INCONSISTENT",
    );
  }
});

test("billing vinculado a owner ou tenant divergente falha fechado", async () => {
  for (const billing of [
    billingRecord({ ownerId: "owner-b", status: "active" }),
    billingRecord({ pageSlug: "salao-b", status: "active" }),
  ]) {
    const context = setup();
    context.setBilling(billing);
    await assertCommercialError(
      requireCommercialAccess(request(), context.dependencies),
      403,
      "TENANT_INCONSISTENT",
    );
  }
});

test("falha interna na resolução comercial falha fechado e sanitizada", async () => {
  const context = setup();
  context.dependencies.accounts.getUser = async () => {
    throw new Error("internal firestore secret");
  };
  await assertCommercialError(
    requireCommercialAccess(request(), context.dependencies),
    503,
    "COMMERCIAL_CONTEXT_UNAVAILABLE",
  );
});

test("consultas usam exclusivamente decoded.uid e pageSlug derivado server-side", async () => {
  const context = setup();
  context.setBilling(billingRecord({ status: "active" }));
  const result = await requireCommercialAccess(request(), context.dependencies);
  assert.deepEqual(context.calls.tokens, [TOKEN]);
  assert.deepEqual(context.calls.userUids, [OWNER_ID]);
  assert.deepEqual(context.calls.pageSlugs, [PAGE_SLUG]);
  assert.deepEqual(context.calls.billingOwnerIds, [OWNER_ID]);
  assert.equal(result.identity.uid, OWNER_ID);
  assert.equal(result.ownerId, OWNER_ID);
  assert.equal(result.pageSlug, PAGE_SLUG);
});

test("guard delega a precedência financeira exclusivamente ao resolver canônico", async () => {
  const source = await readFile(
    new URL("../src/lib/commercialAccessService.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /resolveCommercialEntitlement\s*\(/);
  assert.doesNotMatch(source, /billing(?:\?|)\.status\s*===/);
  assert.doesNotMatch(source, /past_due/);
});
