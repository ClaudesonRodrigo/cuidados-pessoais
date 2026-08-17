import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID, isOfficialSuperAdminUid } from "../src/lib/adminIdentity.ts";
import {
  handleMasterCreateTransactionRequest,
  handleMasterDeleteTransactionRequest,
  type MasterTransactionsDependencies,
  type MasterTransactionsStore,
} from "../src/lib/masterTransactionsService.ts";
import {
  requireSuperadminTenantContext,
  type SuperadminTenantContextDependencies,
} from "../src/lib/superadminTenantContextService.ts";
import type { TransactionBusinessInput } from "../src/lib/transactionsService.ts";

const TARGET_OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const TRANSACTION_ID = "transaction-a";
const TOKEN = "header.payload.signature";
const INPUT = {
  type: "expense",
  description: "Energia",
  value: 90,
  category: "Contas",
  date: "2026-08-17T12:00:00.000Z",
} as const;
type Data = Record<string, unknown>;

class MemoryStore implements MasterTransactionsStore {
  transactions = new Map<string, Data>([[TRANSACTION_ID, { pageSlug: PAGE_SLUG }]]);
  createCalls: Array<{ pageSlug: string; input: TransactionBusinessInput }> = [];
  deleteAttempts: Array<{ id: string; pageSlug: string }> = [];
  deleteCalls = 0;
  failWith: unknown;

  async createTransaction(pageSlug: string, input: TransactionBusinessInput): Promise<string> {
    if (this.failWith) throw this.failWith;
    this.createCalls.push({ pageSlug, input });
    return "created-id";
  }

  async deleteTransaction(id: string, pageSlug: string): Promise<boolean> {
    this.deleteAttempts.push({ id, pageSlug });
    if (this.failWith) throw this.failWith;
    const current = this.transactions.get(id);
    if (!current || current.pageSlug !== pageSlug) return false;
    this.transactions.delete(id);
    this.deleteCalls += 1;
    return true;
  }
}

const setup = () => {
  let uid = OFFICIAL_SUPERADMIN_UID;
  let user: Data | null = { pageSlug: PAGE_SLUG };
  let page: Data | null = { userId: TARGET_OWNER_ID, slug: PAGE_SLUG };
  const calls = { tokens: [] as string[], officialUids: [] as string[], users: [] as string[], pages: [] as string[] };
  const contextDependencies: SuperadminTenantContextDependencies = {
    async verifyIdToken(token) { calls.tokens.push(token); return { uid }; },
    isOfficialSuperAdminUid(value) { calls.officialUids.push(value); return isOfficialSuperAdminUid(value); },
    accounts: {
      async getUser(ownerId) { calls.users.push(ownerId); return user; },
      async getPage(slug) { calls.pages.push(slug); return page; },
    },
  };
  const store = new MemoryStore();
  const dependencies: MasterTransactionsDependencies = {
    requireSuperadminTenantContext: (request, target) =>
      requireSuperadminTenantContext(request, target, contextDependencies),
    store,
  };
  return {
    dependencies, store, calls,
    setUid(value: string) { uid = value; },
    setUser(value: Data | null) { user = value; },
  };
};

const createRequest = (body: unknown = { targetOwnerId: TARGET_OWNER_ID, ...INPUT }, authorization = `Bearer ${TOKEN}`) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request("https://beautypro.test/api/master/transactions", {
    method: "POST", headers, body: JSON.stringify(body),
  });
};

const deleteRequest = (body: unknown = { targetOwnerId: TARGET_OWNER_ID }, authorization = `Bearer ${TOKEN}`) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request(`https://beautypro.test/api/master/transactions/${TRANSACTION_ID}`, {
    method: "DELETE", headers, body: JSON.stringify(body),
  });
};

const responseBody = (response: Response) => response.json() as Promise<Data>;
const assertError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status);
  const body = await responseBody(response) as { error: { code: string } };
  assert.equal(body.error.code, code);
};

test("Superadmin + target válido cria e exclui no tenant resolvido", async () => {
  const createContext = setup();
  const created = await handleMasterCreateTransactionRequest(createRequest(), createContext.dependencies);
  assert.equal(created.status, 201);
  assert.equal(createContext.store.createCalls[0].pageSlug, PAGE_SLUG);
  assert.deepEqual(createContext.calls.users, [TARGET_OWNER_ID]);
  assert.deepEqual(createContext.calls.pages, [PAGE_SLUG]);

  const deleteContext = setup();
  const deleted = await handleMasterDeleteTransactionRequest(
    deleteRequest(), TRANSACTION_ID, deleteContext.dependencies,
  );
  assert.equal(deleted.status, 200);
  assert.equal(deleteContext.store.deleteCalls, 1);
});

