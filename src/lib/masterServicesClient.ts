"use client";

import type { AdminServiceFields } from "./adminServicesClient";
import { auth } from "./firebaseClient";

const mutateMasterServices = async (
  method: string,
  path: string,
  targetOwnerId: string,
  body: Record<string, unknown>,
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Sessão expirada.");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetOwnerId, ...body }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Não foi possível alterar os serviços.");
};

export const createMasterService = (
  targetOwnerId: string,
  fields: AdminServiceFields,
) => mutateMasterServices("POST", "/api/master/services", targetOwnerId, fields);

export const updateMasterService = (
  targetOwnerId: string,
  index: number,
  fields: AdminServiceFields,
) => mutateMasterServices(
  "PATCH",
  "/api/master/services",
  targetOwnerId,
  { index, ...fields },
);

export const deleteMasterService = (targetOwnerId: string, index: number) =>
  mutateMasterServices("DELETE", "/api/master/services", targetOwnerId, { index });

export const reorderMasterServices = (targetOwnerId: string, indices: number[]) =>
  mutateMasterServices("PUT", "/api/master/services/order", targetOwnerId, { indices });
