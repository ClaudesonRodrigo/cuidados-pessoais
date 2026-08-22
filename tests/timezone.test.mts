import assert from "node:assert/strict";
import test from "node:test";

import { BookingError, validateBookingTime } from "../src/lib/bookingService.ts";
import { generateAvailableSlots } from "../src/lib/availability.ts";
import {
  bookingStartAtIso,
  formatBusinessDateTime,
  getZonedDateTimeParts,
  LEGACY_BUSINESS_TIME_ZONE,
  localAvailabilityRangeIso,
  localDateTimeToUtc,
  localDateUtcRange,
  NonexistentLocalDateTimeError,
  resolveBusinessTimeZone,
} from "../src/lib/timezone.ts";

const BAHIA = "America/Bahia";
const DATE = "2026-08-22";
const NOW = new Date("2026-08-21T12:00:00.000Z");

const page = (overrides: Record<string, unknown> = {}) => ({
  timezone: BAHIA,
  schedule: { open: "09:00", close: "19:00", workingDays: [6] },
  ...overrides,
});

const validate = (
  time: string,
  durationMinutes: number,
  pageValue = page(),
): void => {
  const startAt = localDateTimeToUtc(DATE, time, BAHIA);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  validateBookingTime(pageValue, startAt, endAt, NOW);
};

test("fallback legado é America/Bahia", () => {
  assert.equal(resolveBusinessTimeZone(undefined), LEGACY_BUSINESS_TIME_ZONE);
  assert.equal(resolveBusinessTimeZone("timezone/inválido"), LEGACY_BUSINESS_TIME_ZONE);
});

test("16:00 Bahia vira 19:00Z e volta como 16:00 comercial", () => {
  const instant = localDateTimeToUtc(DATE, "16:00", BAHIA);
  assert.equal(instant.toISOString(), "2026-08-22T19:00:00.000Z");
  assert.deepEqual(
    (({ date, time, weekday }) => ({ date, time, weekday }))(
      getZonedDateTimeParts(instant, BAHIA),
    ),
    { date: DATE, time: "16:00", weekday: 6 },
  );
});

test("apresentação de confirmação e histórico usa o timezone do tenant", () => {
  const displayed = formatBusinessDateTime(
    new Date("2026-08-22T19:00:00.000Z"),
    BAHIA,
  );
  assert.deepEqual(displayed, { date: "22/08/2026", time: "16:00" });
});

test("página usa o formatter canônico na confirmação e no histórico", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");
  assert.equal(source.includes("confirmedStart.toLocaleDateString"), false);
  assert.equal(source.includes("start.toLocaleDateString"), false);
  assert.equal(source.includes("start.toLocaleTimeString"), false);
  assert.equal(source.includes("confirmedStart.date"), true);
  assert.equal(source.includes("displayedStart.date"), true);
  assert.equal(source.includes("displayedStart.time"), true);
});

test("funções puras do frontend produzem booking e janela UTC", () => {
  assert.equal(
    bookingStartAtIso(DATE, "16:00", BAHIA),
    "2026-08-22T19:00:00.000Z",
  );
  assert.deepEqual(
    localAvailabilityRangeIso(DATE, BAHIA),
    {
      startAt: "2026-08-22T03:00:00.000Z",
      endAt: "2026-08-23T02:59:59.999Z",
    },
  );
});

test("spring-forward rejeita somente horários civis inexistentes", () => {
  for (const time of ["02:00", "02:30"]) {
    assert.throws(
      () => localDateTimeToUtc("2026-03-08", time, "America/New_York"),
      NonexistentLocalDateTimeError,
    );
  }
  assert.equal(
    localDateTimeToUtc("2026-03-08", "03:00", "America/New_York").toISOString(),
    "2026-03-08T07:00:00.000Z",
  );
});

