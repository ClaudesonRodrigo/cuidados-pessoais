import { createHash } from "node:crypto";

import type { DocumentData, Firestore } from "firebase-admin/firestore";

import { normalizeBillingRecord } from "./billingServiceCore.ts";
import type { BillingRecord } from "./billingTypes.ts";
import { resolveCommercialEntitlementForAccounts } from "./commercialAccessService.ts";
import { evaluateCommercialScheduleRange, resolveBusinessTimeZone } from "./timezone.ts";

export const BOOKING_LOCK_MINUTES = 30;
export const MAX_BOOKING_BODY_BYTES = 8_192;
export const MAX_BOOKING_SERVICES = 20;

const LOCK_MS = BOOKING_LOCK_MINUTES * 60 * 1_000;
const SLUG_PATTERN = /^[a-z0-9-]{3,120}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const JWT_STRUCTURE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const DEFINITIVE_CREDENTIAL_ERROR_CODES = new Set([
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/user-disabled",
]);
const CREDENTIAL_ARGUMENT_ERROR_PREFIXES = [
  "Decoding Firebase ID token failed.",
  "verifyIdToken() expects an ID token, but was given a custom token.",
  "verifyIdToken() expects an ID token, but was given a legacy custom token.",
  'Firebase ID token has no "kid" claim.',
  "Firebase ID token has incorrect algorithm.",
  'Firebase ID token has incorrect "aud" (audience) claim.',
  'Firebase ID token has incorrect "iss" (issuer) claim.',
  'Firebase ID token has no "sub" (subject) claim.',
  'Firebase ID token has an empty "sub" (subject) claim.',
  'Firebase ID token has a "sub" (subject) claim longer than 128 characters.',
  "Firebase ID token has invalid signature.",
  'Firebase ID token has "kid" claim which does not correspond to a known public key.',
];
const ALLOWED_BOOKING_COMMERCIAL_STATES = new Set([
  "ACTIVE",
  "TRIAL_ACTIVE",
  "PAST_DUE_GRACE",
]);

type BookingErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "SLOT_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "COMMERCIAL_BOOKING_BLOCKED"
  | "BOOKING_UNAVAILABLE";

export class BookingError extends Error {
  readonly status: number;
  readonly code: BookingErrorCode;

  constructor(status: number, code: BookingErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class InvalidBookingTokenError extends Error {
  constructor() {
    super("Invalid Firebase ID token.");
    this.name = "InvalidBookingTokenError";
  }
}

export type BookingIdentity = {
  uid: string;
  email?: string;
};

export type BookingInput = {
  pageSlug: string;
  startAt: string;
  services: string[];
  customerName: string;
  customerPhone: string;
  idempotencyKey: string;
};

type ParsedBookingInput = BookingInput & { startDate: Date };

export type BookingResult = {
  status: "BOOKED" | "ALREADY_BOOKED";
  appointmentId: string;
  serviceName: string;
  totalValue: number;
  startAt: string;
};

export type BookingLockSnapshot = {
  id: string;
  data: DocumentData | null;
};

export type BookingTransaction = {
  getPage(pageSlug: string): Promise<DocumentData | null>;
  getUser(ownerId: string): Promise<DocumentData | null>;
  getBilling(ownerId: string): Promise<BillingRecord | null>;
  getAppointment(appointmentId: string): Promise<DocumentData | null>;
  getLocks(lockIds: string[]): Promise<BookingLockSnapshot[]>;
  getAppointments(appointmentIds: string[]): Promise<Map<string, DocumentData | null>>;
  findAppointmentsStartingBefore(pageSlug: string, endAt: Date): Promise<DocumentData[]>;
  createAppointment(appointmentId: string, data: DocumentData): void;
  setLock(lockId: string, data: DocumentData): void;
};
type BookingCommercialResolver = (
  ownerId: string,
  user: DocumentData,
  page: DocumentData,
  billing: BillingRecord | null,
  now: Date,
) => Readonly<{ state: string }>;


export type BookingStore = {
  runTransaction<T>(operation: (transaction: BookingTransaction) => Promise<T>): Promise<T>;
};

export type BookingDependencies = {
  verifyIdToken(token: string): Promise<BookingIdentity>;
  store: BookingStore;
  resolveCommercialEntitlement?: BookingCommercialResolver;
  now?: () => Date;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const errorProperty = (error: unknown, property: "code" | "message"): string | undefined => {
  if (!isPlainObject(error)) return undefined;
  return typeof error[property] === "string" ? error[property] : undefined;
};

const isCredentialVerificationError = (error: unknown): boolean => {
  const code = errorProperty(error, "code");
  if (code && DEFINITIVE_CREDENTIAL_ERROR_CODES.has(code)) return true;
  if (code !== "auth/argument-error") return false;
  const message = errorProperty(error, "message");
  return Boolean(message && CREDENTIAL_ARGUMENT_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix)));
};

const publicResponse = (body: unknown, status: number): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const invalidRequest = (message = "Entrada inválida."): never => {
  throw new BookingError(400, "INVALID_REQUEST", message);
};

const parseRequiredString = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== "string") return invalidRequest(`${field} inválido.`);
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    invalidRequest(`${field} inválido.`);
  }
  return normalized;
};

