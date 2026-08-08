import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  handleOnboardingRequest,
  InvalidOnboardingTokenError,
  type DecodedIdentity,
  type OnboardingStore,
  type OnboardingTransaction,
} from "../src/lib/onboardingService.ts";

type Data = Record<string, unknown>;

const NOW = new Date("2099-01-05T12:00:00.000Z");
const identities: Record<string, DecodedIdentity> = {
  "token-a": { uid: "customer-a", email: "a@example.com" },
  "token-b": { uid: "customer-b", email: "b@example.com" },
  "owner-a": { uid: "owner-a", email: "owner-a@example.com" },
  "owner-b": { uid: "owner-b", email: "owner-b@example.com" },
  "no-email": { uid: "no-email" },
};

const cloneMap = (source: Map<string, Data>) =>
  new Map([...source].map(([key, value]) => [key, structuredClone(value)]));

class MemoryStore implements OnboardingStore {
  users = new Map<string, Data>();
  pages = new Map<string, Data>();
  failCreatePage = false;
  failTransaction: Error | null = null;
  private tail: Promise<void> = Promise.resolve();

  async runTransaction<T>(operation: (transaction: OnboardingTransaction) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;

    const users = cloneMap(this.users);
    const pages = cloneMap(this.pages);
    try {
      if (this.failTransaction) throw this.failTransaction;
      const result = await operation({
        async getUser(uid) { return users.get(uid) ?? null; },
        async getPage(slug) { return pages.get(slug) ?? null; },
        createUser(uid, data) {
          if (users.has(uid)) throw new Error("user already exists");
          users.set(uid, structuredClone(data));
        },
        createPage: (slug, data) => {
          if (this.failCreatePage) throw new Error("synthetic page failure");
          if (pages.has(slug)) throw new Error("page already exists");
          pages.set(slug, structuredClone(data));
        },
      });
      this.users = users;
      this.pages = pages;
      return result;
    } finally {
      release();
    }
  }
}

const customerBody = (extra: Record<string, unknown> = {}) => ({
  accountType: "customer",
  displayName: "Cliente A",
  ...extra,
});

const ownerBody = (extra: Record<string, unknown> = {}) => ({
  accountType: "owner",
  slug: "salao-owner-a",
  title: "Salão Owner A",
  displayName: "Owner A",
  ...extra,
});

const makeRequest = (body: unknown, token?: string) =>
  new Request("http://localhost/api/onboarding", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const execute = (
  store: MemoryStore,
  body: unknown,
  token?: string,
  verify = async (value: string) => {
    const identity = identities[value];
    if (!identity) throw new InvalidOnboardingTokenError();
    return identity;
  },
) => handleOnboardingRequest(makeRequest(body, token), { verifyIdToken: verify, store, now: () => NOW });

const responseBody = (response: Response) => response.json() as Promise<Record<string, any>>;

test("token ausente é rejeitado", async () => {
  const response = await execute(new MemoryStore(), customerBody());
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error.code, "UNAUTHORIZED");
});

test("token inválido é rejeitado", async () => {
  assert.equal((await execute(new MemoryStore(), customerBody(), "invalid")).status, 401);
});

for (const authorization of ["Basic credencial", "Bearer", "Bearer "]) {
  test(`Authorization inválida é rejeitada sem verificar token: ${JSON.stringify(authorization)}`, async () => {
    let verificationCalled = false;
    const request = new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify(customerBody()),
    });
    const response = await handleOnboardingRequest(request, {
      verifyIdToken: async () => {
        verificationCalled = true;
        return identities["token-a"];
      },
      store: new MemoryStore(),
      now: () => NOW,
    });
    assert.equal(response.status, 401);
    assert.equal(verificationCalled, false);
  });
}

