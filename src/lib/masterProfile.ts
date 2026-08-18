import "server-only";

import { getAdminFirestore } from "./firebaseAdmin";
import { handleMasterProfileRequest, type MasterProfileDependencies } from "./masterProfileService";
import { requireSuperadminTenantContext } from "./superadminTenantContext";

const store: MasterProfileDependencies["store"] = {
  async runProfileTransaction(pageSlug, operation) {
    const firestore = getAdminFirestore();
    const reference = firestore.collection("pages").doc(pageSlug);
    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const update = operation(snapshot.exists ? snapshot.data()! : null);
      transaction.update(reference, update);
    });
  },
};

export const handleMasterProfileMutation = (request: Request) =>
  handleMasterProfileRequest(request, {
    requireSuperadminTenantContext,
    store,
    logError({ targetOwnerId, error }) {
      const name = typeof error === "object" && error !== null && "name" in error
        ? String(error.name)
        : undefined;
      console.error("Falha interna em mutação Master de perfil.", { targetOwnerId, name });
    },
  });
