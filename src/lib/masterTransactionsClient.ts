"use client";

import { auth } from "./firebaseClient";
import type { TransactionMutationInput } from "./adminTransactionsClient";

type ApiErrorPayload = { error?: { message?: string } };

const authorizationHeader = async (): Promise<Record<string, string>> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  return { Authorization: `Bearer ${await user.getIdToken()}` };
};

const throwApiError = async (response: Response): Promise<never> => {
  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  throw new Error(payload?.error?.message || "Não foi possível atualizar as movimentações.");
};

export const createMasterTransaction = async (
  targetOwnerId: string,
  input: TransactionMutationInput,
): Promise<string> => {
  const response = await fetch("/api/master/transactions", {
    method: "POST",
    headers: {
      ...(await authorizationHeader()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetOwnerId, ...input }),
  });
  if (!response.ok) return throwApiError(response);
  const payload = await response.json() as { transaction: { id: string } };
  return payload.transaction.id;
};

export const deleteMasterTransaction = async (
  targetOwnerId: string,
  transactionId: string,
): Promise<void> => {
  const response = await fetch(`/api/master/transactions/${encodeURIComponent(transactionId)}`, {
    method: "DELETE",
    headers: {
      ...(await authorizationHeader()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetOwnerId }),
  });
  if (!response.ok) return throwApiError(response);
};
