import "server-only";

import { Timestamp, type DocumentData } from "firebase-admin/firestore";

import { getAdminFirestore } from "./firebaseAdmin";
import type {
  BillingCheckoutState,
  CheckoutOperationState,
  CheckoutOperationalStore,
} from "./checkoutTypes";
import { CheckoutStoreConflictError } from "./checkoutTypes";

export const BILLING_CHECKOUT_STATE_COLLECTION = "billingCheckoutState";

const OPERATION_STATES = new Set<CheckoutOperationState>([
  "CUSTOMER_PROVISIONING",
  "READY",
  "CHECKOUT_PROVISIONING",
  "CHECKOUT_OPEN",
]);

const dateValue = (value: unknown, field: string, required = false): Date | undefined => {
  if (value === undefined && !required) return undefined;
  const date = value instanceof Date
    ? value
    : value instanceof Timestamp
      ? value.toDate()
      : undefined;
  if (!date || !Number.isFinite(date.getTime())) {
    throw new CheckoutStoreConflictError(`Estado operacional inválido: ${field}`);
  }
  return date;
};

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new CheckoutStoreConflictError(`Estado operacional inválido: ${field}`);
  }
  return value;
};

const optionalPositiveInteger = (value: unknown, field: string): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new CheckoutStoreConflictError(`Estado operacional inválido: ${field}`);
  }
  return value as number;
};

const normalizeState = (ownerId: string, data: DocumentData): BillingCheckoutState => {
  if (data.ownerId !== ownerId || typeof data.pageSlug !== "string") {
    throw new CheckoutStoreConflictError("Binding operacional divergente.");
  }
  if (typeof data.operationState !== "string" || !OPERATION_STATES.has(data.operationState as CheckoutOperationState)) {
    throw new CheckoutStoreConflictError("Estado operacional desconhecido.");
  }

  return {
    ownerId,
    pageSlug: data.pageSlug,
    stripeCustomerId: optionalString(data.stripeCustomerId, "stripeCustomerId"),
    customerProvisioningKey: optionalString(data.customerProvisioningKey, "customerProvisioningKey"),
    checkoutAttemptId: optionalString(data.checkoutAttemptId, "checkoutAttemptId"),
    checkoutSessionId: optionalString(data.checkoutSessionId, "checkoutSessionId"),
    checkoutSessionUrl: optionalString(data.checkoutSessionUrl, "checkoutSessionUrl"),
    checkoutExpiresAt: dateValue(data.checkoutExpiresAt, "checkoutExpiresAt"),
    checkoutTrialEnd: optionalPositiveInteger(data.checkoutTrialEnd, "checkoutTrialEnd"),
    checkoutTrialPeriodDays: optionalPositiveInteger(
      data.checkoutTrialPeriodDays,
      "checkoutTrialPeriodDays",
    ),
    operationStartedAt: dateValue(data.operationStartedAt, "operationStartedAt"),
    operationLeaseUntil: dateValue(data.operationLeaseUntil, "operationLeaseUntil"),
    operationState: data.operationState as CheckoutOperationState,
    createdAt: dateValue(data.createdAt, "createdAt", true)!,
    updatedAt: dateValue(data.updatedAt, "updatedAt", true)!,
  };
};

const assertBinding = (state: BillingCheckoutState, ownerId: string, pageSlug: string): void => {
  if (state.ownerId !== ownerId || state.pageSlug !== pageSlug) {
    throw new CheckoutStoreConflictError("Binding operacional divergente.");
  }
};

const stateDocument = (state: BillingCheckoutState): DocumentData => ({
  ownerId: state.ownerId,
  pageSlug: state.pageSlug,
  ...(state.stripeCustomerId ? { stripeCustomerId: state.stripeCustomerId } : {}),
  ...(state.customerProvisioningKey ? { customerProvisioningKey: state.customerProvisioningKey } : {}),
  ...(state.checkoutAttemptId ? { checkoutAttemptId: state.checkoutAttemptId } : {}),
  ...(state.checkoutSessionId ? { checkoutSessionId: state.checkoutSessionId } : {}),
  ...(state.checkoutSessionUrl ? { checkoutSessionUrl: state.checkoutSessionUrl } : {}),
  ...(state.checkoutExpiresAt ? { checkoutExpiresAt: state.checkoutExpiresAt } : {}),
  ...(state.checkoutTrialEnd ? { checkoutTrialEnd: state.checkoutTrialEnd } : {}),
  ...(state.checkoutTrialPeriodDays
    ? { checkoutTrialPeriodDays: state.checkoutTrialPeriodDays }
    : {}),
  ...(state.operationStartedAt ? { operationStartedAt: state.operationStartedAt } : {}),
  ...(state.operationLeaseUntil ? { operationLeaseUntil: state.operationLeaseUntil } : {}),
  operationState: state.operationState,
  createdAt: state.createdAt,
  updatedAt: state.updatedAt,
});