export const parseBookingInput = (value: unknown): ParsedBookingInput => {
  if (!isPlainObject(value)) return invalidRequest();
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "customerName,customerPhone,idempotencyKey,pageSlug,services,startAt") {
    invalidRequest("Entrada contém campos inválidos.");
  }

  const pageSlug = parseRequiredString(value.pageSlug, "pageSlug", 120);
  if (!SLUG_PATTERN.test(pageSlug)) invalidRequest("pageSlug inválido.");

  const startAt = parseRequiredString(value.startAt, "startAt", 64);
  if (!ISO_DATETIME_PATTERN.test(startAt)) invalidRequest("startAt inválido.");
  const startDate = new Date(startAt);
  if (Number.isNaN(startDate.getTime())) invalidRequest("startAt inválido.");

  const requestedServices = value.services;
  if (!Array.isArray(requestedServices)) return invalidRequest("services inválido.");
  if (
    requestedServices.length === 0 ||
    requestedServices.length > MAX_BOOKING_SERVICES
  ) {
    invalidRequest("services inválido.");
  }
  const services = requestedServices.map((service) =>
    parseRequiredString(service, "services", 160));
  if (new Set(services).size !== services.length) invalidRequest("services contém duplicatas.");

  const idempotencyKey = parseRequiredString(value.idempotencyKey, "idempotencyKey", 128);
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) invalidRequest("idempotencyKey inválida.");

  return {
    pageSlug,
    startAt: startDate.toISOString(),
    startDate,
    services,
    customerName: parseRequiredString(value.customerName, "customerName", 120),
    customerPhone: parseRequiredString(value.customerPhone, "customerPhone", 40),
    idempotencyKey,
  };
};

export const verifyBookingIdToken = async (
  token: string,
  verify: (token: string) => Promise<BookingIdentity>,
): Promise<BookingIdentity> => {
  if (!JWT_STRUCTURE_PATTERN.test(token)) throw new InvalidBookingTokenError();
  try {
    return await verify(token);
  } catch (error) {
    if (isCredentialVerificationError(error)) throw new InvalidBookingTokenError();
    throw error;
  }
};

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (isPlainObject(value) && typeof value.toDate === "function") {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
  }
  if (typeof value === "string") {
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  return null;
};

const parseTime = (value: unknown, fallback: string): number => {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "string" || !TIME_PATTERN.test(candidate)) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agenda temporariamente indisponível.");
  }
  const [hours, minutes] = candidate.split(":").map(Number);
  return hours * 60 + minutes;
};

const parsePrice = (value: unknown): number => {
  if (value === undefined || value === "") return 0;
  if (typeof value !== "string" || !/^\d+(?:[.,]\d{1,2})?$/.test(value)) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Serviço temporariamente indisponível.");
  }
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Serviço temporariamente indisponível.");
  }
  return cents;
};

type ResolvedServices = {
  serviceName: string;
  totalDuration: number;
  totalValue: number;
};

export const resolveBookingServices = (
  page: DocumentData,
  selectedTitles: string[],
): ResolvedServices => {
  if (!Array.isArray(page.links)) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Serviços temporariamente indisponíveis.");
  }

  let totalDuration = 0;
  let totalCents = 0;
  for (const title of selectedTitles) {
    const matches = page.links.filter(
      (item) => isPlainObject(item) && item.type === "service" && item.title === title,
    );
    if (matches.length !== 1) invalidRequest("Serviço inválido ou ambíguo.");
    const service = matches[0];
    if (service.active === false) invalidRequest("Serviço indisponível.");

    const duration = service.durationMinutes === undefined ? 30 : service.durationMinutes;
    if (!Number.isInteger(duration) || (duration as number) <= 0 || (duration as number) > 24 * 60) {
      throw new BookingError(503, "BOOKING_UNAVAILABLE", "Serviço temporariamente indisponível.");
    }
    totalDuration += duration as number;
    totalCents += parsePrice(service.price);
  }

  if (totalDuration <= 0 || totalDuration > 24 * 60 || !Number.isSafeInteger(totalCents)) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Serviço temporariamente indisponível.");
  }
  return {
    serviceName: selectedTitles.join(" + "),
    totalDuration,
    totalValue: totalCents / 100,
  };
};

