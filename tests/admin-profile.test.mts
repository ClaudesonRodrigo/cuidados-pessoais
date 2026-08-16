import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  handleAdminProfileRequest,
  type AdminProfileDependencies,
  type AdminProfileStore,
} from "../src/lib/adminProfileService.ts";
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

const billingRecord = (overrides: Partial<BillingRecord> = {}): BillingRecord => ({
  ownerId: OWNER_ID,
  pageSlug: PAGE_SLUG,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

class MemoryAdminProfileStore implements AdminProfileStore {
  page: Data | null = {
    userId: OWNER_ID,
    slug: PAGE_SLUG,
    title: "Original",
    bio: "Bio original",
    address: "Rua original",
    whatsapp: "5579999999999",
    pixKey: "pix-original",
    isOpen: true,
    profileImageUrl: "https://example.com/original.jpg",
    schedule: { open: "09:00", close: "18:00", workingDays: [1, 2, 3, 4, 5] },
    theme: "dark",
    links: [{ title: "Corte", type: "service" }],
  };
  transactionCalls: string[] = [];
  updateCalls = 0;
  failWith: unknown;

  async runProfileTransaction(
    pageSlug: string,
    operation: (page: Data | null) => Data,
  ): Promise<void> {
    this.transactionCalls.push(pageSlug);
    if (this.failWith) throw this.failWith;
    const update = operation(this.page ? structuredClone(this.page) : null);
    if (!this.page) throw new Error("missing page");
    this.page = { ...this.page, ...structuredClone(update) };
    this.updateCalls += 1;
  }
}

const setup = () => {
  let identity = { uid: OWNER_ID };
  let user: Data | null = { role: "owner", pageSlug: PAGE_SLUG, plan: "free" };
  let page: Data | null = { userId: OWNER_ID, slug: PAGE_SLUG, plan: "free" };
  let billing: BillingRecord | null = billingRecord({ status: "active" });
  let tokenFailure: unknown;
  const calls = {
    verifiedTokens: [] as string[],
    userUids: [] as string[],
    pageSlugs: [] as string[],
    billingOwnerIds: [] as string[],
  };
  const store = new MemoryAdminProfileStore();
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
  const dependencies: AdminProfileDependencies = {
    requireCommercialAccess: (request) =>
      requireCommercialAccess(request, commercialDependencies),
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
    setBilling(value: BillingRecord | null) { billing = value; },
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
  return new Request(`https://beautypro.test/api/admin/page/profile${suffix}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
};

const execute = (
  context = setup(),
  body: unknown = { title: "Studio" },
  authorization?: string,
  suffix?: string,
) => handleAdminProfileRequest(
  request(body, authorization, suffix),
  context.dependencies,
);

const responseBody = (response: Response) => response.json() as Promise<Data>;

const assertError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await responseBody(response) as { error: { code: string; message: string } };
  assert.equal(body.error.code, code);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
};

test("sem Bearer retorna 401", async () => {
  await assertError(await execute(setup(), undefined, ""), 401, "UNAUTHORIZED");
});

test("token Firebase inválido tipado retorna 401", async () => {
  const context = setup();
  context.failToken(Object.assign(new Error("expired"), { code: "auth/id-token-expired" }));
  await assertError(await execute(context), 401, "UNAUTHORIZED");
});

test("falha operacional Firebase Admin retorna 503 sanitizado", async () => {
  const context = setup();
  context.failToken(new Error("SECRET_INTERNAL_FIREBASE_FAILURE"));
  const response = await execute(context);
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /COMMERCIAL_CONTEXT_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_INTERNAL_FIREBASE_FAILURE"), false);
  assert.equal(serialized.includes("stack"), false);
});

for (const [label, configure] of [
  ["ACTIVE Stripe", (context: ReturnType<typeof setup>) => {
    context.setBilling(billingRecord({ status: "active" }));
  }],
  ["ACTIVE legacy", (context: ReturnType<typeof setup>) => {
    context.setBilling(null);
    context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro" });
    context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro" });
  }],
  ["TRIAL_ACTIVE", (context: ReturnType<typeof setup>) => {
    const trialDeadline = new Date(NOW.getTime() + 86_400_000);
    context.setBilling(null);
    context.setUser({ role: "owner", pageSlug: PAGE_SLUG, plan: "pro", trialDeadline });
    context.setPage({ userId: OWNER_ID, slug: PAGE_SLUG, plan: "pro", trialDeadline });
  }],
  ["PAST_DUE_GRACE", (context: ReturnType<typeof setup>) => {
    context.setBilling(billingRecord({
      status: "past_due",
      pastDueSince: new Date(NOW.getTime() - 71 * 60 * 60 * 1_000),
    }));
  }],
] as const) {
  test(`${label} permite PATCH`, async () => {
    const context = setup();
    configure(context);
    assert.equal((await execute(context)).status, 200);
    assert.equal(context.store.page?.title, "Studio");
  });
}

test("BLOCKED recebe 403 COMMERCIAL_ACCESS_BLOCKED", async () => {
  const context = setup();
  context.setBilling(null);
  await assertError(await execute(context), 403, "COMMERCIAL_ACCESS_BLOCKED");
  assert.equal(context.store.updateCalls, 0);
});

test("ADMIN_BYPASS sem tenant recebe TENANT_CONTEXT_REQUIRED", async () => {
  const context = setup();
  context.setIdentity(OFFICIAL_SUPERADMIN_UID);
  context.setUser(null);
  context.setPage(null);
  context.setBilling(null);
  await assertError(await execute(context), 409, "TENANT_CONTEXT_REQUIRED");
  assert.deepEqual(context.store.transactionCalls, []);
});

test("tenant inconsistente na releitura transacional falha fechado", async () => {
  const context = setup();
  context.store.page = { userId: "owner-b", slug: PAGE_SLUG };
  await assertError(await execute(context), 409, "TENANT_INCONSISTENT");
  assert.equal(context.store.updateCalls, 0);
});

test("UID, owner, pageSlug e documento transacional são server-side", async () => {
  const context = setup();
  assert.equal((await execute(context)).status, 200);
  assert.deepEqual(context.calls.verifiedTokens, [TOKEN]);
  assert.deepEqual(context.calls.userUids, [OWNER_ID]);
  assert.deepEqual(context.calls.pageSlugs, [PAGE_SLUG]);
  assert.deepEqual(context.calls.billingOwnerIds, [OWNER_ID]);
  assert.deepEqual(context.store.transactionCalls, [PAGE_SLUG]);
});

test("body vazio retorna 400", async () => {
  await assertError(await execute(setup(), {}), 400, "INVALID_REQUEST");
});

for (const forbidden of [
  "pageSlug", "ownerId", "userId", "plan", "isPro", "trialDeadline", "entitlement",
  "billingStatus", "slug", "createdAt", "links",
]) {
  test(`campo proibido retorna 400: ${forbidden}`, async () => {
    await assertError(await execute(setup(), { [forbidden]: "forged" }), 400, "INVALID_REQUEST");
  });
}

test("campo desconhecido retorna 400", async () => {
  await assertError(await execute(setup(), { unknown: true }), 400, "INVALID_REQUEST");
});

test("query pageSlug retorna 400", async () => {
  await assertError(await execute(setup(), undefined, undefined, "?pageSlug=salao-b"), 400, "INVALID_REQUEST");
});

for (const [field, value, expected] of [
  ["title", "  Studio Beauty  ", "Studio Beauty"],
  ["bio", "  Uma bio  ", "Uma bio"],
  ["address", "  Rua A, 10  ", "Rua A, 10"],
  ["whatsapp", "+55 (79) 99999-9999", "5579999999999"],
  ["pixKey", "  chave@example.com  ", "chave@example.com"],
  ["isOpen", false, false],
  ["profileImageUrl", "https://res.cloudinary.com/demo/image/upload/profile.jpg", "https://res.cloudinary.com/demo/image/upload/profile.jpg"],
] as const) {
  test(`campo válido é normalizado e persistido isoladamente: ${field}`, async () => {
    const context = setup();
    assert.equal((await execute(context, { [field]: value })).status, 200);
    assert.equal(context.store.page?.[field], expected);
    assert.equal(context.store.updateCalls, 1);
  });
}

const validSchedule = {
  open: "09:00",
  close: "18:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  workingDays: [1, 2, 3, 4, 5],
};

test("schedule válido substitui integralmente o objeto", async () => {
  const context = setup();
  assert.equal((await execute(context, { schedule: validSchedule })).status, 200);
  assert.deepEqual(context.store.page?.schedule, validSchedule);
});

for (const [label, schedule] of [
  ["HH:mm inválido", { ...validSchedule, open: "9:00" }],
  ["open igual a close", { ...validSchedule, open: "18:00" }],
  ["open maior que close", { ...validSchedule, open: "19:00" }],
  ["workingDays duplicados", { ...validSchedule, workingDays: [1, 1] }],
  ["dia fora de 0..6", { ...validSchedule, workingDays: [7] }],
  ["somente lunchStart", { open: "09:00", close: "18:00", lunchStart: "12:00", workingDays: [1] }],
  ["somente lunchEnd", { open: "09:00", close: "18:00", lunchEnd: "13:00", workingDays: [1] }],
  ["lunchStart igual a lunchEnd", { ...validSchedule, lunchStart: "13:00" }],
  ["almoço antes do expediente", { ...validSchedule, lunchStart: "08:00" }],
  ["almoço após o expediente", { ...validSchedule, lunchEnd: "19:00" }],
] as const) {
  test(`schedule rejeita ${label}`, async () => {
    const context = setup();
    await assertError(await execute(context, { schedule }), 400, "INVALID_REQUEST");
    assert.equal(context.store.updateCalls, 0);
  });
}

for (const [label, body] of [
  ["title vazio", { title: "   " }],
  ["bio acima do limite", { bio: "x".repeat(2_001) }],
  ["address acima do limite", { address: "x".repeat(301) }],
  ["whatsapp curto", { whatsapp: "123" }],
  ["pixKey acima do limite", { pixKey: "x".repeat(201) }],
  ["isOpen não boolean", { isOpen: "true" }],
  ["profileImageUrl HTTP", { profileImageUrl: "http://example.com/profile.jpg" }],
] as const) {
  test(`validação individual rejeita ${label}`, async () => {
    await assertError(await execute(setup(), body), 400, "INVALID_REQUEST");
  });
}

test("PATCH parcial não sobrescreve campos ausentes", async () => {
  const context = setup();
  const before = structuredClone(context.store.page!);
  assert.equal((await execute(context, { bio: "Somente a bio" })).status, 200);
  assert.equal(context.store.page?.bio, "Somente a bio");
  for (const field of ["title", "address", "whatsapp", "pixKey", "isOpen", "schedule", "theme", "links"]) {
    assert.deepEqual(context.store.page?.[field], before[field], `${field} deve ser preservado`);
  }
});

test("falha inesperada do store retorna 503 sanitizado", async () => {
  const context = setup();
  context.store.failWith = new Error("SECRET_PROFILE_STORE_FAILURE");
  const response = await execute(context);
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(response.status, 503);
  assert.match(serialized, /ADMIN_PROFILE_UNAVAILABLE/);
  assert.equal(serialized.includes("SECRET_PROFILE_STORE_FAILURE"), false);
});

test("adapter real usa pages/context.pageSlug e transação antes do update", async () => {
  const source = await readFile("src/lib/adminProfile.ts", "utf8");
  assert.match(source, /firestore\.collection\("pages"\)\.doc\(pageSlug\)/);
  assert.match(source, /runTransaction/);
  assert.match(source, /transaction\.get\(reference\)/);
  assert.match(source, /operation\(snapshot/);
  assert.match(source, /transaction\.update\(reference, update\)/);
});

test("client e dashboard usam API sem autoridade de tenant", async () => {
  const [client, dashboard, pageService] = await Promise.all([
    readFile("src/lib/adminProfileClient.ts", "utf8"),
    readFile("src/app/admin/dashboard/page.tsx", "utf8"),
    readFile("src/lib/pageService.ts", "utf8"),
  ]);
  assert.match(client, /auth\.currentUser/);
  assert.match(client, /getIdToken\(\)/);
  assert.match(client, /\/api\/admin\/page\/profile/);
  for (const forbidden of ["pageSlug", "ownerId", "entitlement", "billingStatus", "isPro"]) {
    assert.equal(client.includes(forbidden), false);
  }
  assert.match(dashboard, /updateAdminProfile/);
  for (const legacy of ["updatePageProfileInfo", "updateProfileImage"]) {
    assert.equal(dashboard.includes(legacy), false);
    assert.equal(pageService.includes(`export const ${legacy}`), false);
  }
  for (const preserved of ["updatePageTheme", "updatePageBackground", "updatePageCoupons"]) {
    assert.equal(pageService.includes(`export const ${preserved}`), true);
  }
});

test("serviço não reimplementa entitlement", async () => {
  const source = await readFile("src/lib/adminProfileService.ts", "utf8");
  assert.equal(source.includes("resolveCommercialEntitlement"), false);
  assert.doesNotMatch(source, /billing(?:\?|)\.status/);
  assert.match(source, /requireCommercialAccess/);
});

test("página pública continua lendo Perfil, schedule e imagem", async () => {
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");
  for (const expected of [
    "pageData.title", "pageData.bio", "pageData.address", "pageData.whatsapp",
    "pageData.pixKey", "pageData.isOpen", "pageData.schedule", "pageData.profileImageUrl",
  ]) {
    assert.equal(source.includes(expected), true, `${expected} deve continuar público`);
  }
});