export const createFirestoreCheckoutStore = (): CheckoutOperationalStore => ({
  async get(ownerId) {
    const snapshot = await getAdminFirestore()
      .collection(BILLING_CHECKOUT_STATE_COLLECTION)
      .doc(ownerId)
      .get();
    return snapshot.exists ? normalizeState(ownerId, snapshot.data()!) : null;
  },

  reserveCustomer({ ownerId, pageSlug, proposedProvisioningKey, now, leaseUntil }) {
    const db = getAdminFirestore();
    const reference = db.collection(BILLING_CHECKOUT_STATE_COLLECTION).doc(ownerId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) {
        const current = normalizeState(ownerId, snapshot.data()!);
        assertBinding(current, ownerId, pageSlug);
        if (current.stripeCustomerId || current.customerProvisioningKey) return current;
      }

      const state: BillingCheckoutState = {
        ownerId,
        pageSlug,
        customerProvisioningKey: proposedProvisioningKey,
        operationState: "CUSTOMER_PROVISIONING",
        operationStartedAt: now,
        operationLeaseUntil: leaseUntil,
        createdAt: snapshot.exists ? normalizeState(ownerId, snapshot.data()!).createdAt : now,
        updatedAt: now,
      };
      transaction.set(reference, stateDocument(state));
      return state;
    });
  },

  bindCustomer({ ownerId, pageSlug, provisioningKey, stripeCustomerId, now }) {
    const db = getAdminFirestore();
    const reference = db.collection(BILLING_CHECKOUT_STATE_COLLECTION).doc(ownerId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new CheckoutStoreConflictError("Reserva de Customer ausente.");
      const current = normalizeState(ownerId, snapshot.data()!);
      assertBinding(current, ownerId, pageSlug);
      if (current.customerProvisioningKey !== provisioningKey) {
        throw new CheckoutStoreConflictError("Reserva de Customer divergente.");
      }
      if (current.stripeCustomerId && current.stripeCustomerId !== stripeCustomerId) {
        throw new CheckoutStoreConflictError("Customer canônico divergente.");
      }
      const state: BillingCheckoutState = {
        ownerId,
        pageSlug,
        customerProvisioningKey: current.customerProvisioningKey,
        stripeCustomerId,
        operationState: "READY",
        createdAt: current.createdAt,
        updatedAt: now,
      };
      transaction.set(reference, stateDocument(state));
      return state;
    });
  },

  reserveCheckoutAttempt({
    ownerId,
    pageSlug,
    proposedAttemptId,
    replaceAttemptId,
    now,
    leaseUntil,
    expiresAt,
    trialEnd,
    trialPeriodDays,
  }) {
    const db = getAdminFirestore();
    const reference = db.collection(BILLING_CHECKOUT_STATE_COLLECTION).doc(ownerId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new CheckoutStoreConflictError("Customer canônico ausente.");
      const current = normalizeState(ownerId, snapshot.data()!);
      assertBinding(current, ownerId, pageSlug);
      if (!current.stripeCustomerId) {
        throw new CheckoutStoreConflictError("Customer canônico ausente.");
      }

      if (current.checkoutAttemptId) {
        if (!replaceAttemptId || current.checkoutAttemptId !== replaceAttemptId) return current;
      }

      const state: BillingCheckoutState = {
        ownerId,
        pageSlug,
        stripeCustomerId: current.stripeCustomerId,
        customerProvisioningKey: current.customerProvisioningKey,
        checkoutAttemptId: proposedAttemptId,
        checkoutExpiresAt: expiresAt,
        checkoutTrialEnd: trialEnd,
        checkoutTrialPeriodDays: trialPeriodDays,
        operationState: "CHECKOUT_PROVISIONING",
        operationStartedAt: now,
        operationLeaseUntil: leaseUntil,
        createdAt: current.createdAt,
        updatedAt: now,
      };
      transaction.set(reference, stateDocument(state));
      return state;
    });
  },

  recordCheckoutSession({
    ownerId,
    pageSlug,
    checkoutAttemptId,
    sessionId,
    sessionUrl,
    expiresAt,
    now,
  }) {
    const db = getAdminFirestore();
    const reference = db.collection(BILLING_CHECKOUT_STATE_COLLECTION).doc(ownerId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new CheckoutStoreConflictError("Tentativa de Checkout ausente.");
      const current = normalizeState(ownerId, snapshot.data()!);
      assertBinding(current, ownerId, pageSlug);
      if (current.checkoutAttemptId !== checkoutAttemptId) {
        throw new CheckoutStoreConflictError("Tentativa de Checkout divergente.");
      }
      if (current.checkoutSessionId && current.checkoutSessionId !== sessionId) {
        throw new CheckoutStoreConflictError("Checkout Session canônica divergente.");
      }

      const state: BillingCheckoutState = {
        ownerId,
        pageSlug,
        stripeCustomerId: current.stripeCustomerId,
        customerProvisioningKey: current.customerProvisioningKey,
        checkoutAttemptId,
        checkoutSessionId: sessionId,
        checkoutSessionUrl: sessionUrl,
        checkoutExpiresAt: expiresAt,
        operationState: "CHECKOUT_OPEN",
        createdAt: current.createdAt,
        updatedAt: now,
      };
      transaction.set(reference, stateDocument(state));
      return state;
    });
  },
});
