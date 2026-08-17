import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProfileSchedule,
  readLunchInterval,
} from "../src/lib/adminProfileSchedule.ts";

const draft = (overrides: Record<string, unknown> = {}) => ({
  open: "09:00",
  close: "18:00",
  workingDays: [1, 2, 3, 4, 5],
  lunchEnabled: false,
  lunchStart: "",
  lunchEnd: "",
  ...overrides,
});

test("schedule existente sem almoço carrega toggle desativado", () => {
  assert.deepEqual(readLunchInterval({ open: "09:00", close: "18:00", workingDays: [1] }), {
    enabled: false,
    lunchStart: "",
    lunchEnd: "",
  });
});

test("schedule existente com almoço carrega toggle e horários", () => {
  assert.deepEqual(readLunchInterval({
    open: "09:00",
    close: "18:00",
    workingDays: [1],
    lunchStart: "12:00",
    lunchEnd: "13:00",
  }), { enabled: true, lunchStart: "12:00", lunchEnd: "13:00" });
});

test("ativar intervalo inclui lunchStart e lunchEnd no payload", () => {
  const result = buildProfileSchedule(draft({
    lunchEnabled: true,
    lunchStart: "12:00",
    lunchEnd: "13:00",
  }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.schedule.lunchStart, "12:00");
    assert.equal(result.schedule.lunchEnd, "13:00");
  }
});

test("desativar intervalo existente remove os dois campos do payload", () => {
  const result = buildProfileSchedule(draft({
    lunchEnabled: false,
    lunchStart: "12:00",
    lunchEnd: "13:00",
  }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(Object.hasOwn(result.schedule, "lunchStart"), false);
    assert.equal(Object.hasOwn(result.schedule, "lunchEnd"), false);
  }
});

test("intervalo ativo incompleto não salva", () => {
  const result = buildProfileSchedule(draft({ lunchEnabled: true, lunchStart: "12:00" }));
  assert.deepEqual(result, { ok: false, message: "Preencha o início e o fim do intervalo." });
});

for (const [lunchStart, lunchEnd] of [["13:00", "13:00"], ["14:00", "13:00"]]) {
  test(`intervalo ${lunchStart}–${lunchEnd} não salva quando início não é anterior`, () => {
    const result = buildProfileSchedule(draft({ lunchEnabled: true, lunchStart, lunchEnd }));
    assert.equal(result.ok, false);
  });
}

for (const [lunchStart, lunchEnd] of [["08:00", "10:00"], ["17:00", "19:00"]]) {
  test(`intervalo ${lunchStart}–${lunchEnd} fora do expediente não salva`, () => {
    const result = buildProfileSchedule(draft({ lunchEnabled: true, lunchStart, lunchEnd }));
    assert.equal(result.ok, false);
  });
}

test("fluxo normal sem almoço preserva open, close e workingDays", () => {
  const result = buildProfileSchedule(draft());
  assert.deepEqual(result, {
    ok: true,
    schedule: { open: "09:00", close: "18:00", workingDays: [1, 2, 3, 4, 5] },
  });
});

test("fluxo normal com almoço produz schedule completo", () => {
  const result = buildProfileSchedule(draft({
    lunchEnabled: true,
    lunchStart: "12:00",
    lunchEnd: "13:00",
  }));
  assert.deepEqual(result, {
    ok: true,
    schedule: {
      open: "09:00",
      close: "18:00",
      workingDays: [1, 2, 3, 4, 5],
      lunchStart: "12:00",
      lunchEnd: "13:00",
    },
  });
});
