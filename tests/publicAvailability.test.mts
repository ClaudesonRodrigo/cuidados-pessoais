import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createFirestoreAvailabilityStore,
  fetchPublicAvailability,
  handlePublicAvailabilityRequest,
  MAX_AVAILABILITY_RESULTS,
  PublicAvailabilityRequestError,
  type AvailabilityDocument,
  type AvailabilityFirestore,
  type AvailabilityStore,
} from "../src/lib/publicAvailability.ts";

const START = "2099-01-05T12:00:00.000Z";
const END = "2099-01-06T11:59:59.999Z";

const request = (body: unknown) =>
  new Request("http://localhost/api/availability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const input = (overrides: Record<string, unknown> = {}) => ({
  pageSlug: "tenant-a",
  startAt: START,
  endAt: END,
  ...overrides,
});

const document = (overrides: Record<string, unknown> = {}): AvailabilityDocument => ({
  status: "pending",
  startAt: "2099-01-05T13:00:00.000Z",
  endAt: "2099-01-05T13:30:00.000Z",
  ...overrides,
});

const store = (
  documents: AvailabilityDocument[] = [],
  options: { exists?: boolean; fail?: Error } = {},
): AvailabilityStore => ({
  async pageExists() {
    if (options.fail) throw options.fail;
    return options.exists ?? true;
  },
  async findAppointments() {
    if (options.fail) throw options.fail;
    return documents;
  },
});

const bodyOf = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

type FakeAppointment = AvailabilityDocument & { pageSlug: string };

const firestoreStore = (documents: FakeAppointment[]): AvailabilityStore =>
  createFirestoreAvailabilityStore(() => ({
    collection(path: string) {
      if (path === "pages") {
        return {
          doc() {
            return { async get() { return { exists: true }; } };
          },
        } as unknown as ReturnType<AvailabilityFirestore["collection"]>;
      }

      assert.equal(path, "appointments");
      let matches = [...documents];
      const query = {
        where(fieldPath: string, opStr: "==" | "<", value: unknown) {
          if (fieldPath === "pageSlug" && opStr === "==") {
            matches = matches.filter((item) => item.pageSlug === value);
          } else if (fieldPath === "startAt" && opStr === "<" && value instanceof Date) {
            matches = matches.filter(
              (item) => new Date(String(item.startAt)).getTime() < value.getTime(),
            );
          } else {
            assert.fail(`predicado inesperado: ${fieldPath} ${opStr}`);
          }
          return query;
        },
        select(...fieldPaths: string[]) {
          assert.deepEqual(fieldPaths, ["startAt", "endAt", "status"]);
          return query;
        },
        limit(value: number) {
          assert.equal(value, MAX_AVAILABILITY_RESULTS + 1);
          matches = matches.slice(0, value);
          return query;
        },
        async get() {
          return { docs: matches.map((item) => ({ data: () => item })) };
        },
      };
      return query as unknown as ReturnType<AvailabilityFirestore["collection"]>;
    },
  }));

const OVERLAP_START = "2099-02-01T10:00:00.000Z";
const OVERLAP_END = "2099-02-01T11:00:00.000Z";
const overlapInput = () => input({ startAt: OVERLAP_START, endAt: OVERLAP_END });
const overlapDocument = (
  startAt: string,
  endAt: string,
  overrides: Record<string, unknown> = {},
): FakeAppointment => ({ pageSlug: "tenant-a", status: "pending", startAt, endAt, ...overrides });

test("query real recupera appointment 09:30→10:30 para janela 10:00→11:00", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(overlapInput()),
    firestoreStore([
      overlapDocument("2099-02-01T09:30:00.000Z", "2099-02-01T10:30:00.000Z"),
    ]),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await bodyOf(response)).busyIntervals, [
    { startAt: "2099-02-01T09:30:00.000Z", endAt: "2099-02-01T10:30:00.000Z" },
  ]);
});

test("appointment anterior sem overlap não é retornado", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(overlapInput()),
    firestoreStore([
      overlapDocument("2099-02-01T08:00:00.000Z", "2099-02-01T09:00:00.000Z"),
    ]),
  );
  assert.deepEqual((await bodyOf(response)).busyIntervals, []);
});

test("appointment iniciado dentro da janela é retornado", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(overlapInput()),
    firestoreStore([
      overlapDocument("2099-02-01T10:30:00.000Z", "2099-02-01T11:30:00.000Z"),
    ]),
  );
  assert.equal(((await bodyOf(response)).busyIntervals as unknown[]).length, 1);
});

test("appointment que cobre toda a janela é retornado", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(overlapInput()),
    firestoreStore([
      overlapDocument("2099-02-01T09:00:00.000Z", "2099-02-01T12:00:00.000Z"),
    ]),
  );
  assert.equal(((await bodyOf(response)).busyIntervals as unknown[]).length, 1);
});

