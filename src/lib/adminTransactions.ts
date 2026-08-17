import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import {
  handleAdminCreateTransactionRequest,
  handleAdminDeleteTransactionRequest,
  type AdminTransactionsStore,
} from "./adminTransactionsService";
import { requireCommercialAccess } from "./commercialAccess";
import { getAdminFirestore } from "./firebaseAdmin";

const firestoreStore: AdminTransactionsStore = {
  async createTransaction(pageSlug, input) {
    const reference = getAdminFirestore().collection("transactions").doc();
    await reference.create({
      ...input,
      pageSlug,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reference.id;
  },

  async deleteTransaction(transactionId, pageSlug) {
    const firestore = getAdminFirestore();
    const reference = firestore.collection("transactions").doc(transactionId);
    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || snapshot.data()?.pageSlug !== pageSlug) return false;
      transaction.delete(reference);
      return true;
    });
  },
};

const safeLog = ({
  ownerId,
  transactionId,
  error,
}: { ownerId?: string; transactionId?: string; error: unknown }) => {
  const name = typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : undefined;
  console.error("Falha interna em mutação administrativa de movimentação.", {
    ownerId,
    transactionId,
    name,
  });
};

export const handleAdminTransactionCreate = (request: Request) =>
  handleAdminCreateTransactionRequest(request, {
    requireCommercialAccess,
    store: firestoreStore,
    logError: safeLog,
  });

export const handleAdminTransactionDelete = (request: Request, transactionId: string) =>
  handleAdminDeleteTransactionRequest(request, transactionId, {
    requireCommercialAccess,
    store: firestoreStore,
    logError: safeLog,
  });
