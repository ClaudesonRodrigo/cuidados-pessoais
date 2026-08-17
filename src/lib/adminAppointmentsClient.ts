"use client";

import { auth } from "./firebaseClient";

export type AdminAppointmentAction = "confirm" | "cancel" | "complete";

export const updateAdminAppointmentStatus = async (
  appointmentId: string,
  action: AdminAppointmentAction,
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Sessão expirada.");
  const token = await user.getIdToken();
  const response = await fetch(
    `/api/admin/appointments/${encodeURIComponent(appointmentId)}/status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("Não foi possível alterar o agendamento.");
};
