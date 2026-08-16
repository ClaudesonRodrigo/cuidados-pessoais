import "server-only";

import {
  handleAdminServicesRequest,
  type AdminServiceAction,
  type AdminServicesStore,
} from "./adminServicesService";
import { requireCommercialAccess } from "./commercialAccess";
import { getAdminFirestore } from "./firebaseAdmin";

const firestoreStore: AdminServicesStore = {
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

const safeLog = ({ ownerId, error }: { ownerId?: string; error: unknown }) => {
  const name = typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : undefined;
  console.error("Falha interna em mutação administrativa de serviços.", { ownerId, name });
};

export const handleAdminServicesMutation = (request: Request, action: AdminServiceAction) =>
  handleAdminServicesRequest(request, action, {
    requireCommercialAccess,
    store: firestoreStore,
    logError: safeLog,
  });