test("falha de getAdminAuth/inicialização retorna 503, não 401", async () => {
  const response = await execute(
    new MemoryStore(),
    customerBody(),
    "token-a",
    async () => { throw new Error("FIREBASE_PRIVATE_KEY=segredo configuração interna"); },
  );
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(response.status, 503);
  assert.equal(serialized.includes("ONBOARDING_UNAVAILABLE"), true);
  for (const forbidden of ["FIREBASE_PRIVATE_KEY", "segredo", "configuração interna", "stack"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("customer novo deriva UID e email somente do token", async () => {
  const store = new MemoryStore();
  const response = await execute(store, customerBody(), "token-a");
  assert.equal(response.status, 200);
  assert.equal(store.users.get("customer-a")?.email, "a@example.com");
  assert.equal(store.users.has("Cliente A"), false);
});

test("customer sem email no token omite email", async () => {
  const store = new MemoryStore();
  await execute(store, customerBody(), "no-email");
  assert.equal("email" in store.users.get("no-email")!, false);
});

test("customer novo omite campos administrativos sem consumidores", async () => {
  const store = new MemoryStore();
  await execute(store, customerBody({ phone: "5500000000", cpfCnpj: "123" }), "token-a");
  const user = store.users.get("customer-a")!;
  assert.equal(user.role, "customer");
  assert.equal(user.phone, "5500000000");
  for (const field of ["plan", "trialDeadline", "pageSlug", "isSuperAdmin", "admin", "isPro"]) {
    assert.equal(field in user, false, `${field} deve ser omitido`);
  }
  assert.deepEqual(user.createdAt, NOW);
});

test("customer idempotente não altera createdAt ou perfil", async () => {
  const store = new MemoryStore();
  await execute(store, customerBody(), "token-a");
  const original = structuredClone(store.users.get("customer-a"));
  const response = await execute(store, customerBody({ displayName: "Outro" }), "token-a");
  assert.equal((await responseBody(response)).status, "ALREADY_PROVISIONED");
  assert.deepEqual(store.users.get("customer-a"), original);
});

test("owner novo cria user e page consistentes e atômicos", async () => {
  const store = new MemoryStore();
  const response = await execute(store, ownerBody(), "owner-a");
  assert.equal(response.status, 200);
  const user = store.users.get("owner-a")!;
  const page = store.pages.get("salao-owner-a")!;
  assert.equal(user.role, "owner");
  assert.equal(user.plan, "pro");
  assert.equal(user.pageSlug, "salao-owner-a");
  assert.equal(page.userId, "owner-a");
  assert.equal(page.slug, "salao-owner-a");
  assert.equal(page.plan, "pro");
  assert.deepEqual(page.links, []);
  assert.equal(page.isOpen, true);
  assert.deepEqual(user.trialDeadline, page.trialDeadline);
});

test("trial do owner é exatamente sete dias server-side", async () => {
  const store = new MemoryStore();
  await execute(store, ownerBody(), "owner-a");
  const trial = store.users.get("owner-a")!.trialDeadline as Date;
  assert.equal(trial.getTime() - NOW.getTime(), 7 * 24 * 60 * 60 * 1_000);
});

test("owner idempotente com mesmo slug não estende trial", async () => {
  const store = new MemoryStore();
  await execute(store, ownerBody(), "owner-a");
  const initialTrial = (store.users.get("owner-a")!.trialDeadline as Date).getTime();
  const response = await execute(store, ownerBody({ title: "Título novo ignorado" }), "owner-a");
  assert.equal((await responseBody(response)).status, "ALREADY_PROVISIONED");
  assert.equal((store.users.get("owner-a")!.trialDeadline as Date).getTime(), initialTrial);
  assert.equal(store.pages.get("salao-owner-a")!.title, "Salão Owner A");
});

test("accountType admin é impossível", async () => {
  const response = await execute(new MemoryStore(), { accountType: "admin" }, "token-a");
  assert.equal(response.status, 400);
});

for (const field of [
  "plan", "trialDeadline", "pageSlug", "uid", "userId", "createdAt",
  "isSuperAdmin", "admin", "isPro", "role", "email",
]) {
  test(`campo administrativo ${field} é rejeitado`, async () => {
    const store = new MemoryStore();
    const response = await execute(store, customerBody({ [field]: "forjado" }), "token-a");
    assert.equal(response.status, 400);
    assert.equal(store.users.size, 0);
  });
}

test("campo desconhecido não é ignorado", async () => {
  assert.equal((await execute(new MemoryStore(), customerBody({ extra: true }), "token-a")).status, 400);
});

test("JSON malformado retorna resposta controlada", async () => {
  const request = new Request("http://localhost/api/onboarding", {
    method: "POST",
    headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
    body: "{incompleto",
  });
  const response = await handleOnboardingRequest(request, {
    verifyIdToken: async () => identities["token-a"],
    store: new MemoryStore(),
    now: () => NOW,
  });
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error.code, "INVALID_REQUEST");
});

test("body acima do limite retorna resposta controlada", async () => {
  const request = new Request("http://localhost/api/onboarding", {
    method: "POST",
    headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
    body: JSON.stringify(customerBody({ displayName: "a".repeat(8_192) })),
  });
  const response = await handleOnboardingRequest(request, {
    verifyIdToken: async () => identities["token-a"],
    store: new MemoryStore(),
    now: () => NOW,
  });
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error.code, "INVALID_REQUEST");
});

for (const slug of ["../pages", "salao/a", "Salao-A", "salao a", "a"]) {
  test(`slug inválido é rejeitado: ${slug}`, async () => {
    const response = await execute(new MemoryStore(), ownerBody({ slug }), "owner-a");
    assert.equal(response.status, 400);
    assert.equal((await responseBody(response)).error.code, "INVALID_SLUG");
  });
}

test("slug ocupado por terceiro retorna SLUG_TAKEN", async () => {
  const store = new MemoryStore();
  store.pages.set("salao-owner-a", { userId: "other" });
  const response = await execute(store, ownerBody(), "owner-a");
  assert.equal(response.status, 409);
  assert.equal((await responseBody(response)).error.code, "SLUG_TAKEN");
});

test("slug concorrente cria somente um owner e uma page", async () => {
  const store = new MemoryStore();
  const [first, second] = await Promise.all([
    execute(store, ownerBody(), "owner-a"),
    execute(store, ownerBody(), "owner-b"),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  assert.equal(store.pages.size, 1);
  assert.equal(store.users.size, 1);
});

test("mesmo UID concorrente com slugs diferentes cria somente um estado", async () => {
  const store = new MemoryStore();
  const [first, second] = await Promise.all([
    execute(store, ownerBody({ slug: "primeiro-salao" }), "owner-a"),
    execute(store, ownerBody({ slug: "segundo-salao" }), "owner-a"),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  assert.equal(store.users.size, 1);
  assert.equal(store.pages.size, 1);
});

test("mesmo UID e mesma requisição concorrente é idempotente", async () => {
  const store = new MemoryStore();
  const [first, second] = await Promise.all([
    execute(store, ownerBody(), "owner-a"),
    execute(store, ownerBody(), "owner-a"),
  ]);
  assert.deepEqual([first.status, second.status], [200, 200]);
  assert.deepEqual(
    [(await responseBody(first)).status, (await responseBody(second)).status].sort(),
    ["ALREADY_PROVISIONED", "PROVISIONED"],
  );
  assert.equal(store.users.size, 1);
  assert.equal(store.pages.size, 1);
});

test("falha na page não cria user parcial", async () => {
  const store = new MemoryStore();
  store.failCreatePage = true;
  const response = await execute(store, ownerBody(), "owner-a");
  assert.equal(response.status, 503);
  assert.equal(store.users.size, 0);
  assert.equal(store.pages.size, 0);
});

test("estado legado contraditório retorna PROVISIONING_CONFLICT", async () => {
  const store = new MemoryStore();
  store.users.set("customer-a", { role: "customer", plan: "pro" });
  const response = await execute(store, customerBody(), "token-a");
  assert.equal(response.status, 409);
  assert.equal((await responseBody(response)).error.code, "PROVISIONING_CONFLICT");
});

for (const field of ["admin", "isPro"] as const) {
  test(`customer legado com ${field}:true retorna conflito sem reparo`, async () => {
    const store = new MemoryStore();
    const original = { role: "customer", [field]: true };
    store.users.set("customer-a", structuredClone(original));
    const response = await execute(store, customerBody(), "token-a");
    assert.equal(response.status, 409);
    assert.equal((await responseBody(response)).error.code, "PROVISIONING_CONFLICT");
    assert.deepEqual(store.users.get("customer-a"), original);
  });
}

test("customer para owner não é convertido automaticamente", async () => {
  const store = new MemoryStore();
  await execute(store, customerBody(), "token-a");
  const response = await execute(store, ownerBody(), "token-a");
  assert.equal(response.status, 409);
  assert.equal(store.pages.size, 0);
});

test("owner solicitando segundo slug recebe conflito", async () => {
  const store = new MemoryStore();
  await execute(store, ownerBody(), "owner-a");
  const response = await execute(store, ownerBody({ slug: "outro-salao" }), "owner-a");
  assert.equal(response.status, 409);
  assert.equal((await responseBody(response)).error.code, "PROVISIONING_CONFLICT");
});

test("estado parcial legado do owner não é reparado silenciosamente", async () => {
  const store = new MemoryStore();
  store.users.set("owner-a", { role: "owner", plan: "pro", pageSlug: "salao-owner-a" });
  const response = await execute(store, ownerBody(), "owner-a");
  assert.equal(response.status, 409);
  assert.equal(store.pages.size, 0);
});

test("owner legado com flag administrativa contraditória retorna conflito sem reparo", async () => {
  const store = new MemoryStore();
  await execute(store, ownerBody(), "owner-a");
  const originalUser = { ...structuredClone(store.users.get("owner-a")!), admin: true };
  store.users.set("owner-a", originalUser);
  const originalPage = structuredClone(store.pages.get("salao-owner-a")!);
  const response = await execute(store, ownerBody(), "owner-a");
  assert.equal(response.status, 409);
  assert.equal((await responseBody(response)).error.code, "PROVISIONING_CONFLICT");
  assert.deepEqual(store.users.get("owner-a"), originalUser);
  assert.deepEqual(store.pages.get("salao-owner-a"), originalPage);
});

test("erro interno não expõe stack ou segredo", async () => {
  const store = new MemoryStore();
  store.failTransaction = new Error("PRIVATE_KEY=segredo stack interno");
  const response = await execute(store, customerBody(), "token-a");
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(response.status, 503);
  for (const forbidden of ["PRIVATE_KEY", "segredo", "stack interno"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("resposta não contém UID, email, token ou segredo", async () => {
  const store = new MemoryStore();
  const response = await execute(store, ownerBody(), "owner-a");
  const body = await responseBody(response);
  assert.deepEqual(Object.keys(body).sort(), ["accountType", "pageSlug", "status"]);
  const serialized = JSON.stringify(body);
  for (const forbidden of ["owner-a@example.com", "email", "uid", "token", "PRIVATE_KEY"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("login customer e owner usam ID Token e endpoint, sem escrita Firestore", async () => {
  const source = await readFile("src/lib/authService.ts", "utf8");
  assert.equal(source.includes("signInWithGoogle('customer')"), false);
  assert.equal(source.includes("getIdToken()"), true);
  assert.equal(source.includes("/api/onboarding"), true);
  assert.equal(source.includes("setDoc("), false);
  assert.equal(source.includes("addDoc("), false);
  assert.equal(source.includes("updateDoc("), false);
  assert.equal(source.includes("accountType: 'customer'"), true);
  assert.equal(source.includes("accountType: 'owner'"), true);
});

test("AuthContext apenas observa e lê o perfil, sem bootstrap administrativo", async () => {
  const source = await readFile("src/context/AuthContext.tsx", "utf8");
  assert.equal(source.includes("onAuthStateChanged"), true);
  assert.equal(source.includes("getDoc(userRef)"), true);
  assert.equal(source.includes("setUserData(userSnap.data())"), true);
  for (const forbidden of [
    "setDoc", "updateDoc", "addDoc", "writeBatch", "runTransaction",
    "HYyAPj9xDEYKPTymoRdklZxxXR33", "isSuperAdmin", "serverTimestamp",
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} não deve existir no AuthContext`);
  }
});

test("owner existente reutiliza pageSlug para idempotência do login", async () => {
  const source = await readFile("src/lib/authService.ts", "utf8");
  assert.equal(source.includes("existingOwnerSlug || generateSlug"), true);
  const store = new MemoryStore();
  await execute(store, ownerBody(), "owner-a");
  assert.equal(store.users.get("owner-a")!.pageSlug, "salao-owner-a");
  assert.equal(store.pages.get("salao-owner-a")!.userId, "owner-a");
});

test("getRecentPages não possui consumidor", async () => {
  const files = [
    await readFile("src/lib/pageService.ts", "utf8"),
    await readFile("src/app/page.tsx", "utf8"),
    await readFile("src/app/admin/dashboard/page.tsx", "utf8"),
    await readFile("src/app/[slug]/page.tsx", "utf8"),
  ];
  assert.equal(files.slice(1).some((source) => source.includes("getRecentPages")), false);
});

test("Firebase Admin é server-only e não usa variável pública", async () => {
  const source = await readFile("src/lib/firebaseAdmin.ts", "utf8");
  assert.equal(source.includes('import "server-only"'), true);
  assert.equal(source.includes("NEXT_PUBLIC_"), false);
  assert.equal(source.includes('app.name === "[DEFAULT]"'), true);
  assert.equal(source.includes("getApp()"), false);
  assert.equal(source.includes("FIREBASE_PRIVATE_KEY"), true);
});

test("rota usa verifyIdToken e uma transação Firestore", async () => {
  const source = await readFile("src/app/api/onboarding/route.ts", "utf8");
  assert.equal(source.includes("verifyIdToken(token)"), true);
  assert.equal(source.includes("db.runTransaction"), true);
  assert.equal(source.includes("firestoreTransaction.create"), true);
  assert.equal(source.includes('runtime = "nodejs"'), true);
  assert.equal(source.includes("InvalidOnboardingTokenError"), true);
  assert.equal(source.includes('"auth/id-token-expired"'), true);
  assert.equal(source.includes('"auth/id-token-revoked"'), true);
  assert.equal(source.includes("const adminAuth = getAdminAuth()"), true);
});