test("fall-back escolhe deterministicamente a primeira ocorrência UTC", () => {
  const instant = localDateTimeToUtc("2026-11-01", "01:30", "America/New_York");
  assert.equal(instant.toISOString(), "2026-11-01T05:30:00.000Z");
  const local = getZonedDateTimeParts(instant, "America/New_York");
  assert.equal(local.date, "2026-11-01");
  assert.equal(local.time, "01:30");
  assert.equal(local.weekday, 0);
  assert.doesNotThrow(() => validateBookingTime(
    {
      timezone: "America/New_York",
      schedule: { open: "01:00", close: "03:00", workingDays: [0] },
    },
    instant,
    new Date(instant.getTime() + 30 * 60_000),
    new Date("2026-10-31T12:00:00.000Z"),
  ));
  assert.throws(
    () => validateBookingTime(
      {
        timezone: "America/New_York",
        schedule: { open: "01:00", close: "03:00", workingDays: [6] },
      },
      instant,
      new Date(instant.getTime() + 30 * 60_000),
      new Date("2026-10-31T12:00:00.000Z"),
    ),
    (error) => error instanceof BookingError && error.status === 409,
  );
});

test("dias civis IANA produzem ranges de 23h, 24h e 25h", () => {
  const duration = (date: string, timeZone: string) => {
    const range = localDateUtcRange(date, timeZone);
    return range.endAt.getTime() + 1 - range.startAt.getTime();
  };
  assert.equal(duration("2026-08-22", BAHIA), 24 * 60 * 60 * 1_000);
  assert.equal(duration("2026-03-08", "America/New_York"), 23 * 60 * 60 * 1_000);
  assert.equal(duration("2026-11-01", "America/New_York"), 25 * 60 * 60 * 1_000);
});

test("23:30 Bahia permanece no sábado embora UTC já seja domingo", () => {
  const instant = localDateTimeToUtc(DATE, "23:30", BAHIA);
  assert.equal(instant.toISOString(), "2026-08-23T02:30:00.000Z");
  const local = getZonedDateTimeParts(instant, BAHIA);
  assert.equal(local.date, DATE);
  assert.equal(local.time, "23:30");
  assert.equal(local.weekday, 6);
  validateBookingTime(
    {
      timezone: BAHIA,
      schedule: { open: "23:00", close: "23:59", workingDays: [6] },
    },
    instant,
    new Date(instant.getTime() + 15 * 60_000),
    NOW,
  );
});

test("workingDays usa o dia local do estabelecimento", () => {
  const startAt = localDateTimeToUtc(DATE, "23:30", BAHIA);
  const endAt = new Date(startAt.getTime() + 15 * 60_000);
  assert.throws(
    () => validateBookingTime(
      {
        timezone: BAHIA,
        schedule: { open: "23:00", close: "23:59", workingDays: [0] },
      },
      startAt,
      endAt,
      NOW,
    ),
    (error) => error instanceof BookingError && error.status === 409,
  );
});

test("09:00 a 18:30 são válidos em grade de 30 minutos com close 19:00", () => {
  for (const time of ["09:00", "12:00", "13:00", "14:00", "15:00", "16:00", "18:30"]) {
    assert.doesNotThrow(() => validate(time, 30), time);
  }
});

test("serviço de 60 minutos respeita fechamento exato e após fechamento", () => {
  assert.doesNotThrow(() => validate("18:00", 60));
  assert.throws(
    () => validate("18:30", 60),
    (error) => error instanceof BookingError && error.status === 409,
  );
  assert.throws(
    () => validate("19:00", 30),
    (error) => error instanceof BookingError && error.status === 409,
  );
});

test("lunch é comparado em horário comercial local", () => {
  const lunchPage = page({
    schedule: {
      open: "09:00",
      close: "19:00",
      lunchStart: "12:00",
      lunchEnd: "13:00",
      workingDays: [6],
    },
  });
  assert.throws(
    () => validate("12:00", 30, lunchPage),
    (error) => error instanceof BookingError && error.status === 409,
  );
  assert.doesNotThrow(() => validate("13:00", 30, lunchPage));
});

