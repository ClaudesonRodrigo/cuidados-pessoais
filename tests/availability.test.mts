import assert from "node:assert/strict";
import test from "node:test";

import { generateAvailableSlots } from "../src/lib/availability.ts";

const date = "2099-01-05";

test("serviço único preserva duração e horário livre", () => {
  const slots = generateAvailableSlots(date, 30, [], { open: "09:00", close: "10:00" });
  assert.deepEqual(slots, ["09:00", "09:30"]);
});

test("múltiplos serviços preservam duração agregada", () => {
  const slots = generateAvailableSlots(date, 60, [], { open: "09:00", close: "10:00" });
  assert.deepEqual(slots, ["09:00"]);
});

test("duração variável respeita o fechamento", () => {
  const slots = generateAvailableSlots(date, 45, [], { open: "09:00", close: "10:00" });
  assert.deepEqual(slots, ["09:00"]);
});

test("almoço continua bloqueando colisões", () => {
  const slots = generateAvailableSlots(date, 30, [], {
    open: "09:00",
    close: "12:00",
    lunchStart: "10:00",
    lunchEnd: "11:00",
  });
  assert.deepEqual(slots, ["09:00", "09:30", "11:00", "11:30"]);
});

test("intervalo ocupado não aparece e horário livre aparece", () => {
  const slots = generateAvailableSlots(
    date,
    30,
    [{ startAt: "2099-01-05T12:30:00.000Z", endAt: "2099-01-05T13:00:00.000Z" }],
    { open: "09:00", close: "10:30" },
  );
  assert.deepEqual(slots, ["09:00", "10:00"]);
});

test("qualquer sobreposição bloqueia o slot inteiro", () => {
  const slots = generateAvailableSlots(
    date,
    30,
    [{ startAt: "2099-01-05T12:15:00.000Z", endAt: "2099-01-05T12:45:00.000Z" }],
    { open: "09:00", close: "10:30" },
  );
  assert.deepEqual(slots, ["10:00"]);
});

test("dia fechado continua sem horários", () => {
  const slots = generateAvailableSlots(date, 30, [], {
    open: "09:00",
    close: "18:00",
    workingDays: [],
  });
  assert.deepEqual(slots, []);
});

test("horários passados continuam indisponíveis", () => {
  const slots = generateAvailableSlots(
    "2000-01-05",
    30,
    [],
    { open: "09:00", close: "10:00" },
  );
  assert.deepEqual(slots, []);
});

test("tarde completa permanece disponível em America/Bahia sob runtime UTC", () => {
  const slots = generateAvailableSlots(
    "2026-08-22",
    30,
    [],
    { open: "09:00", close: "19:00", workingDays: [6] },
    "America/Bahia",
    new Date("2026-08-21T12:00:00.000Z"),
  );
  for (const expected of ["09:00", "12:00", "13:00", "14:00", "15:00", "16:00", "18:30"]) {
    assert.equal(slots.includes(expected), true, expected);
  }
});

test("expediente 13:00 a 18:00 preserva slots comerciais locais", () => {
  const slots = generateAvailableSlots(
    "2026-08-22",
    30,
    [],
    { open: "13:00", close: "18:00", workingDays: [6] },
    "America/Bahia",
    new Date("2026-08-21T12:00:00.000Z"),
  );
  assert.deepEqual(slots.slice(0, 4), ["13:00", "13:30", "14:00", "14:30"]);
  assert.equal(slots.at(-1), "17:30");
});

test("60 minutos respeita fechamento exato", () => {
  const slots = generateAvailableSlots(
    "2026-08-22",
    60,
    [],
    { open: "09:00", close: "19:00", workingDays: [6] },
    "America/Bahia",
    new Date("2026-08-21T12:00:00.000Z"),
  );
  assert.equal(slots.includes("18:00"), true);
  assert.equal(slots.includes("18:30"), false);
});

test("spring-forward ignora slots inexistentes e continua o dia", () => {
  const slots = generateAvailableSlots(
    "2026-03-08",
    30,
    [],
    { open: "01:00", close: "04:00", workingDays: [0] },
    "America/New_York",
    new Date("2026-03-07T12:00:00.000Z"),
  );
  assert.deepEqual(slots, ["01:00", "01:30", "03:00", "03:30"]);
});

test("spring-forward 60min rejeita 01:30 quando término real é 03:30", () => {
  const slots = generateAvailableSlots(
    "2026-03-08",
    60,
    [],
    { open: "01:00", close: "03:00", workingDays: [0] },
    "America/New_York",
    new Date("2026-03-07T12:00:00.000Z"),
  );
  assert.deepEqual(slots, ["01:00"]);
  assert.equal(slots.includes("01:30"), false);
});

test("spring-forward 30min oferece somente 01:00 e 01:30 antes do close", () => {
  const slots = generateAvailableSlots(
    "2026-03-08",
    30,
    [],
    { open: "01:00", close: "03:00", workingDays: [0] },
    "America/New_York",
    new Date("2026-03-07T12:00:00.000Z"),
  );
  assert.deepEqual(slots, ["01:00", "01:30"]);
});
test("fall-back gera uma única opção visual por HH:mm", () => {
  const slots = generateAvailableSlots(
    "2026-11-01",
    30,
    [],
    { open: "00:00", close: "03:00", workingDays: [0] },
    "America/New_York",
    new Date("2026-10-31T12:00:00.000Z"),
  );
  assert.deepEqual(slots, ["00:00", "00:30", "01:00", "01:30", "02:00", "02:30"]);
  assert.equal(new Set(slots).size, slots.length);
});

test("fall-back compara lunch por instantes canônicos", () => {
  const slots = generateAvailableSlots(
    "2026-11-01",
    30,
    [],
    {
      open: "00:00",
      close: "03:00",
      lunchStart: "01:00",
      lunchEnd: "02:00",
      workingDays: [0],
    },
    "America/New_York",
    new Date("2026-10-31T12:00:00.000Z"),
  );
  assert.deepEqual(slots, ["00:00", "00:30", "02:00", "02:30"]);
});

test("endpoint é somente leitura e não resolve dupla reserva", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = [
    await readFile("src/app/api/availability/route.ts", "utf8"),
    await readFile("src/lib/publicAvailability.ts", "utf8"),
  ].join("\n");
  assert.equal(source.includes(".get()"), true);
  assert.equal(source.includes(".add("), false);
  assert.equal(source.includes(".set("), false);
  assert.equal(source.includes("runTransaction"), false);
});
