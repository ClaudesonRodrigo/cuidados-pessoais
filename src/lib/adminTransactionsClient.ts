"use client";

import { auth } from "./firebaseClient";

export type TransactionMutationInput = Readonly<{
  type: "income" | "expense";
  description: string;
  value: number;
  category: string;
  date: string;
}>;

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

export const createAdminTransaction = async (input: TransactionMutationInput): Promise<string> => {
  const response = await fetch("/api/admin/transactions", {
    method: "POST",
    headers: {
      ...(await authorizationHeader()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) return throwApiError(response);
  const payload = await response.json() as { transaction: { id: string } };
  return payload.transaction.id;
};

export const deleteAdminTransaction = async (transactionId: string): Promise<void> => {
  const response = await fetch(`/api/admin/transactions/${encodeURIComponent(transactionId)}`, {
    method: "DELETE",
    headers: await authorizationHeader(),
  });
  if (!response.ok) return throwApiError(response);
};
