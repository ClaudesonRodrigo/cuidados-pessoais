export const LEGACY_BUSINESS_TIME_ZONE = "America/Bahia";

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ZonedDateTimeParts = {
  date: string;
  time: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

export class NonexistentLocalDateTimeError extends RangeError {
  constructor() {
    super("Data e horário inexistentes no timezone informado.");
    this.name = "NonexistentLocalDateTimeError";
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
};

const isSupportedTimeZone = (value: string): boolean => {
  try {
    formatterFor(value).format(new Date(0));
    return true;
  } catch {
    formatterCache.delete(value);
    return false;
  }
};

export const resolveBusinessTimeZone = (value: unknown): string =>
  typeof value === "string" && value.length > 0 && isSupportedTimeZone(value)
    ? value
    : LEGACY_BUSINESS_TIME_ZONE;

const parseLocalDate = (value: string): { year: number; month: number; day: number } => {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError("Data local inválida.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError("Data local inválida.");
  }
  return { year, month, day };
};

const parseLocalTime = (value: string): { hour: number; minute: number } => {
  const match = LOCAL_TIME_PATTERN.exec(value);
  if (!match) throw new RangeError("Horário local inválido.");
  return { hour: Number(match[1]), minute: Number(match[2]) };
};

const pad = (value: number): string => String(value).padStart(2, "0");

const localTimeForMinutes = (value: number): string =>
  pad(Math.floor(value / 60)) + ":" + pad(value % 60);

export const getZonedDateTimeParts = (
  instant: Date,
  timeZoneValue?: unknown,
): ZonedDateTimeParts => {
  if (Number.isNaN(instant.getTime())) throw new RangeError("Instante inválido.");
  const timeZone = resolveBusinessTimeZone(timeZoneValue);
  const values: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
};

export type CommercialScheduleRange = {
  localStart: ZonedDateTimeParts;
  localEnd: ZonedDateTimeParts;
  startMinutes: number;
  endMinutes: number;
  withinSchedule: boolean;
  overlapsLunch: boolean;
};

export const evaluateCommercialScheduleRange = ({
  startAt,
  endAt,
  timeZone,
  openMinutes,
  closeMinutes,
  lunchStartMinutes,
  lunchEndMinutes,
}: {
  startAt: Date;
  endAt: Date;
  timeZone: unknown;
  openMinutes: number;
  closeMinutes: number;
  lunchStartMinutes?: number | null;
  lunchEndMinutes?: number | null;
}): CommercialScheduleRange => {
  const localStart = getZonedDateTimeParts(startAt, timeZone);
  const localEnd = getZonedDateTimeParts(endAt, timeZone);
  const startMinutes = localStart.hour * 60 + localStart.minute;
  const endMinutes = localEnd.hour * 60 + localEnd.minute;
  const withinSchedule = (
    openMinutes < closeMinutes &&
    localStart.date === localEnd.date &&
    startMinutes >= openMinutes &&
    endMinutes <= closeMinutes
  );
  const hasLunch = (
    lunchStartMinutes !== undefined &&
    lunchStartMinutes !== null &&
    lunchEndMinutes !== undefined &&
    lunchEndMinutes !== null
  );
  const lunchStartAt = hasLunch
    ? localDateTimeToUtc(localStart.date, localTimeForMinutes(lunchStartMinutes), timeZone)
    : null;
  const lunchEndAt = hasLunch
    ? localDateTimeToUtc(localStart.date, localTimeForMinutes(lunchEndMinutes), timeZone)
    : null;
  const overlapsLunch = Boolean(
    lunchStartAt &&
    lunchEndAt &&
    startAt.getTime() < lunchEndAt.getTime() &&
    endAt.getTime() > lunchStartAt.getTime()
  );
  return {
    localStart,
    localEnd,
    startMinutes,
    endMinutes,
    withinSchedule,
    overlapsLunch,
  };
};

export const localDateTimeToUtc = (
  localDate: string,
  localTime: string,
  timeZoneValue?: unknown,
): Date => {
  const { year, month, day } = parseLocalDate(localDate);
  const { hour, minute } = parseLocalTime(localTime);
  const timeZone = resolveBusinessTimeZone(timeZoneValue);
  const expectedWallTime = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const possibleOffsets = new Set<number>();

  for (let deltaHours = -36; deltaHours <= 36; deltaHours += 6) {
    const sampledInstant = new Date(expectedWallTime + deltaHours * 60 * 60 * 1_000);
    const actual = getZonedDateTimeParts(sampledInstant, timeZone);
    const actualWallTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0,
    );
    possibleOffsets.add(actualWallTime - sampledInstant.getTime());
  }

  const candidates = [...possibleOffsets]
    .map((offset) => new Date(expectedWallTime - offset))
    .filter((candidate) => {
      const actual = getZonedDateTimeParts(candidate, timeZone);
      return (
        actual.year === year &&
        actual.month === month &&
        actual.day === day &&
        actual.hour === hour &&
        actual.minute === minute &&
        actual.second === 0
      );
    })
    .sort((left, right) => left.getTime() - right.getTime());

  if (candidates.length === 0) throw new NonexistentLocalDateTimeError();
  // Horário ambíguo: a primeira ocorrência cronológica é a escolha canônica.
  return candidates[0];
};

export const bookingStartAtIso = (
  localDate: string,
  localTime: string,
  timeZoneValue?: unknown,
): string => localDateTimeToUtc(localDate, localTime, timeZoneValue).toISOString();

export const addDaysToLocalDate = (localDate: string, amount: number): string => {
  if (!Number.isInteger(amount)) throw new RangeError("Quantidade de dias inválida.");
  const { year, month, day } = parseLocalDate(localDate);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
};

export const weekdayForLocalDate = (localDate: string): number => {
  const { year, month, day } = parseLocalDate(localDate);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

export const localDateUtcRange = (
  localDate: string,
  timeZoneValue?: unknown,
): { startAt: Date; endAt: Date } => {
  const timeZone = resolveBusinessTimeZone(timeZoneValue);
  const startAt = localDateTimeToUtc(localDate, "00:00", timeZone);
  const nextDayStart = localDateTimeToUtc(addDaysToLocalDate(localDate, 1), "00:00", timeZone);
  return { startAt, endAt: new Date(nextDayStart.getTime() - 1) };
};

export const localAvailabilityRangeIso = (
  localDate: string,
  timeZoneValue?: unknown,
): { startAt: string; endAt: string } => {
  const range = localDateUtcRange(localDate, timeZoneValue);
  return { startAt: range.startAt.toISOString(), endAt: range.endAt.toISOString() };
};

export const formatLocalDate = (localDate: string, locale = "pt-BR"): string => {
  const { year, month, day } = parseLocalDate(localDate);
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
};

export const formatBusinessDateTime = (
  instant: Date,
  timeZoneValue?: unknown,
  locale = "pt-BR",
): { date: string; time: string } => {
  const local = getZonedDateTimeParts(instant, timeZoneValue);
  return { date: formatLocalDate(local.date, locale), time: local.time };
};
