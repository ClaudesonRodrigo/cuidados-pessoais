import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  handleMasterServicesRequest,
  type MasterServicesDependencies,
} from "../src/lib/masterServicesService.ts";
import {
  requireSuperadminTenantContext,
  type SuperadminTenantContextDependencies,
} from "../src/lib/superadminTenantContextService.ts";
import type {
  AdminServiceAction,
  AdminServicesStore,
} from "../src/lib/adminServicesService.ts";

const OWNER_ID = "owner-a";
const PAGE_SLUG = "salao-a";
const TOKEN = "header.payload.signature";

type Data = Record<string, unknown>;

const service = (title: string, order: number): Data => ({
  title,
  type: "service",
  url: "",
  order,
  clicks: 0,
  durationMinutes: 30,
});

class MemoryServicesStore implements AdminServicesStore {
  page: Data | null = {
    userId: OWNER_ID,
    slug: PAGE_SLUG,
    links: [service("Corte", 1), service("Barba", 2)],
  };
  calls: string[] = [];
  updates = 0;
  failWith: unknown;

  async runLinksTransaction(
    pageSlug: string,
    operation: (page: Data | null) => Data[],
  ): Promise<void> {
    this.calls.push(pageSlug);
    if (this.failWith) throw this.failWith;
    const links = operation(this.page ? structuredClone(this.page) : null);
    if (!this.page) throw new Error("missing page");
    this.page = { ...this.page, links: structuredClone(links) };
    this.updates += 1;
  }

  links(): Data[] {
    return structuredClone((this.page?.links ?? []) as Data[]);
  }
}

