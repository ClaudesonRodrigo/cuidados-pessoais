import "server-only";

import { getAdminFirestore } from "./firebaseAdmin";
import {
  handleMasterServicesRequest,
  type MasterServicesDependencies,
} from "./masterServicesService";
import type { AdminServiceAction } from "./adminServicesService";
import { requireSuperadminTenantContext } from "./superadminTenantContext";

const store: MasterServicesDependencies["store"] = {
  async runLinksTransaction(pageSlug, operation) {
    const firestore = getAdminFirestore();
    const reference = firestore.collection("pages").doc(pageSlug);
    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const links = operation(snapshot.exists ? snapshot.data()! : null);
      transaction.update(reference, { links });
    });
  },
};

export const handleMasterServicesMutation = (
  request: Request,
  action: AdminServiceAction,
) => handleMasterServicesRequest(request, action, {
  requireSuperadminTenantContext,
  store,
  logError({ targetOwnerId, error }) {
    const name = typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : undefined;
    console.error("Falha interna em mutação Master de serviços.", { targetOwnerId, name });
  },
});