export const validateBookingTime = (
  page: DocumentData,
  startAt: Date,
  endAt: Date,
  now: Date,
): void => {
  if (page.isOpen === false) throw new BookingError(409, "SLOT_UNAVAILABLE", "Horário indisponível.");
  if (startAt <= now || endAt <= startAt) {
    throw new BookingError(409, "SLOT_UNAVAILABLE", "Horário indisponível.");
  }
  const timeZone = resolveBusinessTimeZone(page.timezone);
  const schedule = isPlainObject(page.schedule) ? page.schedule : {};
  const open = parseTime(schedule.open, "09:00");
  const close = parseTime(schedule.close, "19:00");
  let lunchStart: number | null = null;
  let lunchEnd: number | null = null;
  if (schedule.lunchStart !== undefined || schedule.lunchEnd !== undefined) {
    if (schedule.lunchStart === undefined || schedule.lunchEnd === undefined) {
      throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agenda temporariamente indisponível.");
    }
    lunchStart = parseTime(schedule.lunchStart, "00:00");
    lunchEnd = parseTime(schedule.lunchEnd, "00:00");
    if (lunchStart >= lunchEnd) {
      throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agenda temporariamente indisponível.");
    }
  }
  const scheduleRange = evaluateCommercialScheduleRange({
    startAt,
    endAt,
    timeZone,
    openMinutes: open,
    closeMinutes: close,
    lunchStartMinutes: lunchStart,
    lunchEndMinutes: lunchEnd,
  });
  const { localStart } = scheduleRange;
  if (localStart.second !== 0 || startAt.getMilliseconds() !== 0 || localStart.minute % 30 !== 0) {
    invalidRequest("startAt fora da grade suportada.");
  }
  const workingDays = schedule.workingDays;
  if (
    workingDays !== undefined &&
    (!Array.isArray(workingDays) ||
      !workingDays.every((day) => Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6))
  ) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agenda temporariamente indisponível.");
  }
  if (Array.isArray(workingDays) && !workingDays.includes(localStart.weekday)) {
    throw new BookingError(409, "SLOT_UNAVAILABLE", "Horário indisponível.");
  }

  if (!scheduleRange.withinSchedule || scheduleRange.overlapsLunch) {
    throw new BookingError(409, "SLOT_UNAVAILABLE", "Horário indisponível.");
  }
};

export const bookingAppointmentId = (uid: string, idempotencyKey: string): string =>
  createHash("sha256").update(uid).update("\0").update(idempotencyKey).digest("hex");

export const bookingFingerprint = (uid: string, input: BookingInput): string =>
  createHash("sha256")
    .update(JSON.stringify({
      uid,
      pageSlug: input.pageSlug,
      startAt: input.startAt,
      services: input.services,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
    }))
    .digest("hex");

export const bookingLockIds = (pageSlug: string, startAt: Date, endAt: Date): string[] => {
  const ids: string[] = [];
  for (let cursor = startAt.getTime(); cursor < endAt.getTime(); cursor += LOCK_MS) {
    ids.push(`${pageSlug}_${cursor}`);
  }
  return ids;
};

const statusBlocks = (status: unknown): boolean => status !== "cancelled";

const overlaps = (document: DocumentData, startAt: Date, endAt: Date): boolean => {
  const existingStart = dateValue(document.startAt);
  const existingEnd = dateValue(document.endAt);
  if (!existingStart || !existingEnd || existingEnd <= existingStart) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agenda temporariamente indisponível.");
  }
  return existingStart < endAt && existingEnd > startAt;
};

const resultFromAppointment = (appointmentId: string, appointment: DocumentData): BookingResult => {
  const startAt = dateValue(appointment.startAt);
  if (
    !startAt ||
    typeof appointment.serviceName !== "string" ||
    typeof appointment.totalValue !== "number"
  ) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agendamento temporariamente indisponível.");
  }
  return {
    status: "ALREADY_BOOKED",
    appointmentId,
    serviceName: appointment.serviceName,
    totalValue: appointment.totalValue,
    startAt: startAt.toISOString(),
  };
};