const setup = () => {
  let identity = { uid: OFFICIAL_SUPERADMIN_UID };
  let user: Data | null = { pageSlug: PAGE_SLUG, plan: "blocked" };
  let page: Data | null = { userId: OWNER_ID, slug: PAGE_SLUG, plan: "blocked" };
  const calls = {
    users: [] as string[],
    pages: [] as string[],
  };
  const store = new MemoryServicesStore();
  const logged: Array<{ targetOwnerId?: string; error: unknown }> = [];
  const contextDependencies: SuperadminTenantContextDependencies = {
    async verifyIdToken() {
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
  const dependencies: MasterServicesDependencies = {
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
  };
};

const configs: Record<AdminServiceAction, {
  method: string;
  path: string;
  body: Data;
}> = {
  CREATE: {
    method: "POST",
    path: "/api/master/services",
    body: { targetOwnerId: OWNER_ID, title: "Escova", durationMinutes: 45 },
  },
  EDIT: {
    method: "PATCH",
    path: "/api/master/services",
    body: { targetOwnerId: OWNER_ID, index: 0, title: "Corte Premium" },
  },
  DELETE: {
    method: "DELETE",
    path: "/api/master/services",
    body: { targetOwnerId: OWNER_ID, index: 0 },
  },
  REORDER: {
    method: "PUT",
    path: "/api/master/services/order",
    body: { targetOwnerId: OWNER_ID, indices: [1, 0] },
  },
};

const request = (
  action: AdminServiceAction,
  body: unknown = configs[action].body,
  authorization = `Bearer ${TOKEN}`,
): Request => {
  const config = configs[action];
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request(`https://beautypro.test${config.path}`, {
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
) => handleMasterServicesRequest(
  request(action, body ?? configs[action].body, authorization),
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

test("public retorna 401", async () => {
  await assertError(await execute("CREATE", setup(), undefined, ""), 401, "UNAUTHORIZED");
});

test("owner comum retorna 403", async () => {
  const context = setup();
  context.setIdentity(OWNER_ID);
  await assertError(await execute("CREATE", context), 403, "SUPERADMIN_REQUIRED");
  assert.deepEqual(context.store.calls, []);
});

test("superadmin com target bloqueado válido usa pageSlug server-side", async () => {
  const context = setup();
  assert.equal((await execute("CREATE", context)).status, 201);
  assert.deepEqual(context.calls.users, [OWNER_ID]);
  assert.deepEqual(context.calls.pages, [PAGE_SLUG]);
  assert.deepEqual(context.store.calls, [PAGE_SLUG]);
  assert.equal(context.store.links().at(-1)?.title, "Escova");
});

test("targetOwnerId inválido retorna 400", async () => {
  await assertError(await execute("CREATE", setup(), {
    targetOwnerId: "../owner",
    title: "Escova",
    durationMinutes: 45,
  }), 400, "INVALID_REQUEST");
});

test("target inexistente retorna 404", async () => {
  const context = setup();
  context.setUser(null);
  await assertError(await execute("CREATE", context), 404, "TARGET_TENANT_NOT_FOUND");
  assert.deepEqual(context.store.calls, []);
});

test("binding inconsistente retorna 404", async () => {
  const context = setup();
  context.setPage({ userId: "owner-b", slug: PAGE_SLUG });
  await assertError(await execute("CREATE", context), 404, "TARGET_TENANT_NOT_FOUND");
  assert.deepEqual(context.store.calls, []);
});

test("CREATE aplica criação canônica Owner", async () => {
  const context = setup();
  assert.equal((await execute("CREATE", context, {
    targetOwnerId: OWNER_ID,
    title: "  Escova  ",
    price: "60,00",
    description: "  Longa  ",
    imageUrl: "https://example.com/service.jpg",
    category: "  Cabelo  ",
    durationMinutes: 45,
  })).status, 201);
  assert.deepEqual(context.store.links()[2], {
    title: "Escova",
    price: "60,00",
    description: "Longa",
    imageUrl: "https://example.com/service.jpg",
    category: "Cabelo",
    durationMinutes: 45,
    type: "service",
    order: 3,
    clicks: 0,
    url: "",
  });
});

test("UPDATE preserva campos estruturais", async () => {
  const context = setup();
  assert.equal((await execute("EDIT", context)).status, 200);
  assert.deepEqual(context.store.links()[0], {
    ...service("Corte Premium", 1),
    durationMinutes: 30,
  });
});

test("DELETE remove service e renumera", async () => {
  const context = setup();
  assert.equal((await execute("DELETE", context)).status, 200);
  assert.deepEqual(context.store.links().map((link) => [link.title, link.order]), [
    ["Barba", 1],
  ]);
});

test("REORDER exige permutação completa e renumera", async () => {
  const context = setup();
  assert.equal((await execute("REORDER", context)).status, 200);
  assert.deepEqual(context.store.links().map((link) => [link.title, link.order]), [
    ["Barba", 1],
    ["Corte", 2],
  ]);
});

test("pageSlug no body retorna 400", async () => {
  await assertError(await execute("CREATE", setup(), {
    ...configs.CREATE.body,
    pageSlug: PAGE_SLUG,
  }), 400, "INVALID_REQUEST");
});

test("campo extra retorna 400", async () => {
  await assertError(await execute("CREATE", setup(), {
    ...configs.CREATE.body,
    billing: "forged",
  }), 400, "INVALID_REQUEST");
});

test("índice inválido é negado", async () => {
  await assertError(await execute("EDIT", setup(), {
    targetOwnerId: OWNER_ID,
    index: 99,
    title: "X",
  }), 404, "SERVICE_NOT_FOUND");
});

test("UPDATE e DELETE recusam item que não é service", async () => {
  for (const action of ["EDIT", "DELETE"] as const) {
    const context = setup();
    context.store.page = {
      userId: OWNER_ID,
      slug: PAGE_SLUG,
      links: [{ title: "Link", type: "link", order: 1 }],
    };
    await assertError(await execute(action, context, {
      targetOwnerId: OWNER_ID,
      index: 0,
      ...(action === "EDIT" ? { title: "X" } : {}),
    }), 404, "SERVICE_NOT_FOUND");
  }
});

for (const [label, indices] of [
  ["duplicado", [0, 0]],
  ["incompleto", [0]],
  ["fora da faixa", [0, 2]],
] as const) {
  test(`reorder ${label} retorna 400`, async () => {
    await assertError(await execute("REORDER", setup(), {
      targetOwnerId: OWNER_ID,
      indices,
    }), 400, "INVALID_REQUEST");
  });
}

test("reorder com campo extra retorna 400", async () => {
  await assertError(await execute("REORDER", setup(), {
    targetOwnerId: OWNER_ID,
    indices: [1, 0],
    pageSlug: PAGE_SLUG,
  }), 400, "INVALID_REQUEST");
});

test("payload excessivo retorna 400", async () => {
  await assertError(await execute("REORDER", setup(), {
    targetOwnerId: OWNER_ID,
    indices: [1, 0],
    padding: "x".repeat(20_000),
  }), 400, "INVALID_REQUEST");
});

test("falha operacional retorna 503 sanitizado", async () => {
  const context = setup();
  context.store.failWith = new Error("SECRET_MASTER_SERVICES_FAILURE");
  const response = await execute("CREATE", context);
  const serialized = JSON.stringify(await bodyOf(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /MASTER_SERVICES_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_MASTER_SERVICES_FAILURE"), false);
  assert.equal(serialized.includes("stack"), false);
  assert.equal(context.logged.length, 1);
});

test("Master reutiliza domínio Owner sem billing", async () => {
  const source = await readFile("src/lib/masterServicesService.ts", "utf8");
  for (const required of [
    "parseServiceMutation",
    "applyServiceMutation",
    "canonicalServiceLinks",
    "assertServiceLinksSize",
    "requireSuperadminTenantContext",
  ]) {
    assert.equal(source.includes(required), true);
  }
  for (const forbidden of [
    "requireCommercialAccess",
    "resolveCommercialEntitlement",
    "getBillingByOwnerId",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});

test("adapter usa Firebase Admin e client/dashboard usam HTTP Master", async () => {
  const [adapter, client, dashboard] = await Promise.all([
    readFile("src/lib/masterServices.ts", "utf8"),
    readFile("src/lib/masterServicesClient.ts", "utf8"),
    readFile("src/app/admin/dashboard/page.tsx", "utf8"),
  ]);
  assert.match(adapter, /getAdminFirestore/);
  assert.match(adapter, /runTransaction/);
  assert.match(adapter, /collection\("pages"\)\.doc\(pageSlug\)/);
  assert.equal(client.includes("firebase/firestore"), false);
  assert.match(client, /auth\.currentUser/);
  assert.match(client, /getIdToken\(\)/);
  assert.match(client, /\/api\/master\/services/);
  for (const call of [
    "createMasterService",
    "updateMasterService",
    "deleteMasterService",
    "reorderMasterServices",
  ]) {
    assert.equal(dashboard.includes(call), true);
  }
});
