import "server-only";

import { Timestamp, type DocumentData } from "firebase-admin/firestore";

import { getAdminFirestore } from "./firebaseAdmin";
import type {
  BillingProjectionUpdate,
  BillingRecord,
  StripeBillingStatus,
} from "./billingTypes";
import { STRIPE_BILLING_STATUSES } from "./billingTypes";

export const BILLING_COLLECTION = "billing";

const optionalDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
};

const requiredDate = (value: unknown, field: string): Date => {
  const date = optionalDate(value);
  if (!date) throw new Error(`Projeção de billing inválida: ${field}`);
  return date;
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const optionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const optionalBillingStatus = (value: unknown): StripeBillingStatus | undefined =>
  typeof value === "string" &&
  (STRIPE_BILLING_STATUSES as readonly string[]).includes(value)
    ? (value as StripeBillingStatus)
    : undefined;

const toBillingRecord = (ownerId: string, data: DocumentData): BillingRecord => {
  if (typeof data.pageSlug !== "string") {
    throw new Error("Projeção de billing inválida: pageSlug");
  }

  return {
    ownerId,
    pageSlug: data.pageSlug,
    stripeCustomerId: optionalString(data.stripeCustomerId),
    stripeSubscriptionId: optionalString(data.stripeSubscriptionId),
    stripePriceId: optionalString(data.stripePriceId),
    status: optionalBillingStatus(data.status),
    currentPeriodEnd: optionalDate(data.currentPeriodEnd),
    cancelAtPeriodEnd: optionalBoolean(data.cancelAtPeriodEnd),
    pastDueSince: optionalDate(data.pastDueSince),
    createdAt: requiredDate(data.createdAt, "createdAt"),
    updatedAt: requiredDate(data.updatedAt, "updatedAt"),
    lastStripeEventCreated: optionalNumber(data.lastStripeEventCreated),
  };
};

const definedEntries = (values: Record<string, unknown>): DocumentData =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

export const getBillingByOwnerId = async (ownerId: string): Promise<BillingRecord | null> => {
  const snapshot = await getAdminFirestore().collection(BILLING_COLLECTION).doc(ownerId).get();
  return snapshot.exists ? toBillingRecord(ownerId, snapshot.data()!) : null;
};

export const upsertBillingProjection = async (
  ownerId: string,
  projection: BillingProjectionUpdate,
): Promise<BillingRecord> => {
  const db = getAdminFirestore();
  const reference = db.collection(BILLING_COLLECTION).doc(ownerId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const now = Timestamp.now();
    const payload = definedEntries({
      ownerId,
      pageSlug: projection.pageSlug,
      stripeCustomerId: projection.stripeCustomerId,
      stripeSubscriptionId: projection.stripeSubscriptionId,
      stripePriceId: projection.stripePriceId,
      status: projection.status,
      currentPeriodEnd: projection.currentPeriodEnd
        ? Timestamp.fromDate(projection.currentPeriodEnd)
        : undefined,
      cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
      pastDueSince: projection.pastDueSince
        ? Timestamp.fromDate(projection.pastDueSince)
        : undefined,
      lastStripeEventCreated: projection.lastStripeEventCreated,
      createdAt: snapshot.exists ? snapshot.data()?.createdAt : now,
      updatedAt: now,
    });

    transaction.set(reference, payload, { merge: true });
  });

  const billing = await getBillingByOwnerId(ownerId);
  if (!billing) throw new Error("Falha ao persistir projeção de billing.");
  return billing;
};
