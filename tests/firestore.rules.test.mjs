import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = "demo-beautypro-rules";
const SUPERADMIN_UID = "HYyAPj9xDEYKPTymoRdklZxxXR33";
const START = Timestamp.fromDate(new Date("2099-03-01T12:00:00.000Z"));
const END = Timestamp.fromDate(new Date("2099-03-01T13:00:00.000Z"));
const CREATED = Timestamp.fromDate(new Date("2099-02-01T10:00:00.000Z"));

let testEnv;

const db = (profile) => {
  if (profile === "public") return testEnv.unauthenticatedContext().firestore();
  const profiles = {
    customerA: ["customer-a", {}],
    customerB: ["customer-b", {}],
    ownerA: ["owner-a", {}],
    ownerB: ["owner-b", {}],
    fakeAdminByRole: ["fake-role-admin", { role: "admin" }],
    fakeSuperAdminField: ["fake-super-field", { isSuperAdmin: true }],
    fakeAdminEmail: ["fake-admin-email", { email: "claudesonborges@gmail.com" }],
    officialSuperAdmin: [SUPERADMIN_UID, { email: "irrelevant@example.com" }],
  };
  const [uid, claims] = profiles[profile];
  return testEnv.authenticatedContext(uid, claims).firestore();
};

const appointment = (overrides = {}) => ({
  pageSlug: "salao-a",
  serviceId: "service-a",
  serviceName: "Corte",
  customerId: "customer-a",
  customerEmail: "customer-a@example.com",
  customerPhoto: "https://example.com/photo.jpg",
  customerName: "Customer A",
  customerPhone: "5500000000",
  startAt: START,
  endAt: END,
  status: "pending",
  createdAt: CREATED,
  totalValue: 50,
  ...overrides,
});

const transaction = (overrides = {}) => ({
  pageSlug: "salao-a",
  type: "income",
  description: "Venda",
  value: 50,
  category: "Serviço",
  date: START,
  createdAt: CREATED,
  ...overrides,
});

const loyalty = (overrides = {}) => ({
  pageSlug: "salao-a",
  customerId: "customer-a",
  points: 2,
  totalRewards: 1,
  lastUpdated: CREATED,
  ...overrides,
});

const seed = async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    const writes = [
      setDoc(doc(admin, "users/customer-a"), {
        uid: "customer-a", role: "customer", displayName: "Customer A", createdAt: CREATED,
      }),
      setDoc(doc(admin, "users/customer-b"), {
        uid: "customer-b", role: "customer", displayName: "Customer B", createdAt: CREATED,
      }),
      setDoc(doc(admin, "users/owner-a"), {
        uid: "owner-a", role: "owner", plan: "pro", pageSlug: "salao-a", createdAt: CREATED,
      }),
      setDoc(doc(admin, "users/owner-b"), {
        uid: "owner-b", role: "owner", plan: "pro", pageSlug: "salao-b", createdAt: CREATED,
      }),
      setDoc(doc(admin, "users/fake-role-admin"), { role: "admin", createdAt: CREATED }),
      setDoc(doc(admin, "users/fake-super-field"), { isSuperAdmin: true, createdAt: CREATED }),
      setDoc(doc(admin, "users/fake-admin-email"), {
        email: "claudesonborges@gmail.com", createdAt: CREATED,
      }),
      setDoc(doc(admin, "pages/salao-a"), {
        userId: "owner-a", slug: "salao-a", title: "Salão A", bio: "A", links: [],
        plan: "pro", trialDeadline: END, createdAt: CREATED, isOpen: true,
      }),
      setDoc(doc(admin, "pages/salao-b"), {
        userId: "owner-b", slug: "salao-b", title: "Salão B", bio: "B", links: [],
        plan: "pro", trialDeadline: END, createdAt: CREATED, isOpen: true,
      }),
      setDoc(doc(admin, "appointments/a-pending"), appointment()),
      setDoc(doc(admin, "appointments/a-confirmed"), appointment({ status: "confirmed" })),
      setDoc(doc(admin, "appointments/a-completed"), appointment({ status: "completed" })),
      setDoc(doc(admin, "appointments/a-cancelled"), appointment({ status: "cancelled" })),
      setDoc(doc(admin, "appointments/b-pending"), appointment({
        pageSlug: "salao-b", customerId: "customer-b", status: "pending",
      })),
      setDoc(doc(admin, "bookingLocks/salao-a_4076035200000"), {
        pageSlug: "salao-a", slotStart: START, appointmentId: "a-pending", createdAt: CREATED,
      }),
      setDoc(doc(admin, "transactions/transaction-a"), transaction()),
      setDoc(doc(admin, "transactions/transaction-b"), transaction({ pageSlug: "salao-b" })),
      setDoc(doc(admin, "loyalty/salao-a_customer-a"), loyalty()),
      setDoc(doc(admin, "loyalty/salao-b_customer-b"), loyalty({
        pageSlug: "salao-b", customerId: "customer-b",
      })),
      setDoc(doc(admin, "services/legacy-service"), { name: "Legacy" }),
      setDoc(doc(admin, "barbershops/legacy-shop"), { name: "Legacy" }),
    ];
    await Promise.all(writes);
  });
};