const performBooking = async (
  identity: BookingIdentity,
  input: ParsedBookingInput,
  transaction: BookingTransaction,
  now: Date,
  resolveEntitlement: BookingCommercialResolver,
): Promise<BookingResult> => {
  const page = await transaction.getPage(input.pageSlug);
  if (!page) return invalidRequest("Página inválida.");

  const ownerId = page.userId;
  if (
    page.slug !== input.pageSlug ||
    typeof ownerId !== "string" ||
    ownerId.length === 0
  ) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agendamento temporariamente indisponível.");
  }
  const user = await transaction.getUser(ownerId);
  if (!user || user.pageSlug !== input.pageSlug) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agendamento temporariamente indisponível.");
  }

  const appointmentId = bookingAppointmentId(identity.uid, input.idempotencyKey);
  const fingerprint = bookingFingerprint(identity.uid, input);
  const existingAppointment = await transaction.getAppointment(appointmentId);
  if (existingAppointment) {
    if (
      existingAppointment.customerId !== identity.uid ||
      existingAppointment.bookingFingerprint !== fingerprint
    ) {
      throw new BookingError(409, "IDEMPOTENCY_CONFLICT", "Chave já utilizada com outros dados.");
    }
    return resultFromAppointment(appointmentId, existingAppointment);
  }

  const billing = await transaction.getBilling(ownerId);
  if (billing && (billing.ownerId !== ownerId || billing.pageSlug !== input.pageSlug)) {
    throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agendamento temporariamente indisponível.");
  }
  const entitlement = resolveEntitlement(ownerId, user, page, billing, now);
  if (!ALLOWED_BOOKING_COMMERCIAL_STATES.has(entitlement.state)) {
    throw new BookingError(
      403,
      "COMMERCIAL_BOOKING_BLOCKED",
      "Novos agendamentos estão indisponíveis para este estabelecimento.",
    );
  }

  const resolved = resolveBookingServices(page, input.services);
  const endAt = new Date(input.startDate.getTime() + resolved.totalDuration * 60 * 1_000);
  validateBookingTime(page, input.startDate, endAt, now);

  const lockIds = bookingLockIds(input.pageSlug, input.startDate, endAt);
  const locks = await transaction.getLocks(lockIds);
  const linkedIds = [...new Set(locks.flatMap((lock) => {
    if (!lock.data) return [];
    if (
      lock.data.pageSlug !== input.pageSlug ||
      typeof lock.data.appointmentId !== "string" ||
      dateValue(lock.data.slotStart)?.getTime() !== Number(lock.id.slice(lock.id.lastIndexOf("_") + 1))
    ) {
      throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agenda temporariamente indisponível.");
    }
    return [lock.data.appointmentId];
  }))];
  const linkedAppointments = await transaction.getAppointments(linkedIds);
  for (const linkedId of linkedIds) {
    const linked = linkedAppointments.get(linkedId);
    if (!linked || linked.pageSlug !== input.pageSlug) {
      throw new BookingError(503, "BOOKING_UNAVAILABLE", "Agenda temporariamente indisponível.");
    }
    if (statusBlocks(linked.status)) {
      throw new BookingError(409, "SLOT_UNAVAILABLE", "Horário indisponível.");
    }
  }

  const candidates = await transaction.findAppointmentsStartingBefore(input.pageSlug, endAt);
  for (const candidate of candidates) {
    if (statusBlocks(candidate.status) && overlaps(candidate, input.startDate, endAt)) {
      throw new BookingError(409, "SLOT_UNAVAILABLE", "Horário indisponível.");
    }
  }

  const appointment: DocumentData = {
    pageSlug: input.pageSlug,
    serviceId: "multi-services",
    serviceName: resolved.serviceName,
    customerId: identity.uid,
    ...(identity.email ? { customerEmail: identity.email } : {}),
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    startAt: input.startDate,
    endAt,
    status: "pending",
    createdAt: now,
    totalValue: resolved.totalValue,
    bookingFingerprint: fingerprint,
  };
  transaction.createAppointment(appointmentId, appointment);
  lockIds.forEach((lockId, index) => {
    transaction.setLock(lockId, {
      pageSlug: input.pageSlug,
      slotStart: new Date(input.startDate.getTime() + index * LOCK_MS),
      appointmentId,
      createdAt: now,
    });
  });

  return {
    status: "BOOKED",
    appointmentId,
    serviceName: resolved.serviceName,
    totalValue: resolved.totalValue,
    startAt: input.startDate.toISOString(),
  };
};

