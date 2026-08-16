"use client";

import { auth } from "./firebaseClient";

export type AdminSchedule = {
  open: string;
  close: string;
  lunchStart?: string;
  lunchEnd?: string;
  workingDays: number[];
};

export type AdminProfileUpdate = {
  title?: string;
  bio?: string;
  address?: string;
  whatsapp?: string;
  pixKey?: string;
  isOpen?: boolean;
  schedule?: AdminSchedule;
  profileImageUrl?: string;
};

export const updateAdminProfile = async (update: AdminProfileUpdate): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Sessão expirada.");
  const token = await user.getIdToken();
  const response = await fetch("/api/admin/page/profile", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(update),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Não foi possível alterar o perfil.");
};
