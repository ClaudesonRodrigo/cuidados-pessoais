"use client";

import type { AdminProfileUpdate } from "./adminProfileClient";
import { auth } from "./firebaseClient";

export const updateMasterProfile = async (
  targetOwnerId: string,
  update: AdminProfileUpdate,
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Sessão expirada.");
  const token = await user.getIdToken();
  const response = await fetch("/api/master/page/profile", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetOwnerId, update }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Não foi possível alterar o perfil.");
};
