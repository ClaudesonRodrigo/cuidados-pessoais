import {
  STRIPE_BILLING_STATUSES,
  type BillingProjectionResult,
  type BillingRecord,
  type BillingStripeSnapshot,
  type StripeBillingStatus,
  type StripeEventCursor,
} from "./billingTypes.ts";

type DocumentData = Record<string, unknown>;

export const BILLING_COLLECTION = "billing";

const OWNER_ID_MAX_LENGTH = 128;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]{8,255}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

type BillingProjectionMutation<T> = {
  result: T;
  replacement?: DocumentData;
};

export type BillingProjectionStore = {
  get(ownerId: string): Promise<DocumentData | null>;
  runTransaction<T>(
    ownerId: string,
    operation: (current: DocumentData | null) => BillingProjectionMutation<T>,
  ): Promise<T>;
};

export type BillingServiceDependencies = {
  store: BillingProjectionStore;
  now: () => Date;
};

export type ApplyStripeBillingSnapshotInput = {
  /** Deve ser derivado de identidade server-side confiável, nunca de metadata/frontend. */
  ownerId: string;
  pageSlug: string;
  event: StripeEventCursor;
  /** Snapshot completo recuperado da Stripe; campos ausentes serão removidos. */
  snapshot: BillingStripeSnapshot;
};

export const assertValidOwnerId = (ownerId: string): void => {
  if (
    typeof ownerId !== "string" ||
    ownerId.length === 0 ||
    ownerId.length > OWNER_ID_MAX_LENGTH ||
    ownerId.trim() !== ownerId ||
    ownerId.includes("/") ||
    CONTROL_CHARACTER_PATTERN.test(ownerId)
  ) {
    throw new Error("ownerId inválido para billing.");
  }
};

const assertValidPageSlug = (pageSlug: string): void => {
  if (typeof pageSlug !== "string" || !/^[a-z0-9-]{3,120}$/.test(pageSlug)) {
    throw new Error("pageSlug inválido para billing.");
  }
};

const assertValidEvent = (event: StripeEventCursor): void => {
  if (!EVENT_ID_PATTERN.test(event.id)) {
    throw new Error("Stripe event.id inválido.");
  }
  if (!Number.isSafeInteger(event.created) || event.created < 0) {
    throw new Error("Stripe event.created inválido.");
  }
};

const isStripeBillingStatus = (value: unknown): value is StripeBillingStatus =>
  typeof value === "string" &&
  (STRIPE_BILLING_STATUSES as readonly string[]).includes(value);

const assertOptionalDate = (value: unknown, field: string): void => {
  if (value !== undefined && (!(value instanceof Date) || !Number.isFinite(value.getTime()))) {
    throw new Error(`Snapshot Stripe inválido: ${field}`);
  }
};

const assertOptionalString = (value: unknown, field: string): void => {
  if (value !== undefined && (typeof value !== "string" || value.length === 0)) {
    throw new Error(`Snapshot Stripe inválido: ${field}`);
  }
};

export const assertValidBillingStripeSnapshot = (snapshot: BillingStripeSnapshot): void => {
  if (snapshot.status !== undefined && !isStripeBillingStatus(snapshot.status)) {
    throw new Error(`Status Stripe desconhecido: ${String(snapshot.status)}`);
  }

  assertOptionalString(snapshot.stripeCustomerId, "stripeCustomerId");
  assertOptionalString(snapshot.stripeSubscriptionId, "stripeSubscriptionId");
  assertOptionalString(snapshot.stripePriceId, "stripePriceId");
  assertOptionalDate(snapshot.currentPeriodEnd, "currentPeriodEnd");
  assertOptionalDate(snapshot.pastDueSince, "pastDueSince");

  if (
    snapshot.cancelAtPeriodEnd !== undefined &&
    typeof snapshot.cancelAtPeriodEnd !== "boolean"
  ) {
    throw new Error("Snapshot Stripe inválido: cancelAtPeriodEnd");
  }
};

