import "server-only";

import { getAdminFirestore } from "./firebaseAdmin";
import { handleMasterAppointmentStatusRequest, type MasterAppointmentsStore } from "./masterAppointmentsService";
import { requireSuperadminTenantContext } from "./superadminTenantContext";

const firestoreStore: MasterAppointmentsStore = {
  async runAppointmentTransaction(appointmentId, operation) {
    const firestore = getAdminFirestore();
    const reference = firestore.collection("appointments").doc(appointmentId);
    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const status = operation(snapshot.exists ? snapshot.data()! : null);
      transaction.update(reference, { status });
      return status;
    });
  },
};

export const handleMasterAppointmentStatusMutation = (
  request: Request,
  appointmentId: string,
) => handleMasterAppointmentStatusRequest(request, appointmentId, {
  requireSuperadminTenantContext,
  store: firestoreStore,
  logError({ targetOwnerId, appointmentId: id, error }) {
    const name = typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : undefined;
    console.error("Falha interna em mutação Master da agenda.", {
      targetOwnerId,
      appointmentId: id,
      name,
    });
  },
});
