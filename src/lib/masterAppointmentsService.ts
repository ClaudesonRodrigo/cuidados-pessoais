import {
  AdminAppointmentsError,
  parseAppointmentAction,
  readAppointmentJsonBody,
  resolveNextAppointmentStatus,
  validateAppointmentId,
  type AppointmentStatus,
} from "./adminAppointmentsService.ts";
import {
  SuperadminTenantContextError,
  superadminTenantContextErrorResponse,
  type SuperadminTenantContext,
} from "./superadminTenantContextService.ts";

type AppointmentDocument = Record<string, unknown>;

export type MasterAppointmentsStore = {
  runAppointmentTransaction(
    appointmentId: string,
    operation: (appointment: AppointmentDocument | null) => AppointmentStatus,
  ): Promise<AppointmentStatus>;
};

export type MasterAppointmentsDependencies = {
  requireSuperadminTenantContext(
    request: Request,
    targetOwnerId: unknown,
  ): Promise<SuperadminTenantContext>;
  store: MasterAppointmentsStore;
  logError?(context: {
    targetOwnerId?: string;
    appointmentId?: string;
    error: unknown;
  }): void;
};

const masterErrorResponse = (error: AdminAppointmentsError): Response => Response.json(
  { error: { code: error.code, message: error.message } },
  { status: error.status, headers: { "Cache-Control": "no-store" } },
);

const parseClosedBody = (body: Record<string, unknown>) => {
  const keys = Object.keys(body);
  if (
    keys.length !== 2 ||
    !Object.prototype.hasOwnProperty.call(body, "targetOwnerId") ||
    !Object.prototype.hasOwnProperty.call(body, "action")
  ) {
    throw new AdminAppointmentsError(400, "INVALID_REQUEST", "Requisição inválida.");
  }
  return { targetOwnerId: body.targetOwnerId, action: parseAppointmentAction(body.action) };
};

export const handleMasterAppointmentStatusRequest = async (
  request: Request,
  appointmentIdInput: unknown,
  dependencies: MasterAppointmentsDependencies,
): Promise<Response> => {
  let targetOwnerId: string | undefined;
  let appointmentId: string | undefined;
  try {
    if (request.method !== "POST" || new URL(request.url).search.length > 0) {
      throw new AdminAppointmentsError(400, "INVALID_REQUEST", "Requisição inválida.");
    }
    appointmentId = validateAppointmentId(appointmentIdInput);
    const body = await readAppointmentJsonBody(request);
    const context = await dependencies.requireSuperadminTenantContext(request, body.targetOwnerId);
    targetOwnerId = context.targetOwnerId;
    const input = parseClosedBody(body);

    const status = await dependencies.store.runAppointmentTransaction(appointmentId, (appointment) => {
      if (!appointment || appointment.pageSlug !== context.pageSlug) {
        throw new AdminAppointmentsError(404, "APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
      }
      return resolveNextAppointmentStatus(appointment.status, input.action);
    });

    return Response.json(
      { ok: true, appointment: { id: appointmentId, status } },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperadminTenantContextError) {
      return superadminTenantContextErrorResponse(error);
    }
    if (error instanceof AdminAppointmentsError) return masterErrorResponse(error);
    dependencies.logError?.({ targetOwnerId, appointmentId, error });
    return masterErrorResponse(new AdminAppointmentsError(
      503,
      "ADMIN_APPOINTMENTS_UNAVAILABLE",
      "Agenda indisponível.",
    ));
  }
};