const dateValue = (value: unknown, field: string, required = false): Date | undefined => {
  if (value === undefined && !required) return undefined;
  const date = value instanceof Date
    ? value
    : typeof value === "object" &&
        value !== null &&
        "toDate" in value &&
        typeof value.toDate === "function"
      ? value.toDate()
      : undefined;
  if (!date || !Number.isFinite(date.getTime())) {
    throw new Error(`Projeção de billing inválida: ${field}`);
  }
  return date;
};

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Projeção de billing inválida: ${field}`);
  }
  return value;
};

const optionalBoolean = (value: unknown, field: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`Projeção de billing inválida: ${field}`);
  }
  return value;
};

const optionalEventCreated = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("Projeção de billing inválida: lastStripeEventCreated");
  }
  return value as number;
};

const optionalStatus = (value: unknown): StripeBillingStatus | undefined => {
  if (value === undefined) return undefined;
  if (!isStripeBillingStatus(value)) {
    throw new Error(`Status Stripe desconhecido na projeção: ${String(value)}`);
  }
  return value;
};

export const normalizeBillingRecord = (
  ownerId: string,
  data: DocumentData,
): BillingRecord => {
  assertValidOwnerId(ownerId);
  if (data.ownerId !== ownerId) {
    throw new Error("Projeção de billing inválida: ownerId divergente");
  }
  if (typeof data.pageSlug !== "string") {
    throw new Error("Projeção de billing inválida: pageSlug");
  }
  assertValidPageSlug(data.pageSlug);

  return {
    ownerId,
    pageSlug: data.pageSlug,
    stripeCustomerId: optionalString(data.stripeCustomerId, "stripeCustomerId"),
    stripeSubscriptionId: optionalString(data.stripeSubscriptionId, "stripeSubscriptionId"),
    stripePriceId: optionalString(data.stripePriceId, "stripePriceId"),
    status: optionalStatus(data.status),
    currentPeriodEnd: dateValue(data.currentPeriodEnd, "currentPeriodEnd"),
    cancelAtPeriodEnd: optionalBoolean(data.cancelAtPeriodEnd, "cancelAtPeriodEnd"),
    pastDueSince: dateValue(data.pastDueSince, "pastDueSince"),
    createdAt: dateValue(data.createdAt, "createdAt", true)!,
    updatedAt: dateValue(data.updatedAt, "updatedAt", true)!,
    lastStripeEventId: optionalString(data.lastStripeEventId, "lastStripeEventId"),
    lastStripeEventCreated: optionalEventCreated(data.lastStripeEventCreated),
  };
};

const completeProjectionDocument = (
  ownerId: string,
  pageSlug: string,
  snapshot: BillingStripeSnapshot,
  event: StripeEventCursor,
  createdAt: Date,
  updatedAt: Date,
): DocumentData => ({
  ownerId,
  pageSlug,
  ...(snapshot.stripeCustomerId === undefined
    ? {}
    : { stripeCustomerId: snapshot.stripeCustomerId }),
  ...(snapshot.stripeSubscriptionId === undefined
    ? {}
    : { stripeSubscriptionId: snapshot.stripeSubscriptionId }),
  ...(snapshot.stripePriceId === undefined ? {} : { stripePriceId: snapshot.stripePriceId }),
  ...(snapshot.status === undefined ? {} : { status: snapshot.status }),
  ...(snapshot.currentPeriodEnd === undefined
    ? {}
    : { currentPeriodEnd: snapshot.currentPeriodEnd }),
  ...(snapshot.cancelAtPeriodEnd === undefined
    ? {}
    : { cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd }),
  ...(snapshot.pastDueSince === undefined ? {} : { pastDueSince: snapshot.pastDueSince }),
  createdAt,
  updatedAt,
  lastStripeEventId: event.id,
  lastStripeEventCreated: event.created,
});

const projectEvent = (
  ownerId: string,
  pageSlug: string,
  event: StripeEventCursor,
  snapshot: BillingStripeSnapshot,
  now: Date,
  currentData: DocumentData | null,
): BillingProjectionMutation<BillingProjectionResult> => {
  const current = currentData ? normalizeBillingRecord(ownerId, currentData) : null;

  if (current?.lastStripeEventId === event.id) {
    return { result: { decision: "DUPLICATE", billing: current } };
  }

  if (current?.lastStripeEventCreated !== undefined) {
    if (event.created < current.lastStripeEventCreated) {
      return { result: { decision: "STALE", billing: current } };
    }
    if (event.created === current.lastStripeEventCreated) {
      return { result: { decision: "REQUIRES_STRIPE_SYNC", billing: current } };
    }
  }

  if (current && current.pageSlug !== pageSlug) {
    throw new Error("pageSlug divergente para owner de billing.");
  }

  const replacement = completeProjectionDocument(
    ownerId,
    current?.pageSlug ?? pageSlug,
    snapshot,
    event,
    current?.createdAt ?? now,
    now,
  );

  return {
    result: {
      decision: "APPLIED",
      billing: normalizeBillingRecord(ownerId, replacement),
    },
    replacement,
  };
};

export const createBillingService = ({ store, now }: BillingServiceDependencies) => ({
  async getBillingByOwnerId(ownerId: string): Promise<BillingRecord | null> {
    assertValidOwnerId(ownerId);
    const data = await store.get(ownerId);
    return data ? normalizeBillingRecord(ownerId, data) : null;
  },

  async applyStripeBillingSnapshot({
    ownerId,
    pageSlug,
    event,
    snapshot,
  }: ApplyStripeBillingSnapshotInput): Promise<BillingProjectionResult> {
    assertValidOwnerId(ownerId);
    assertValidPageSlug(pageSlug);
    assertValidEvent(event);
    assertValidBillingStripeSnapshot(snapshot);

    const currentTime = now();
    if (!(currentTime instanceof Date) || !Number.isFinite(currentTime.getTime())) {
      throw new Error("Horário server-side inválido para billing.");
    }

    return store.runTransaction(ownerId, (current) =>
      projectEvent(ownerId, pageSlug, event, snapshot, currentTime, current),
    );
  },
});
