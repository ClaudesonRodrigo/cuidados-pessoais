import "server-only";

import {
  handleAdminProfileRequest,
  type AdminProfileStore,
} from "./adminProfileService";
import { requireCommercialAccess } from "./commercialAccess";
import { getAdminFirestore } from "./firebaseAdmin";

const firestoreStore: AdminProfileStore = {
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

const safeLog = ({ ownerId, error }: { ownerId?: string; error: unknown }) => {
  const name = typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : undefined;
  console.error("Falha interna em mutação administrativa de perfil.", { ownerId, name });
};

export const handleAdminProfileMutation = (request: Request) =>
  handleAdminProfileRequest(request, {
    requireCommercialAccess,
    store: firestoreStore,
    logError: safeLog,
  });