test("spring-forward Availability e Booking concordam com duração real", () => {
  const schedule = { open: "01:00", close: "03:00", workingDays: [0] };
  const now = new Date("2026-03-07T12:00:00.000Z");
  const slots60 = generateAvailableSlots(
    "2026-03-08",
    60,
    [],
    schedule,
    "America/New_York",
    now,
  );
  assert.deepEqual(slots60, ["01:00"]);

  const acceptedStart = localDateTimeToUtc("2026-03-08", "01:00", "America/New_York");
  assert.doesNotThrow(() => validateBookingTime(
    { timezone: "America/New_York", schedule },
    acceptedStart,
    new Date(acceptedStart.getTime() + 60 * 60_000),
    now,
  ));

  const rejectedStart = localDateTimeToUtc("2026-03-08", "01:30", "America/New_York");
  assert.equal(slots60.includes("01:30"), false);
  assert.throws(
    () => validateBookingTime(
      { timezone: "America/New_York", schedule },
      rejectedStart,
      new Date(rejectedStart.getTime() + 60 * 60_000),
      now,
    ),
    (error) => error instanceof BookingError && error.status === 409,
  );
});

test("todo slot oferecido passa a regra estática do Booking", () => {
  const cases = [
    {
      label: "America/Bahia normal",
      date: "2026-08-22",
      timeZone: "America/Bahia",
      durationMinutes: 30,
      schedule: { open: "09:00", close: "19:00", workingDays: [6] },
      now: new Date("2026-08-21T12:00:00.000Z"),
    },
    {
      label: "New York spring-forward",
      date: "2026-03-08",
      timeZone: "America/New_York",
      durationMinutes: 60,
      schedule: { open: "01:00", close: "03:00", workingDays: [0] },
      now: new Date("2026-03-07T12:00:00.000Z"),
    },
    {
      label: "New York fall-back",
      date: "2026-11-01",
      timeZone: "America/New_York",
      durationMinutes: 30,
      schedule: { open: "00:00", close: "03:00", workingDays: [0] },
      now: new Date("2026-10-31T12:00:00.000Z"),
    },
  ];

  for (const item of cases) {
    const slots = generateAvailableSlots(
      item.date,
      item.durationMinutes,
      [],
      item.schedule,
      item.timeZone,
      item.now,
    );
    assert.ok(slots.length > 0, item.label);
    for (const slot of slots) {
      const startAt = localDateTimeToUtc(item.date, slot, item.timeZone);
      const endAt = new Date(startAt.getTime() + item.durationMinutes * 60_000);
      assert.doesNotThrow(
        () => validateBookingTime(
          { timezone: item.timeZone, schedule: item.schedule },
          startAt,
          endAt,
          item.now,
        ),
        item.label + " " + slot,
      );
    }
  }
});

test("Availability e Booking concordam nas fronteiras do lunch durante fall-back", () => {
  const date = "2026-11-01";
  const timeZone = "America/New_York";
  const now = new Date("2026-10-31T12:00:00.000Z");
  const schedule = {
    open: "00:00",
    close: "03:00",
    lunchStart: "01:00",
    lunchEnd: "02:00",
    workingDays: [0],
  };
  const slots = generateAvailableSlots(date, 30, [], schedule, timeZone, now);

  assert.deepEqual(slots, ["00:00", "00:30", "02:00", "02:30"]);

  for (const slot of ["01:00", "01:30"]) {
    const startAt = localDateTimeToUtc(date, slot, timeZone);
    const endAt = new Date(startAt.getTime() + 30 * 60_000);
    assert.equal(slots.includes(slot), false);
    assert.throws(
      () => validateBookingTime(
        { timezone: timeZone, schedule },
        startAt,
        endAt,
        now,
      ),
      (error) => error instanceof BookingError && error.status === 409,
    );
  }

  for (const slot of ["00:30", "02:00"]) {
    const startAt = localDateTimeToUtc(date, slot, timeZone);
    const endAt = new Date(startAt.getTime() + 30 * 60_000);
    assert.equal(slots.includes(slot), true);
    assert.doesNotThrow(() => validateBookingTime(
      { timezone: timeZone, schedule },
      startAt,
      endAt,
      now,
    ));
  }
});

test("intervalo absoluto do dia local começa e termina em UTC correto", () => {
  const range = localDateUtcRange(DATE, BAHIA);
  assert.equal(range.startAt.toISOString(), "2026-08-22T03:00:00.000Z");
  assert.equal(range.endAt.toISOString(), "2026-08-23T02:59:59.999Z");
});