test("fronteiras exatas em 10:00 e 11:00 não sobrepõem", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(overlapInput()),
    firestoreStore([
      overlapDocument("2099-02-01T08:00:00.000Z", "2099-02-01T10:00:00.000Z"),
      overlapDocument("2099-02-01T11:00:00.000Z", "2099-02-01T12:00:00.000Z"),
    ]),
  );
  assert.deepEqual((await bodyOf(response)).busyIntervals, []);
});

test("cancelled atravessando o início não bloqueia", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(overlapInput()),
    firestoreStore([
      overlapDocument(
        "2099-02-01T09:30:00.000Z",
        "2099-02-01T10:30:00.000Z",
        { status: "cancelled" },
      ),
    ]),
  );
  assert.deepEqual((await bodyOf(response)).busyIntervals, []);
});

test("overlap anterior de tenant B nunca é retornado para tenant A", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(overlapInput()),
    firestoreStore([
      overlapDocument(
        "2099-02-01T09:30:00.000Z",
        "2099-02-01T10:30:00.000Z",
        { pageSlug: "tenant-b" },
      ),
    ]),
  );
  assert.deepEqual((await bodyOf(response)).busyIntervals, []);
});

test("endpoint público funciona sem autenticação e retorna somente intervalos", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(input()),
    store([
      document({
        appointmentId: "secret-id",
        pageSlug: "tenant-a",
        customerId: "customer-secret",
        customerName: "Nome secreto",
        customerPhone: "55999999999",
        customerEmail: "secret@example.com",
        customerPhoto: "https://example.com/secret.jpg",
        serviceId: "secret-service-id",
        serviceName: "Serviço secreto",
        status: "confirmed",
        totalValue: 999,
        notes: "nota secreta",
        createdAt: START,
      }),
    ]),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await bodyOf(response);
  assert.deepEqual(Object.keys(body), ["busyIntervals"]);
  assert.deepEqual(body.busyIntervals, [
    { startAt: "2099-01-05T13:00:00.000Z", endAt: "2099-01-05T13:30:00.000Z" },
  ]);
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    "appointmentId", "pageSlug", "customerId", "customerName", "customerPhone",
    "customerEmail", "customerPhoto", "serviceId", "serviceName", "status", "totalValue",
    "notes", "createdAt",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} não pode ser público`);
  }
});

test("tenant A não retorna documentos do tenant B", async () => {
  const allDocuments = [
    { ...document(), pageSlug: "tenant-a" },
    {
      ...document({ startAt: "2099-01-05T14:00:00.000Z", endAt: "2099-01-05T14:30:00.000Z" }),
      pageSlug: "tenant-b",
    },
  ];
  const tenantStore: AvailabilityStore = {
    async pageExists() { return true; },
    async findAppointments(query) {
      return allDocuments.filter((item) => item.pageSlug === query.pageSlug);
    },
  };

  const response = await handlePublicAvailabilityRequest(request(input()), tenantStore);
  const body = await bodyOf(response);
  assert.equal((body.busyIntervals as unknown[]).length, 1);
  assert.equal(JSON.stringify(body).includes("14:00:00"), false);
});

test("página inexistente retorna 404 sem simular agenda vazia", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(input({ pageSlug: "inexistente" })),
    store([], { exists: false }),
  );
  assert.equal(response.status, 404);
  assert.equal("busyIntervals" in await bodyOf(response), false);
});

for (const invalidSlug of ["../appointments", "tenant/a", "tenant_a", "", "A".repeat(121)]) {
  test(`rejeita pageSlug inválido: ${invalidSlug.slice(0, 20)}`, async () => {
    const response = await handlePublicAvailabilityRequest(
      request(input({ pageSlug: invalidSlug })),
      store(),
    );
    assert.equal(response.status, 400);
  });
}

test("rejeita campos extras que poderiam controlar a consulta", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(input({ collection: "users" })),
    store(),
  );
  assert.equal(response.status, 400);
});

for (const status of ["pending", "confirmed", "completed", "unknown", undefined]) {
  test(`status ${String(status)} bloqueia o intervalo`, async () => {
    const response = await handlePublicAvailabilityRequest(
      request(input()),
      store([document({ status })]),
    );
    const body = await bodyOf(response);
    assert.equal((body.busyIntervals as unknown[]).length, 1);
  });
}

test("cancelled não bloqueia o intervalo", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(input()),
    store([document({ status: "cancelled" })]),
  );
  assert.deepEqual((await bodyOf(response)).busyIntervals, []);
});

test("rejeita data inválida", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(input({ startAt: "amanhã" })),
    store(),
  );
  assert.equal(response.status, 400);
});

test("rejeita endAt igual ou anterior a startAt", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(input({ endAt: START })),
    store(),
  );
  assert.equal(response.status, 400);
});

test("rejeita período superior a 24 horas", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(input({ endAt: "2099-01-06T12:00:00.001Z" })),
    store(),
  );
  assert.equal(response.status, 400);
});

test("consulta sempre recebe limite finito", async () => {
  let receivedLimit = 0;
  const limitedStore: AvailabilityStore = {
    async pageExists() { return true; },
    async findAppointments(query) {
      receivedLimit = query.limit;
      return [];
    },
  };
  await handlePublicAvailabilityRequest(request(input()), limitedStore);
  assert.equal(receivedLimit, MAX_AVAILABILITY_RESULTS + 1);
});

test("resultado acima do limite falha fechado", async () => {
  const documents = Array.from({ length: MAX_AVAILABILITY_RESULTS + 1 }, () => document());
  const response = await handlePublicAvailabilityRequest(request(input()), store(documents));
  assert.equal(response.status, 503);
  assert.equal("busyIntervals" in await bodyOf(response), false);
});

test("documento malformado falha fechado", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(input()),
    store([document({ endAt: "inválido" })]),
  );
  assert.equal(response.status, 503);
  assert.equal("busyIntervals" in await bodyOf(response), false);
});

test("Admin SDK indisponível não vira lista vazia nem expõe detalhes", async () => {
  const response = await handlePublicAvailabilityRequest(
    request(input()),
    store([], { fail: new Error("PRIVATE_KEY=segredo stack interno") }),
  );
  const body = await bodyOf(response);
  const serialized = JSON.stringify(body);
  assert.equal(response.status, 503);
  assert.equal("busyIntervals" in body, false);
  assert.equal(serialized.includes("segredo"), false);
  assert.equal(serialized.includes("stack"), false);
  assert.equal(serialized.includes("PRIVATE_KEY"), false);
});

test("timeout não vira lista vazia", async () => {
  const timeoutStore: AvailabilityStore = {
    async pageExists() { return new Promise<boolean>(() => undefined); },
    async findAppointments() { return []; },
  };
  const response = await handlePublicAvailabilityRequest(request(input()), timeoutStore, 5);
  assert.equal(response.status, 504);
  assert.equal("busyIntervals" in await bodyOf(response), false);
});

test("lista vazia válida permanece sucesso", async () => {
  const response = await handlePublicAvailabilityRequest(request(input()), store());
  assert.equal(response.status, 200);
  assert.deepEqual((await bodyOf(response)).busyIntervals, []);
});

test("cliente rejeita resposta malformada em vez de liberar agenda", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ busyIntervals: [{ startAt: START }] });
  try {
    await assert.rejects(
      fetchPublicAvailability(input()),
      PublicAvailabilityRequestError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cliente preserva lista vazia somente em resposta válida", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ busyIntervals: [] });
  try {
    assert.deepEqual(await fetchPublicAvailability(input()), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("página pública não importa nem chama a consulta Firestore direta", async () => {
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");
  assert.equal(source.includes("getAppointmentsByDate"), false);
  assert.equal(source.includes("fetchPublicAvailability"), true);
  assert.equal(source.includes("generateAvailableSlots(startOfDay, totalDuration, busyIntervals"), true);
  assert.equal(source.includes("Agenda temporariamente indisponível"), true);
  assert.equal(source.includes("setAvailableSlots([])"), true);
  assert.equal(source.includes("setAvailabilityError(true)"), true);
  assert.equal(source.includes("createAppointment(newAppointment)"), true);
  assert.equal(source.includes("getAppointmentsByCustomer"), true);
});

test("rota usa a store Firestore exercitada pelos testes comportamentais", async () => {
  const routeSource = await readFile("src/app/api/availability/route.ts", "utf8");
  const storeSource = await readFile("src/lib/publicAvailability.ts", "utf8");
  assert.equal(routeSource.includes("createFirestoreAvailabilityStore"), true);
  assert.equal(routeSource.includes("getAdminFirestore"), true);
  assert.equal(storeSource.includes('.where("pageSlug", "==", pageSlug)'), true);
  assert.equal(storeSource.includes('.where("startAt", "<", endAt)'), true);
  assert.equal(storeSource.includes('.select("startAt", "endAt", "status")'), true);
});

test("Admin SDK usa somente variáveis server-side esperadas", async () => {
  const source = await readFile("src/lib/firebaseAdmin.ts", "utf8");
  assert.equal(source.includes("NEXT_PUBLIC_"), false);
  assert.equal(source.includes("FIREBASE_PROJECT_ID"), true);
  assert.equal(source.includes("FIREBASE_CLIENT_EMAIL"), true);
  assert.equal(source.includes("FIREBASE_PRIVATE_KEY"), true);
  assert.equal(source.includes("FIRESTORE_EMULATOR_HOST"), true);
});
