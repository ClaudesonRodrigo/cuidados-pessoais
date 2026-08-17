import "server-only";

import {
  handleAdminAppointmentStatusRequest,
  type AdminAppointmentsStore,
} from "./adminAppointmentsService";
import { requireCommercialAccess } from "./commercialAccess";
import { getAdminFirestore } from "./firebaseAdmin";

const firestoreStore: AdminAppointmentsStore = {
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

const safeLog = ({
  ownerId,
  appointmentId,
  error,
}: { ownerId?: string; appointmentId?: string; error: unknown }) => {
  const name = typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : undefined;
  console.error("Falha interna em mutação administrativa da agenda.", {
    ownerId,
    appointmentId,
    name,
  });
};

export const handleAdminAppointmentStatusMutation = (
  request: Request,
  appointmentId: string,
) => handleAdminAppointmentStatusRequest(request, appointmentId, {
  requireCommercialAccess,
  store: firestoreStore,
  logError: safeLog,
});
