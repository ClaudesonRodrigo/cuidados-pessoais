import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  handleAdminCreateTransactionRequest,
  handleAdminDeleteTransactionRequest,
  type AdminTransactionsDependencies,
  type AdminTransactionsStore,
} from "../src/lib/adminTransactionsService.ts";
import {
  requireCommercialAccess,
  type CommercialContextDependencies,
} from "../src/lib/commercialAccessService.ts";
import type { BillingRecord } from "../src/lib/billingTypes.ts";
import type { TransactionBusinessInput } from "../src/lib/transactionsService.ts";

const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const TRANSACTION_ID = "transaction-a";
const TOKEN = "header.payload.signature";
const NOW = new Date("2026-08-17T12:00:00.000Z");
const INPUT = {
  type: "income",
  description: "Venda balcão",
  value: 50,
  category: "Serviço",
  date: "2026-08-17T12:00:00.000Z",
} as const;
type Data = Record<string, unknown>;

const billingRecord = (overrides: Partial<BillingRecord> = {}): BillingRecord => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

class MemoryStore implements AdminTransactionsStore {
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
  let user: Data | null = { role: "owner", pageSlug: PAGE_SLUG, plan: "free" };
  let page: Data | null = { userId: OWNER_ID, slug: PAGE_SLUG, plan: "free" };
  let billing: BillingRecord | null = billingRecord({ status: "active" });
  let tokenFailure: unknown;
  const calls = { tokens: [] as string[], users: [] as string[], pages: [] as string[], billing: [] as string[] };
  const commercialDependencies: CommercialContextDependencies = {
    async verifyIdToken(token) { calls.tokens.push(token); if (tokenFailure) throw tokenFailure; return { uid: OWNER_ID }; },
    accounts: {
      async getUser(uid) { calls.users.push(uid); return user; },
      async getPage(slug) { calls.pages.push(slug); return page; },
    },
    billing: { async getBillingByOwnerId(ownerId) { calls.billing.push(ownerId); return billing; } },
    now: () => NOW,
  };
  const store = new MemoryStore();
  const dependencies: AdminTransactionsDependencies = {
    requireCommercialAccess: (request) => requireCommercialAccess(request, commercialDependencies),
    store,
  };
  return {
    dependencies, store, calls,
    setUser(value: Data | null) { user = value; },
    setPage(value: Data | null) { page = value; },
    setBilling(value: BillingRecord | null) { billing = value; },
    failToken(error: unknown) { tokenFailure = error; },
  };
};

const createRequest = (body: unknown = INPUT, authorization = `Bearer ${TOKEN}`, suffix = "") => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request(`https://beautypro.test/api/admin/transactions${suffix}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
};

const deleteRequest = (authorization = `Bearer ${TOKEN}`, suffix = "") => {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  return new Request(`https://beautypro.test/api/admin/transactions/${TRANSACTION_ID}${suffix}`, {
    method: "DELETE", headers,
  });
};

const responseBody = (response: Response) => response.json() as Promise<Data>;
const assertError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status);
  const body = await responseBody(response) as { error: { code: string } };
  assert.equal(body.error.code, code);
};

test("Owner ACTIVE cria com tenant derivado e payload de negócio validado", async () => {
  const context = setup();
  const response = await handleAdminCreateTransactionRequest(createRequest(), context.dependencies);
  assert.equal(response.status, 201);
  assert.deepEqual(await responseBody(response), { ok: true, transaction: { id: "created-id" } });
  assert.equal(context.store.createCalls[0].pageSlug, PAGE_SLUG);
  assert.deepEqual(context.store.createCalls[0].input, { ...INPUT, date: new Date(INPUT.date) });
});

test("Owner ACTIVE exclui somente no próprio tenant", async () => {
  const context = setup();
  const response = await handleAdminDeleteTransactionRequest(deleteRequest(), TRANSACTION_ID, context.dependencies);
  assert.equal(response.status, 200);
  assert.equal(context.store.deleteCalls, 1);
  assert.deepEqual(context.store.deleteAttempts, [{ id: TRANSACTION_ID, pageSlug: PAGE_SLUG }]);
});

