import "server-only";

import { getAdminFirestore } from "./firebaseAdmin";
import {
  handleMasterPlanRequest,
  MasterPlanError,
  type MasterPlanStore,
} from "./masterPlanService";
import { requireSuperadminTenantContext } from "./superadminTenantContext";

const store: MasterPlanStore = {
  async updatePlanAtomically(targetOwnerId, pageSlug, plan) {
    const firestore = getAdminFirestore();
    const userReference = firestore.collection("users").doc(targetOwnerId);
    const pageReference = firestore.collection("pages").doc(pageSlug);

    await firestore.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userReference);
      const pageSnapshot = await transaction.get(pageReference);
      const user = userSnapshot.exists ? userSnapshot.data()! : null;
      const page = pageSnapshot.exists ? pageSnapshot.data()! : null;
      if (
        !user ||
        !page ||
        user.pageSlug !== pageSlug ||
        page.userId !== targetOwnerId ||
        page.slug !== pageSlug
      ) {
        throw new MasterPlanError(409, "TENANT_INCONSISTENT", "Tenant inconsistente.");
      }
      const update = { plan, trialDeadline: null };
      transaction.update(userReference, update);
      transaction.update(pageReference, update);
    });
  },
};

export const handleMasterPlanMutation = (request: Request) =>
  handleMasterPlanRequest(request, {
    requireSuperadminTenantContext,
    store,
    logError({ targetOwnerId, error }) {
      const name = typeof error === "object" && error !== null && "name" in error
        ? String(error.name)
        : undefined;
      console.error("Falha interna em mutação Master de plano.", { targetOwnerId, name });
    },
  });
