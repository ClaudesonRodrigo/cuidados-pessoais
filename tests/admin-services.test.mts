import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  handleAdminServicesRequest,
  type AdminServiceAction,
  type AdminServicesDependencies,
  type AdminServicesStore,
} from "../src/lib/adminServicesService.ts";
import {
  requireCommercialAccess,
  type CommercialContextDependencies,
} from "../src/lib/commercialAccessService.ts";
import type { BillingRecord } from "../src/lib/billingTypes.ts";

const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const TOKEN = "header.payload.signature";
const NOW = new Date("2026-08-16T12:00:00.000Z");

type Data = Record<string, unknown>;

const service = (title: string, order: number, overrides: Data = {}): Data => ({
  title,
  type: "service",
  url: "",
  order,
  clicks: 0,
  durationMinutes: 30,
  ...overrides,
});

const billingRecord = (overrides: Partial<BillingRecord> = {}): BillingRecord => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

class MemoryAdminServicesStore implements AdminServicesStore {
  page: Data | null = {
    userId: OWNER_ID,
    slug: PAGE_SLUG,
    links: [service("Corte", 1), service("Barba", 2)],
  };
  transactionCalls: string[] = [];
  updateCalls = 0;
  private queue: Promise<void> = Promise.resolve();

  runLinksTransaction(pageSlug: string, operation: (page: Data | null) => Data[]): Promise<void> {
    const run = this.queue.then(async () => {
      this.transactionCalls.push(pageSlug);
      const current = this.page ? structuredClone(this.page) : null;
      const links = operation(current);
      if (!this.page) throw new Error("missing page");
      this.page = { ...this.page, links: structuredClone(links) };
      this.updateCalls += 1;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  links(): Data[] {
    return structuredClone((this.page?.links ?? []) as Data[]);
  }
}

const setup = () => {
  let identity = { uid: OWNER_ID };
  let user: Data | null = { role: "owner", pageSlug: PAGE_SLUG, plan: "free" };
  let page: Data | null = { userId: OWNER_ID, slug: PAGE_SLUG, plan: "free" };
  let billing: BillingRecord | null = billingRecord({ status: "active" });
  let tokenFailure: unknown;
  const store = new MemoryAdminServicesStore();
  const calls = {
    verifiedTokens: [] as string[],
    userUids: [] as string[],
    pageSlugs: [] as string[],
    billingOwnerIds: [] as string[],
  };
  const logged: Array<{ ownerId?: string; error: unknown }> = [];
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
  const dependencies: AdminServicesDependencies = {
    requireCommercialAccess: (request) =>
      requireCommercialAccess(request, commercialDependencies),
    store,
    logError: (entry) => logged.push(entry),
  };

  return {
    dependencies,
    store,
    logged,
    calls,
    setIdentity(uid: string) { identity = { uid }; },
    setUser(value: Data | null) { user = value; },
    setPage(value: Data | null) { page = value; },
    setBilling(value: BillingRecord | null) { billing = value; },
    failToken(error: unknown) { tokenFailure = error; },
  };
};

const actionConfig: Record<AdminServiceAction, { method: string; path: string; body: Data }> = {
  CREATE: {
    method: "POST",
    path: "/api/admin/services",
    body: { title: "Escova", price: "60,00", durationMinutes: 45 },
  },
  EDIT: {
    method: "PATCH",
    path: "/api/admin/services",
    body: { index: 0, title: "Corte Premium", durationMinutes: 60 },
  },
  DELETE: { method: "DELETE", path: "/api/admin/services", body: { index: 0 } },
  REORDER: {
    method: "PUT",
    path: "/api/admin/services/order",
    body: { indices: [1, 0] },
  },
};

const request = (
  action: AdminServiceAction,
  body: unknown = actionConfig[action].body,
  authorization = `Bearer ${TOKEN}`,
  suffix = "",
) => {
  const config = actionConfig[action];
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request(`https://beautypro.test${config.path}${suffix}`, {
    method: config.method,
    headers,
    body: JSON.stringify(body),
  });
};

const execute = (
  action: AdminServiceAction,
  context = setup(),
  body?: unknown,
  authorization?: string,
  suffix?: string,
) => handleAdminServicesRequest(
  request(action, body ?? actionConfig[action].body, authorization, suffix),
  action,
  context.dependencies,
);

const bodyOf = (response: Response) => response.json() as Promise<Data>;

const assertError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await bodyOf(response) as { error: { code: string; message: string } };
  assert.equal(body.error.code, code);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
};

test("sem Bearer retorna 401", async () => {
  await assertError(await execute("CREATE", setup(), undefined, ""), 401, "UNAUTHORIZED");
});

test("token Firebase inválido tipado retorna 401", async () => {
  const context = setup();
  context.failToken(Object.assign(new Error("expired"), { code: "auth/id-token-expired" }));
  await assertError(await execute("CREATE", context), 401, "UNAUTHORIZED");
});

test("falha operacional do Firebase Admin retorna 503 sanitizado", async () => {
  const context = setup();
  context.failToken(new Error("SECRET_INTERNAL_FIREBASE_FAILURE"));
  const response = await execute("CREATE", context);
  const serialized = JSON.stringify(await bodyOf(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /COMMERCIAL_CONTEXT_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_INTERNAL_FIREBASE_FAILURE"), false);
  assert.equal(serialized.includes("stack"), false);
});

for (const [label, configure, expectedSource] of [
  ["ACTIVE Stripe", (context: ReturnType<typeof setup>) => {
    context.setBilling(billingRecord({ status: "active" }));
  }, "stripe"],
  ["ACTIVE legacy", (context: ReturnType<typeof setup>) => {
    context.setBilling(null);
    context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro" });
    context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro" });
  }, "legacy_grant"],
  ["TRIAL_ACTIVE", (context: ReturnType<typeof setup>) => {
    const trialDeadline = new Date(NOW.getTime() + 86_400_000);
    context.setBilling(null);
    context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro", trialDeadline });
    context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro", trialDeadline });
  }, "promotional_trial"],
  ["PAST_DUE_GRACE", (context: ReturnType<typeof setup>) => {
    context.setBilling(billingRecord({
      status: "past_due",
      pastDueSince: new Date(NOW.getTime() - 71 * 60 * 60 * 1_000),
    }));
  }, "stripe"],
] as const) {
  test(`${label} permite CREATE via guard canônico (${expectedSource})`, async () => {
    const context = setup();
    configure(context);
    const response = await execute("CREATE", context);
    assert.equal(response.status, 201);
    assert.deepEqual(await bodyOf(response), { ok: true });
    assert.equal(context.store.links().at(-1)?.title, "Escova");
  });
}

test("UID, owner, tenant e documento transacional usam argumentos server-side", async () => {
  const context = setup();
  assert.equal((await execute("CREATE", context)).status, 201);
  assert.deepEqual(context.calls.verifiedTokens, [TOKEN]);
  assert.deepEqual(context.calls.userUids, [OWNER_ID]);
  assert.deepEqual(context.calls.pageSlugs, [PAGE_SLUG]);
  assert.deepEqual(context.calls.billingOwnerIds, [OWNER_ID]);
  assert.deepEqual(context.store.transactionCalls, [PAGE_SLUG]);
  assert.equal(context.store.updateCalls, 1);
});

test("OWNER ACTIVE pode create, update, reorder e delete", async () => {
  const context = setup();
  assert.equal((await execute("CREATE", context)).status, 201);
  assert.equal((await execute("EDIT", context, {
    index: 2,
    title: "Escova Premium",
    durationMinutes: 90,
  })).status, 200);
  assert.equal((await execute("REORDER", context, { indices: [2, 0, 1] })).status, 200);
  assert.equal((await execute("DELETE", context, { index: 1 })).status, 200);
  assert.deepEqual(context.store.links().map((link) => link.title), ["Escova Premium", "Barba"]);
  assert.deepEqual(context.store.links().map((link) => link.order), [1, 2]);
  assert.deepEqual(context.store.transactionCalls, [PAGE_SLUG, PAGE_SLUG, PAGE_SLUG, PAGE_SLUG]);
});

for (const action of ["CREATE", "EDIT", "DELETE", "REORDER"] as const) {
  test(`OWNER BLOCKED recebe 403 em ${action}`, async () => {
    const context = setup();
    context.setBilling(null);
    await assertError(
      await execute(action, context),
      403,
      "COMMERCIAL_ACCESS_BLOCKED",
    );
    assert.deepEqual(context.store.transactionCalls, []);
  });
}

test("owner sem tenant falha fechado", async () => {
  const context = setup();
  context.setUser({ role: "owner", plan: "pro" });
  await assertError(await execute("CREATE", context), 403, "ACCOUNT_NOT_READY");
  assert.deepEqual(context.store.transactionCalls, []);
});

test("tenant divergente na releitura transacional falha fechado", async () => {
  const context = setup();
  context.store.page = { userId: "owner-b", slug: PAGE_SLUG, links: [] };
  await assertError(await execute("CREATE", context), 409, "TENANT_INCONSISTENT");
});

test("ADMIN_BYPASS sem tenant não executa mutação tenant-specific", async () => {
  const context = setup();
  context.setIdentity(OFFICIAL_SUPERADMIN_UID);
  context.setUser(null);
  context.setPage(null);
  context.setBilling(null);
  await assertError(await execute("CREATE", context), 409, "TENANT_CONTEXT_REQUIRED");
  assert.deepEqual(context.store.transactionCalls, []);
});

test("CREATE define campos estruturais no servidor", async () => {
  const context = setup();
  const response = await execute("CREATE", context, {
    title: "  Escova  ",
    price: "80,00",
    description: "  Longa duração  ",
    imageUrl: "https://res.cloudinary.com/example/image/upload/service.jpg",
    category: "  Cabelo  ",
    durationMinutes: 75,
  });
  assert.equal(response.status, 201);
  assert.deepEqual(context.store.links()[2], {
    title: "Escova",
    price: "80,00",
    description: "Longa duração",
    imageUrl: "https://res.cloudinary.com/example/image/upload/service.jpg",
    category: "Cabelo",
    durationMinutes: 75,
    type: "service",
    order: 3,
    clicks: 0,
    url: "",
  });
});

test("PATCH usa array canônico server-side e preserva campos estruturais", async () => {
  const context = setup();
  context.store.page = {
    userId: OWNER_ID,
    slug: PAGE_SLUG,
    links: [service("Versão canônica", 7, {
      id: "legacy-identity",
      clicks: 19,
      active: false,
      futureField: "preservado",
    })],
  };
  assert.equal((await execute("EDIT", context, {
    index: 0,
    title: "Atualizado",
    durationMinutes: 60,
  })).status, 200);
  assert.deepEqual(context.store.links()[0], service("Atualizado", 7, {
    durationMinutes: 60,
    id: "legacy-identity",
    clicks: 19,
    active: false,
    futureField: "preservado",
  }));
});

test("DELETE e REORDER usam array canônico e recalculam order", async () => {
  const deleteContext = setup();
  deleteContext.store.page = {
    userId: OWNER_ID,
    slug: PAGE_SLUG,
    links: [service("Servidor A", 9), service("Servidor B", 4), service("Servidor C", 7)],
  };
  assert.equal((await execute("DELETE", deleteContext, { index: 1 })).status, 200);
  assert.deepEqual(deleteContext.store.links().map((link) => [link.title, link.order]), [
    ["Servidor A", 1], ["Servidor C", 2],
  ]);

  const reorderContext = setup();
  reorderContext.store.page = structuredClone(deleteContext.store.page);
  assert.equal((await execute("REORDER", reorderContext, { indices: [1, 0] })).status, 200);
  assert.deepEqual(reorderContext.store.links().map((link) => [link.title, link.order]), [
    ["Servidor C", 1], ["Servidor A", 2],
  ]);
});

const nearLimitPage = (): Data => ({
  userId: OWNER_ID,
  slug: PAGE_SLUG,
  links: [service("Corte", 1, { padding: "x".repeat(748_000) })],
});

test("CREATE que cruza 750 KB aborta antes do update transacional", async () => {
  const context = setup();
  context.store.page = nearLimitPage();
  const currentSize = new TextEncoder().encode(JSON.stringify(context.store.links())).byteLength;
  assert.ok(currentSize < 750_000);
  const created = [...context.store.links(), service("Novo", 2, { description: "y".repeat(2_000) })];
  assert.ok(new TextEncoder().encode(JSON.stringify(created)).byteLength > 750_000);
  await assertError(await execute("CREATE", context, {
    title: "Novo",
    description: "y".repeat(2_000),
    durationMinutes: 30,
  }), 409, "SERVICE_STATE_INVALID");
  assert.deepEqual(context.store.transactionCalls, [PAGE_SLUG]);
  assert.equal(context.store.updateCalls, 0);
});

test("PATCH que cruza 750 KB aborta antes do update transacional", async () => {
  const context = setup();
  context.store.page = nearLimitPage();
  const currentSize = new TextEncoder().encode(JSON.stringify(context.store.links())).byteLength;
  assert.ok(currentSize < 750_000);
  const patched = [{ ...context.store.links()[0], description: "y".repeat(2_000) }];
  assert.ok(new TextEncoder().encode(JSON.stringify(patched)).byteLength > 750_000);
  await assertError(await execute("EDIT", context, {
    index: 0,
    description: "y".repeat(2_000),
  }), 409, "SERVICE_STATE_INVALID");
  assert.deepEqual(context.store.transactionCalls, [PAGE_SLUG]);
  assert.equal(context.store.updateCalls, 0);
});

test("transações concorrentes criam sobre o último estado canônico sem lost update", async () => {
  const context = setup();
  const [first, second] = await Promise.all([
    execute("CREATE", context, { title: "Escova", durationMinutes: 40 }),
    execute("CREATE", context, { title: "Hidratação", durationMinutes: 50 }),
  ]);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.deepEqual(context.store.links().map((link) => link.title), [
    "Corte", "Barba", "Escova", "Hidratação",
  ]);
});

test("índice inválido retorna erro controlado", async () => {
  await assertError(await execute("EDIT", setup(), { index: 99, title: "X" }), 404, "SERVICE_NOT_FOUND");
});

for (const indices of [[0, 0], [0], [0, 2], [0, -1], "0,1"] as unknown[]) {
  test(`reorder inválido retorna 400: ${JSON.stringify(indices)}`, async () => {
    await assertError(await execute("REORDER", setup(), { indices }), 400, "INVALID_REQUEST");
  });
}

for (const durationMinutes of [0, 1.5, 1_441, "30"]) {
  test(`durationMinutes inválido retorna 400: ${durationMinutes}`, async () => {
    await assertError(
      await execute("CREATE", setup(), { title: "Corte", durationMinutes }),
      400,
      "INVALID_REQUEST",
    );
  });
}

for (const forbidden of ["pageSlug", "ownerId", "userId", "plan", "isPro", "type", "order", "clicks", "url", "links"]) {
  test(`campo proibido é rejeitado: ${forbidden}`, async () => {
    await assertError(await execute("CREATE", setup(), {
      title: "Corte",
      durationMinutes: 30,
      [forbidden]: "forged",
    }), 400, "INVALID_REQUEST");
  });
}

test("query pageSlug é rejeitada", async () => {
  await assertError(
    await execute("CREATE", setup(), undefined, undefined, "?pageSlug=salao-b"),
    400,
    "INVALID_REQUEST",
  );
});

test("payload acima do limite é rejeitado", async () => {
  await assertError(await execute("CREATE", setup(), {
    title: "Corte",
    durationMinutes: 30,
    description: "x".repeat(20_000),
  }), 400, "INVALID_REQUEST");
});

test("adapter real usa transação Firestore read-modify-write", async () => {
  const source = await readFile("src/lib/adminServices.ts", "utf8");
  assert.match(source, /runTransaction/);
  assert.match(source, /firestore\.collection\("pages"\)\.doc\(pageSlug\)/);
  assert.match(source, /transaction\.get\(reference\)/);
  assert.match(source, /transaction\.update\(reference, \{ links \}\)/);
});

test("client e dashboard não enviam autoridade de tenant nem usam writers legados", async () => {
  const [client, dashboard, pageService] = await Promise.all([
    readFile("src/lib/adminServicesClient.ts", "utf8"),
    readFile("src/app/admin/dashboard/page.tsx", "utf8"),
    readFile("src/lib/pageService.ts", "utf8"),
  ]);
  assert.match(client, /auth\.currentUser/);
  assert.match(client, /getIdToken\(\)/);
  for (const forbidden of ["pageSlug", "ownerId", "entitlement", "billingStatus", "isPro"]) {
    assert.equal(client.includes(forbidden), false);
  }
  for (const migrated of [
    "createAdminService", "updateAdminService", "deleteAdminService", "reorderAdminServices",
  ]) {
    assert.equal(dashboard.includes(migrated), true);
  }
  for (const legacy of ["addLinkToPage", "deleteLinkFromPage", "updateLinksOnPage"]) {
    assert.equal(dashboard.includes(legacy), false);
    assert.equal(pageService.includes(`export const ${legacy}`), false);
  }
});

test("pageService e client admin não contêm writer Web SDK residual de links", async () => {
  const [pageService, adminClient] = await Promise.all([
    readFile("src/lib/pageService.ts", "utf8"),
    readFile("src/lib/adminServicesClient.ts", "utf8"),
  ]);
  const sourceFile = ts.createSourceFile(
    "pageService.ts",
    pageService,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const functionKinds = (node: ts.Node): boolean =>
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node);
  const visit = (node: ts.Node): void => {
    if (functionKinds(node)) {
      let referencesLinks = false;
      let callsWebWrite = false;
      const inspect = (child: ts.Node): void => {
        if (ts.isPropertyAccessExpression(child) && child.name.text === "links") {
          referencesLinks = true;
        }
        if (ts.isPropertyAssignment(child) && child.name.getText(sourceFile).replace(/["'`]/g, "") === "links") {
          referencesLinks = true;
        }
        if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) &&
          new Set(["updateDoc", "setDoc", "arrayUnion", "arrayRemove"]).has(child.expression.text)) {
          callsWebWrite = true;
        }
        ts.forEachChild(child, inspect);
      };
      ts.forEachChild(node, inspect);
      assert.equal(referencesLinks && callsWebWrite, false, "writer Web SDK de links encontrado");
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const clientFile = ts.createSourceFile(
    "adminServicesClient.ts", adminClient, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const firestoreImports = clientFile.statements.filter(
    (statement): statement is ts.ImportDeclaration => ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "firebase/firestore",
  );
  assert.equal(firestoreImports.length, 0);
});

test("página pública continua lendo serviços e campos públicos", async () => {
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");
  for (const expected of ["pageData.links", "pageData.title", "pageData.bio", "pageData.profileImageUrl", "pageData.schedule"]) {
    assert.equal(source.includes(expected), true, `${expected} deve continuar público`);
  }
});

test("entitlement não é reimplementado no serviço administrativo", async () => {
  const source = await readFile("src/lib/adminServicesService.ts", "utf8");
  assert.equal(source.includes("resolveCommercialEntitlement"), false);
  assert.doesNotMatch(source, /billing(?:\?|)\.status/);
  assert.match(source, /requireCommercialAccess/);
});
