import "server-only";

import { getAdminFirestore } from "./firebaseAdmin";
import {
  BILLING_COLLECTION,
  createBillingService,
  type BillingProjectionStore,
} from "./billingServiceCore";

export { BILLING_COLLECTION } from "./billingServiceCore";
export type { ApplyStripeBillingSnapshotInput } from "./billingServiceCore";

const adminBillingStore: BillingProjectionStore = {
  async get(ownerId) {
    const snapshot = await getAdminFirestore().collection(BILLING_COLLECTION).doc(ownerId).get();
    return snapshot.exists ? snapshot.data()! : null;
  },

  runTransaction(ownerId, operation) {
    const db = getAdminFirestore();
    const reference = db.collection(BILLING_COLLECTION).doc(ownerId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const mutation = operation(snapshot.exists ? snapshot.data()! : null);
      if (mutation.replacement) transaction.set(reference, mutation.replacement);
      return mutation.result;
    });
  },
};

const adminBillingService = createBillingService({
  store: adminBillingStore,
  now: () => new Date(),
});

export const getBillingByOwnerId = adminBillingService.getBillingByOwnerId;
export const applyStripeBillingSnapshot = adminBillingService.applyStripeBillingSnapshot;