const readBody = async (request: Request): Promise<unknown> => {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (declaredLength > MAX_BOOKING_BODY_BYTES) invalidRequest();
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BOOKING_BODY_BYTES) invalidRequest();
  try {
    return JSON.parse(rawBody);
  } catch {
    invalidRequest("JSON inválido.");
  }
};

export const handleBookingRequest = async (
  request: Request,
  dependencies: BookingDependencies,
): Promise<Response> => {
  try {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match) throw new BookingError(401, "UNAUTHORIZED", "Autenticação necessária.");

    let identity: BookingIdentity;
    try {
      identity = await dependencies.verifyIdToken(match[1]);
    } catch (error) {
      if (error instanceof InvalidBookingTokenError) {
        throw new BookingError(401, "UNAUTHORIZED", "Token inválido.");
      }
      throw error;
    }
    if (!identity || typeof identity.uid !== "string" || identity.uid.length === 0) {
      throw new BookingError(401, "UNAUTHORIZED", "Token inválido.");
    }

    const input = parseBookingInput(await readBody(request));
    const now = new Date((dependencies.now ?? (() => new Date()))().getTime());
    const result = await dependencies.store.runTransaction((transaction) =>
      performBooking(
        identity,
        input,
        transaction,
        now,
        dependencies.resolveCommercialEntitlement ?? resolveCommercialEntitlementForAccounts,
      ),
    );
    return publicResponse(result, result.status === "BOOKED" ? 201 : 200);
  } catch (error) {
    if (error instanceof BookingError) {
      return publicResponse({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error("Falha interna ao criar agendamento.");
    return publicResponse(
      { error: { code: "BOOKING_UNAVAILABLE", message: "Agendamento temporariamente indisponível." } },
      503,
    );
  }
};

export const createFirestoreBookingStore = (
  db: Firestore,
  options: { beforeTransactionCommit?: () => void | Promise<void> } = {},
): BookingStore => ({
  runTransaction(operation) {
    return db.runTransaction(async (firestoreTransaction) => {
      const result = await operation({
        async getPage(pageSlug) {
          const snapshot = await firestoreTransaction.get(db.collection("pages").doc(pageSlug));
          return snapshot.exists ? snapshot.data()! : null;
        },
        async getUser(ownerId) {
          const snapshot = await firestoreTransaction.get(db.collection("users").doc(ownerId));
          return snapshot.exists ? snapshot.data()! : null;
        },
        async getBilling(ownerId) {
          const snapshot = await firestoreTransaction.get(db.collection("billing").doc(ownerId));
          return snapshot.exists ? normalizeBillingRecord(ownerId, snapshot.data()!) : null;
        },
        async getAppointment(appointmentId) {
          const snapshot = await firestoreTransaction.get(db.collection("appointments").doc(appointmentId));
          return snapshot.exists ? snapshot.data()! : null;
        },
        async getLocks(lockIds) {
          if (lockIds.length === 0) return [];
          const references = lockIds.map((lockId) => db.collection("bookingLocks").doc(lockId));
          const snapshots = await firestoreTransaction.getAll(...references);
          return snapshots.map((snapshot, index) => ({
            id: lockIds[index],
            data: snapshot.exists ? snapshot.data()! : null,
          }));
        },
        async getAppointments(appointmentIds) {
          if (appointmentIds.length === 0) return new Map();
          const references = appointmentIds.map((id) => db.collection("appointments").doc(id));
          const snapshots = await firestoreTransaction.getAll(...references);
          return new Map(snapshots.map((snapshot, index) => [
            appointmentIds[index],
            snapshot.exists ? snapshot.data()! : null,
          ]));
        },
        async findAppointmentsStartingBefore(pageSlug, endAt) {
          const query = db.collection("appointments")
            .where("pageSlug", "==", pageSlug)
            .where("startAt", "<", endAt);
          const snapshot = await firestoreTransaction.get(query);
          return snapshot.docs.map((document) => document.data());
        },
        createAppointment(appointmentId, data) {
          firestoreTransaction.create(db.collection("appointments").doc(appointmentId), data);
        },
        setLock(lockId, data) {
          firestoreTransaction.set(db.collection("bookingLocks").doc(lockId), data);
        },
      });
      await options.beforeTransactionCommit?.();
      return result;
    });
  },
});
