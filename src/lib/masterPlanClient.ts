"use client";

import { auth } from "./firebaseClient";

export type MasterPlan = "free" | "pro";

export const updateMasterPlan = async (
  targetOwnerId: string,
  plan: MasterPlan,
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Sessão expirada.");
  const token = await user.getIdToken();
  const response = await fetch("/api/master/users/plan", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetOwnerId, plan }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Não foi possível alterar o plano.");
};