test("PUBLIC retorna 401 e nenhuma store abre", async () => {
  const context = setup();
  await assertError(await handleMasterCreateTransactionRequest(createRequest(undefined, ""), context.dependencies), 401, "UNAUTHORIZED");
  assert.equal(context.store.createCalls.length, 0);
});

test("Owner comum retorna 403 antes de consultar target", async () => {
  const context = setup();
  context.setUid("owner-common");
  await assertError(await handleMasterCreateTransactionRequest(createRequest(), context.dependencies), 403, "SUPERADMIN_REQUIRED");
  assert.deepEqual(context.calls.users, []);
  assert.equal(context.store.createCalls.length, 0);
});

test("target inválido retorna 404 sem mutation", async () => {
  const context = setup();
  context.setUser(null);
  await assertError(await handleMasterCreateTransactionRequest(createRequest(), context.dependencies), 404, "TARGET_TENANT_NOT_FOUND");
  assert.equal(context.store.createCalls.length, 0);
});

test("cross-target delete retorna 404 e zero delete", async () => {
  const context = setup();
  context.store.transactions.get(TRANSACTION_ID)!.pageSlug = "salao-b";
  await assertError(await handleMasterDeleteTransactionRequest(
    deleteRequest(), TRANSACTION_ID, context.dependencies,
  ), 404, "TRANSACTION_NOT_FOUND");
  assert.equal(context.store.deleteCalls, 0);
});

for (const forbidden of ["pageSlug", "ownerId", "adminViewId", "createdAt"]) {
  test(`Master create fechado rejeita ${forbidden}`, async () => {
    const context = setup();
    await assertError(await handleMasterCreateTransactionRequest(
      createRequest({ targetOwnerId: TARGET_OWNER_ID, ...INPUT, [forbidden]: "forbidden" }),
      context.dependencies,
    ), 400, "INVALID_REQUEST");
    assert.equal(context.store.createCalls.length, 0);
  });
}

test("Master delete aceita somente targetOwnerId", async () => {
  const context = setup();
  await assertError(await handleMasterDeleteTransactionRequest(
    deleteRequest({ targetOwnerId: TARGET_OWNER_ID, pageSlug: PAGE_SLUG }),
    TRANSACTION_ID,
    context.dependencies,
  ), 400, "INVALID_REQUEST");
  assert.equal(context.store.deleteCalls, 0);
});

test("falha Firestore inesperada retorna 503 sanitizado", async () => {
  const context = setup();
  context.store.failWith = new Error("SECRET_FIRESTORE_FAILURE");
  const response = await handleMasterCreateTransactionRequest(createRequest(), context.dependencies);
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /TRANSACTIONS_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_FIRESTORE_FAILURE"), false);
});

test("Master usa UID oficial, targetOwnerId e pageSlug exatos sem billing", async () => {
  const context = setup();
  assert.equal((await handleMasterCreateTransactionRequest(createRequest(), context.dependencies)).status, 201);
  assert.deepEqual(context.calls.tokens, [TOKEN]);
  assert.deepEqual(context.calls.officialUids, [OFFICIAL_SUPERADMIN_UID]);
  assert.deepEqual(context.calls.users, [TARGET_OWNER_ID]);
  assert.deepEqual(context.calls.pages, [PAGE_SLUG]);
  const sources = await Promise.all([
    readFile("src/lib/masterTransactionsService.ts", "utf8"),
    readFile("src/lib/masterTransactions.ts", "utf8"),
  ]);
  assert.equal(sources.join("\n").includes("requireCommercialAccess"), false);
  assert.doesNotMatch(sources.join("\n"), /billing|stripe/i);
});

test("dashboard escolhe client Master com adminViewId e clients não importam Firestore", async () => {
  const [dashboard, ownerClient, masterClient] = await Promise.all([
    readFile("src/app/admin/dashboard/page.tsx", "utf8"),
    readFile("src/lib/adminTransactionsClient.ts", "utf8"),
    readFile("src/lib/masterTransactionsClient.ts", "utf8"),
  ]);
  assert.match(dashboard, /createMasterTransaction\(adminViewId, input\)/);
  assert.match(dashboard, /deleteMasterTransaction\(adminViewId, id\)/);
  assert.match(masterClient, /JSON\.stringify\(\{ targetOwnerId, \.\.\.input \}\)/);
  assert.match(masterClient, /JSON\.stringify\(\{ targetOwnerId \}\)/);
  assert.equal(ownerClient.includes("firebase/firestore"), false);
  assert.equal(masterClient.includes("firebase/firestore"), false);
});
