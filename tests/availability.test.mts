import assert from "node:assert/strict";
import test from "node:test";

import { generateAvailableSlots } from "../src/lib/availability.ts";

const date = new Date("2099-01-05T00:00:00");

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
    [{ startAt: "2099-01-05T09:30:00", endAt: "2099-01-05T10:00:00" }],
    { open: "09:00", close: "10:30" },
  );
  assert.deepEqual(slots, ["09:00", "10:00"]);
});

test("qualquer sobreposição bloqueia o slot inteiro", () => {
  const slots = generateAvailableSlots(
    date,
    30,
    [{ startAt: "2099-01-05T09:15:00", endAt: "2099-01-05T09:45:00" }],
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
    new Date("2000-01-05T00:00:00"),
    30,
    [],
    { open: "09:00", close: "10:00" },
  );
  assert.deepEqual(slots, []);
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