for (const [label, configure] of [
  ["TRIAL_ACTIVE", (context: ReturnType<typeof setup>) => {
    const deadline = new Date(NOW.getTime() + 86_400_000);
    context.setBilling(null);
    context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro", trialDeadline: deadline });
    context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro", trialDeadline: deadline });
  }],
  ["PAST_DUE_GRACE", (context: ReturnType<typeof setup>) => context.setBilling(billingRecord({
    status: "past_due", pastDueSince: new Date(NOW.getTime() - 71 * 60 * 60 * 1_000),
  }))],
] as const) {
  test(`Owner ${label} pode criar e excluir`, async () => {
    const createContext = setup(); configure(createContext);
    assert.equal((await handleAdminCreateTransactionRequest(createRequest(), createContext.dependencies)).status, 201);
    const deleteContext = setup(); configure(deleteContext);
    assert.equal((await handleAdminDeleteTransactionRequest(deleteRequest(), TRANSACTION_ID, deleteContext.dependencies)).status, 200);
  });
}

test("Owner BLOCKED recebe 403 e nenhuma mutation abre", async () => {
  const context = setup();
  context.setBilling(null);
  await assertError(await handleAdminCreateTransactionRequest(createRequest(), context.dependencies), 403, "COMMERCIAL_ACCESS_BLOCKED");
  await assertError(await handleAdminDeleteTransactionRequest(deleteRequest(), TRANSACTION_ID, context.dependencies), 403, "COMMERCIAL_ACCESS_BLOCKED");
  assert.equal(context.store.createCalls.length, 0);
  assert.equal(context.store.deleteAttempts.length, 0);
});

test("sem autenticação retorna 401 antes da store", async () => {
  const context = setup();
  await assertError(await handleAdminCreateTransactionRequest(createRequest(INPUT, ""), context.dependencies), 401, "UNAUTHORIZED");
  assert.equal(context.store.createCalls.length, 0);
});

test("delete cross-tenant retorna 404 e zero delete", async () => {
  const context = setup();
  context.store.transactions.get(TRANSACTION_ID)!.pageSlug = "salao-b";
  await assertError(await handleAdminDeleteTransactionRequest(deleteRequest(), TRANSACTION_ID, context.dependencies), 404, "TRANSACTION_NOT_FOUND");
  assert.equal(context.store.deleteCalls, 0);
});

for (const forbidden of ["pageSlug", "createdAt", "ownerId", "adminViewId"]) {
  test(`create fechado rejeita ${forbidden}`, async () => {
    const context = setup();
    await assertError(await handleAdminCreateTransactionRequest(
      createRequest({ ...INPUT, [forbidden]: "forbidden" }), context.dependencies,
    ), 400, "INVALID_REQUEST");
    assert.equal(context.store.createCalls.length, 0);
  });
}

test("falha operacional retorna 503 sanitizado", async () => {
  const context = setup();
  context.store.failWith = new Error("SECRET_FIRESTORE_FAILURE");
  const response = await handleAdminCreateTransactionRequest(createRequest(), context.dependencies);
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /TRANSACTIONS_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_FIRESTORE_FAILURE"), false);
});

test("adapter deriva createdAt/pageSlug e delete valida ownership em transação", async () => {
  const source = await readFile("src/lib/adminTransactions.ts", "utf8");
  assert.match(source, /createdAt: FieldValue\.serverTimestamp\(\)/);
  assert.match(source, /collection\("transactions"\)\.doc\(transactionId\)/);
  assert.match(source, /transaction\.get\(reference\)/);
  assert.match(source, /snapshot\.data\(\)\?\.pageSlug !== pageSlug/);
  assert.match(source, /transaction\.delete\(reference\)/);
});

test("dashboard/modal usam API Owner e não enviam autoridade de tenant", async () => {
  const [dashboard, modal, pageService] = await Promise.all([
    readFile("src/app/admin/dashboard/page.tsx", "utf8"),
    readFile("src/components/TransactionModal.tsx", "utf8"),
    readFile("src/lib/pageService.ts", "utf8"),
  ]);
  assert.match(dashboard, /createAdminTransaction\(input\)/);
  assert.match(dashboard, /deleteAdminTransaction\(id\)/);
  assert.equal(modal.includes("pageSlug"), false);
  assert.equal(modal.includes("createdAt"), false);
  assert.equal(pageService.includes("export const addTransaction"), false);
  assert.equal(pageService.includes("export const deleteTransaction"), false);
  assert.match(pageService, /export const getTransactionsByDate/);
});
