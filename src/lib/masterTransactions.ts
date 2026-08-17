import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "./firebaseAdmin";
import {
  handleMasterCreateTransactionRequest,
  handleMasterDeleteTransactionRequest,
  type MasterTransactionsStore,
} from "./masterTransactionsService";
import { requireSuperadminTenantContext } from "./superadminTenantContext";

const firestoreStore: MasterTransactionsStore = {
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
  targetOwnerId,
  transactionId,
  error,
}: { targetOwnerId?: string; transactionId?: string; error: unknown }) => {
  const name = typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : undefined;
  console.error("Falha interna em mutação Master de movimentação.", {
    targetOwnerId,
    transactionId,
    name,
  });
};

export const handleMasterTransactionCreate = (request: Request) =>
  handleMasterCreateTransactionRequest(request, {
    requireSuperadminTenantContext,
    store: firestoreStore,
    logError: safeLog,
  });

export const handleMasterTransactionDelete = (request: Request, transactionId: string) =>
  handleMasterDeleteTransactionRequest(request, transactionId, {
    requireSuperadminTenantContext,
    store: firestoreStore,
    logError: safeLog,
  });