before(async () => {
  const rules = await readFile("firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

after(async () => {
  await testEnv?.cleanup();
});

test("superadmin oficial possui autoridade global", async () => {
  const admin = db("officialSuperAdmin");
  await assertSucceeds(getDocs(collection(admin, "users")));
  await assertSucceeds(setDoc(doc(admin, "users/new-user"), { role: "admin" }));
  await assertSucceeds(updateDoc(doc(admin, "pages/salao-a"), { plan: "free", trialDeadline: null }));
});

test("updateUserPlan funciona somente para o UID oficial nas duas coleções", async () => {
  const admin = db("officialSuperAdmin");
  await assertSucceeds(updateDoc(doc(admin, "users/owner-a"), { plan: "free", trialDeadline: null }));
  const pages = await assertSucceeds(getDocs(query(
    collection(admin, "pages"), where("userId", "==", "owner-a"),
  )));
  assert.equal(pages.size, 1);
  await assertSucceeds(updateDoc(pages.docs[0].ref, { plan: "free", trialDeadline: null }));

  const commonOwner = db("ownerA");
  await assertFails(updateDoc(doc(commonOwner, "users/owner-a"), { plan: "pro", trialDeadline: END }));
  await assertFails(updateDoc(doc(commonOwner, "pages/salao-a"), { plan: "pro", trialDeadline: END }));
});

for (const profile of ["fakeAdminByRole", "fakeSuperAdminField", "fakeAdminEmail"]) {
  test(`${profile} não recebe privilégio administrativo`, async () => {
    const client = db(profile);
    await assertFails(getDocs(collection(client, "users")));
    await assertFails(updateDoc(doc(client, "users/owner-a"), { plan: "free" }));
  });
}

test("user pode obter o próprio documento", async () => {
  await assertSucceeds(getDoc(doc(db("customerA"), "users/customer-a")));
});

test("user não pode obter documento de terceiro", async () => {
  await assertFails(getDoc(doc(db("customerA"), "users/customer-b")));
});

test("user comum não pode listar users", async () => {
  await assertFails(getDocs(collection(db("customerA"), "users")));
});

for (const [field, value] of [
  ["displayName", "Nome novo"], ["phone", "5511999999999"],
  ["cpfCnpj", "123"], ["photoURL", "https://example.com/new.jpg"],
]) {
  test(`user pode alterar campo pessoal ${field}`, async () => {
    await assertSucceeds(updateDoc(doc(db("customerA"), "users/customer-a"), { [field]: value }));
  });
}

for (const [field, value] of [
  ["uid", "forged"], ["role", "admin"], ["plan", "pro"],
  ["trialDeadline", END], ["pageSlug", "salao-b"], ["isSuperAdmin", true],
  ["createdAt", END], ["admin", true], ["isPro", true], ["email", "new@example.com"],
]) {
  test(`user não pode alterar campo administrativo ${field}`, async () => {
    await assertFails(updateDoc(doc(db("customerA"), "users/customer-a"), { [field]: value }));
  });
}

test("update pessoal misturado com administrativo é negado", async () => {
  await assertFails(updateDoc(doc(db("customerA"), "users/customer-a"), {
    displayName: "Permitido isoladamente", role: "admin",
  }));
});

test("user comum não pode criar ou excluir users", async () => {
  const client = db("customerA");
  await assertFails(setDoc(doc(client, "users/new-user"), { role: "customer" }));
  await assertFails(deleteDoc(doc(client, "users/customer-a")));
});

test("page get por slug conhecido permanece público", async () => {
  await assertSucceeds(getDoc(doc(db("public"), "pages/salao-a")));
});

test("page list público é negado", async () => {
  await assertFails(getDocs(collection(db("public"), "pages")));
});

test("owner atualiza campos operacionais da própria page", async () => {
  await assertSucceeds(updateDoc(doc(db("ownerA"), "pages/salao-a"), {
    title: "Novo título", bio: "Nova bio", address: "Rua A", whatsapp: "5500",
    pixKey: "pix", profileImageUrl: "profile", backgroundImage: "background",
    links: [], coupons: [], theme: "light", isOpen: false,
    schedule: { open: "09:00", close: "18:00", workingDays: [1, 2, 3] },
  }));
});

test("owner não atualiza page de outro tenant", async () => {
  await assertFails(updateDoc(doc(db("ownerA"), "pages/salao-b"), { title: "Ataque" }));
});

test("owner não edita serviços de outro tenant", async () => {
  await assertFails(updateDoc(doc(db("ownerA"), "pages/salao-b"), {
    links: [{ title: "Ataque", type: "service", order: 1, durationMinutes: 30 }],
  }));
});

for (const [field, value] of [
  ["userId", "owner-b"], ["slug", "outro"], ["plan", "free"],
  ["trialDeadline", CREATED], ["isPro", true], ["createdAt", END],
  ["isSuperAdmin", true], ["admin", true],
]) {
  test(`owner não altera campo protegido de page: ${field}`, async () => {
    await assertFails(updateDoc(doc(db("ownerA"), "pages/salao-a"), { [field]: value }));
  });
}

test("owner lista pages somente com filtro do próprio UID", async () => {
  const ownQuery = query(collection(db("ownerA"), "pages"), where("userId", "==", "owner-a"));
  const snapshot = await assertSucceeds(getDocs(ownQuery));
  assert.equal(snapshot.size, 1);
});

test("owner não consulta pages filtrando UID de terceiro", async () => {
  const otherQuery = query(collection(db("ownerA"), "pages"), where("userId", "==", "owner-b"));
  await assertFails(getDocs(otherQuery));
});

test("owner não executa list global de pages", async () => {
  await assertFails(getDocs(collection(db("ownerA"), "pages")));
});

test("superadmin executa list global de pages", async () => {
  const snapshot = await assertSucceeds(getDocs(collection(db("officialSuperAdmin"), "pages")));
  assert.equal(snapshot.size, 2);
});

test("owner comum não cria nem exclui page", async () => {
  const owner = db("ownerA");
  await assertFails(setDoc(doc(owner, "pages/new-page"), { userId: "owner-a", slug: "new-page" }));
  await assertFails(deleteDoc(doc(owner, "pages/salao-a")));
});

test("appointment create público é negado", async () => {
  await assertFails(addDoc(collection(db("public"), "appointments"), appointment()));
});

test("customer autenticado não cria appointment pelo Client SDK", async () => {
  await assertFails(addDoc(collection(db("customerA"), "appointments"), appointment()));
});

test("appointment create com customerId falso é negado", async () => {
  await assertFails(addDoc(collection(db("customerA"), "appointments"), appointment({ customerId: "customer-b" })));
});

test("appointment create com status inicial diferente de pending é negado", async () => {
  await assertFails(addDoc(collection(db("customerA"), "appointments"), appointment({ status: "confirmed" })));
});

test("appointment create com campo extra é negado", async () => {
  await assertFails(addDoc(collection(db("customerA"), "appointments"), appointment({ admin: true })));
});

test("appointment create exige página existente e intervalo válido", async () => {
  const client = db("customerA");
  await assertFails(addDoc(collection(client, "appointments"), appointment({ pageSlug: "missing" })));
  await assertFails(addDoc(collection(client, "appointments"), appointment({ endAt: START })));
});

for (const profile of ["public", "customerA", "ownerA", "officialSuperAdmin"]) {
  test(`bookingLocks não é acessível pelo Client SDK: ${profile}`, async () => {
    const client = db(profile);
    const existing = doc(client, "bookingLocks/salao-a_4076035200000");
    await assertFails(getDoc(existing));
    await assertFails(getDocs(collection(client, "bookingLocks")));
    await assertFails(setDoc(doc(client, "bookingLocks/new-lock"), {
      pageSlug: "salao-a", slotStart: START, appointmentId: "new", createdAt: CREATED,
    }));
    await assertFails(updateDoc(existing, { appointmentId: "other" }));
    await assertFails(deleteDoc(existing));
  });
}

test("cliente obtém appointment próprio e não de terceiro", async () => {
  const client = db("customerA");
  await assertSucceeds(getDoc(doc(client, "appointments/a-pending")));
  await assertFails(getDoc(doc(client, "appointments/b-pending")));
});

test("query real do cliente por pageSlug e customerId é permitida", async () => {
  const q = query(
    collection(db("customerA"), "appointments"),
    where("pageSlug", "==", "salao-a"),
    where("customerId", "==", "customer-a"),
  );
  const snapshot = await assertSucceeds(getDocs(q));
  assert.equal(snapshot.size, 4);
});

test("cliente não executa query ampla de appointments", async () => {
  await assertFails(getDocs(collection(db("customerA"), "appointments")));
});

test("owner obtém appointment próprio e não de outro tenant", async () => {
  const owner = db("ownerA");
  await assertSucceeds(getDoc(doc(owner, "appointments/a-pending")));
  await assertFails(getDoc(doc(owner, "appointments/b-pending")));
});

test("query real do owner por pageSlug e período é permitida", async () => {
  const q = query(
    collection(db("ownerA"), "appointments"),
    where("pageSlug", "==", "salao-a"),
    where("startAt", ">=", START),
    where("startAt", "<=", END),
  );
  const snapshot = await assertSucceeds(getDocs(q));
  assert.equal(snapshot.size, 4);
});

test("query real da agenda do owner somente por pageSlug é permitida", async () => {
  const q = query(
    collection(db("ownerA"), "appointments"),
    where("pageSlug", "==", "salao-a"),
  );
  assert.equal((await assertSucceeds(getDocs(q))).size, 4);
});

test("owner não lista appointments de tenant B nem sem filtro", async () => {
  const owner = db("ownerA");
  await assertFails(getDocs(query(collection(owner, "appointments"), where("pageSlug", "==", "salao-b"))));
  await assertFails(getDocs(collection(owner, "appointments")));
});

test("público não lê appointments nem consulta disponibilidade", async () => {
  const publicDb = db("public");
  await assertFails(getDoc(doc(publicDb, "appointments/a-pending")));
  await assertFails(getDocs(query(
    collection(publicDb, "appointments"),
    where("pageSlug", "==", "salao-a"),
    where("startAt", ">=", START),
    where("startAt", "<=", END),
  )));
});

for (const [id, profile] of [["a-pending", "customerA"], ["a-confirmed", "customerA"]]) {
  test(`cliente cancela appointment ${id}`, async () => {
    await assertSucceeds(updateDoc(doc(db(profile), `appointments/${id}`), { status: "cancelled" }));
  });
}

test("cliente não confirma, completa ou altera horário", async () => {
  const client = db("customerA");
  await assertFails(updateDoc(doc(client, "appointments/a-pending"), { status: "confirmed" }));
  await assertFails(updateDoc(doc(client, "appointments/a-confirmed"), { status: "completed" }));
  await assertFails(updateDoc(doc(client, "appointments/a-pending"), { startAt: END }));
});

for (const [id, status] of [
  ["a-pending", "confirmed"], ["a-pending", "cancelled"],
  ["a-confirmed", "completed"], ["a-confirmed", "cancelled"],
]) {
  test(`owner realiza transição permitida ${id} → ${status}`, async () => {
    await assertSucceeds(updateDoc(doc(db("ownerA"), `appointments/${id}`), { status }));
  });
}

for (const [id, status] of [
  ["a-completed", "cancelled"], ["a-cancelled", "pending"],
  ["a-cancelled", "confirmed"], ["a-completed", "confirmed"],
]) {
  test(`owner não realiza transição proibida ${id} → ${status}`, async () => {
    await assertFails(updateDoc(doc(db("ownerA"), `appointments/${id}`), { status }));
  });
}

test("appointment delete é negado a cliente/owner e permitido ao superadmin", async () => {
  await assertFails(deleteDoc(doc(db("customerA"), "appointments/a-pending")));
  await assertFails(deleteDoc(doc(db("ownerA"), "appointments/a-pending")));
  await assertSucceeds(deleteDoc(doc(db("officialSuperAdmin"), "appointments/a-pending")));
});

test("cliente não possui qualquer acesso a transactions", async () => {
  const client = db("customerA");
  await assertFails(getDoc(doc(client, "transactions/transaction-a")));
  await assertFails(getDocs(collection(client, "transactions")));
  await assertFails(addDoc(collection(client, "transactions"), transaction()));
  await assertFails(updateDoc(doc(client, "transactions/transaction-a"), { value: 60 }));
  await assertFails(deleteDoc(doc(client, "transactions/transaction-a")));
});

test("owner cria transaction no próprio tenant e não no tenant B", async () => {
  const owner = db("ownerA");
  await assertSucceeds(addDoc(collection(owner, "transactions"), transaction()));
  await assertFails(addDoc(collection(owner, "transactions"), transaction({ pageSlug: "salao-b" })));
});

test("transaction rejeita valor não positivo, type inválido e campos extras", async () => {
  const owner = db("ownerA");
  await assertFails(addDoc(collection(owner, "transactions"), transaction({ value: 0 })));
  await assertFails(addDoc(collection(owner, "transactions"), transaction({ value: -1 })));
  await assertFails(addDoc(collection(owner, "transactions"), transaction({ type: "transfer" })));
  await assertFails(addDoc(collection(owner, "transactions"), transaction({ admin: true })));
});

test("query real de transactions por pageSlug e date é permitida ao owner", async () => {
  const q = query(
    collection(db("ownerA"), "transactions"),
    where("pageSlug", "==", "salao-a"),
    where("date", ">=", START),
    where("date", "<=", END),
  );
  assert.equal((await assertSucceeds(getDocs(q))).size, 1);
});

test("owner não lista transactions de B nem globalmente", async () => {
  const owner = db("ownerA");
  await assertFails(getDocs(query(collection(owner, "transactions"), where("pageSlug", "==", "salao-b"))));
  await assertFails(getDocs(collection(owner, "transactions")));
});

test("transaction update preserva pageSlug e createdAt", async () => {
  const ref = doc(db("ownerA"), "transactions/transaction-a");
  await assertSucceeds(updateDoc(ref, { value: 60, description: "Atualizada" }));
  await assertFails(updateDoc(ref, { pageSlug: "salao-b" }));
  await assertFails(updateDoc(ref, { createdAt: END }));
});

test("owner exclui transaction própria, mas não de B", async () => {
  const owner = db("ownerA");
  await assertSucceeds(deleteDoc(doc(owner, "transactions/transaction-a")));
  await assertFails(deleteDoc(doc(owner, "transactions/transaction-b")));
});

test("cliente obtém loyalty próprio por ID coerente", async () => {
  await assertSucceeds(getDoc(doc(db("customerA"), "loyalty/salao-a_customer-a")));
});

test("cliente não obtém loyalty de terceiro nem lista", async () => {
  const client = db("customerA");
  await assertFails(getDoc(doc(client, "loyalty/salao-b_customer-b")));
  await assertFails(getDocs(collection(client, "loyalty")));
});

test("cliente não cria, atualiza ou exclui loyalty", async () => {
  const client = db("customerA");
  await assertFails(setDoc(doc(client, "loyalty/salao-a_new"), loyalty({ customerId: "new" })));
  await assertFails(updateDoc(doc(client, "loyalty/salao-a_customer-a"), { points: 3 }));
  await assertFails(deleteDoc(doc(client, "loyalty/salao-a_customer-a")));
});

test("owner obtém e lista loyalty do próprio tenant", async () => {
  const owner = db("ownerA");
  await assertSucceeds(getDoc(doc(owner, "loyalty/salao-a_customer-a")));
  const q = query(collection(owner, "loyalty"), where("pageSlug", "==", "salao-a"));
  assert.equal((await assertSucceeds(getDocs(q))).size, 1);
});

test("owner não obtém/lista loyalty do tenant B", async () => {
  const owner = db("ownerA");
  await assertFails(getDoc(doc(owner, "loyalty/salao-b_customer-b")));
  await assertFails(getDocs(query(collection(owner, "loyalty"), where("pageSlug", "==", "salao-b"))));
});

test("owner cria e atualiza loyalty coerente no próprio tenant", async () => {
  const owner = db("ownerA");
  const ref = doc(owner, "loyalty/salao-a_customer-b");
  await assertSucceeds(setDoc(ref, loyalty({ customerId: "customer-b", points: 0, totalRewards: 0 })));
  await assertSucceeds(updateDoc(ref, { points: 1, totalRewards: 1, lastUpdated: END }));
});

test("loyalty rejeita tenant B, ID incoerente e campos extras", async () => {
  const owner = db("ownerA");
  await assertFails(setDoc(doc(owner, "loyalty/salao-b_customer-a"), loyalty({ pageSlug: "salao-b" })));
  await assertFails(setDoc(doc(owner, "loyalty/id-incoerente"), loyalty()));
  await assertFails(setDoc(doc(owner, "loyalty/salao-a_customer-b"), loyalty({
    customerId: "customer-b", admin: true,
  })));
});

for (const [field, value] of [
  ["points", -1], ["points", 1.5], ["totalRewards", -1], ["totalRewards", 1.5],
]) {
  test(`loyalty rejeita ${field} inválido: ${value}`, async () => {
    await assertFails(setDoc(doc(db("ownerA"), "loyalty/salao-a_customer-b"), loyalty({
      customerId: "customer-b", [field]: value,
    })));
  });
}

test("owner não exclui loyalty; superadmin exclui", async () => {
  await assertFails(deleteDoc(doc(db("ownerA"), "loyalty/salao-a_customer-a")));
  await assertSucceeds(deleteDoc(doc(db("officialSuperAdmin"), "loyalty/salao-a_customer-a")));
});

for (const name of ["services", "barbershops"]) {
  test(`${name}: usuário comum não possui nenhuma operação`, async () => {
    const client = db("ownerA");
    const existingId = name === "services" ? "legacy-service" : "legacy-shop";
    await assertFails(getDoc(doc(client, `${name}/${existingId}`)));
    await assertFails(getDocs(collection(client, name)));
    await assertFails(setDoc(doc(client, `${name}/new`), { name: "New" }));
    await assertFails(updateDoc(doc(client, `${name}/${existingId}`), { name: "Changed" }));
    await assertFails(deleteDoc(doc(client, `${name}/${existingId}`)));
  });

  test(`${name}: superadmin possui acesso global`, async () => {
    const admin = db("officialSuperAdmin");
    const existingId = name === "services" ? "legacy-service" : "legacy-shop";
    await assertSucceeds(getDoc(doc(admin, `${name}/${existingId}`)));
    await assertSucceeds(getDocs(collection(admin, name)));
    await assertSucceeds(setDoc(doc(admin, `${name}/new`), { name: "New" }));
    await assertSucceeds(updateDoc(doc(admin, `${name}/${existingId}`), { name: "Changed" }));
    await assertSucceeds(deleteDoc(doc(admin, `${name}/${existingId}`)));
  });
}
