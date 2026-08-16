"use client";

import { auth } from "./firebaseClient";

export type AdminServiceFields = {
  title: string;
  price?: string;
  description?: string;
  imageUrl?: string;
  category?: string;
  durationMinutes: number;
};

const mutateServices = async (method: string, path: string, body: unknown): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Sessão expirada.");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Não foi possível alterar os serviços.");
};

export const createAdminService = (fields: AdminServiceFields) =>
  mutateServices("POST", "/api/admin/services", fields);

export const updateAdminService = (index: number, fields: AdminServiceFields) =>
  mutateServices("PATCH", "/api/admin/services", { index, ...fields });

export const deleteAdminService = (index: number) =>
  mutateServices("DELETE", "/api/admin/services", { index });

export const reorderAdminServices = (indices: number[]) =>
  mutateServices("PUT", "/api/admin/services/order", { indices });
