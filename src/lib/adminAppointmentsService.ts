import {
  CommercialAccessError,
  commercialAccessErrorResponse,
  type CommercialContext,
} from "./commercialAccessService.ts";

const MAX_BODY_BYTES = 4_096;
const MAX_APPOINTMENT_ID_LENGTH = 200;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type AdminAppointmentAction = "confirm" | "cancel" | "complete";
export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";
type AppointmentDocument = Record<string, unknown>;

export type AdminAppointmentsStore = {
  runAppointmentTransaction(
    appointmentId: string,
    operation: (appointment: AppointmentDocument | null) => AppointmentStatus,
  ): Promise<AppointmentStatus>;
};

export type AdminAppointmentsDependencies = {
  requireCommercialAccess(request: Request): Promise<CommercialContext>;
  store: AdminAppointmentsStore;
  logError?(context: { ownerId?: string; appointmentId?: string; error: unknown }): void;
};

type AdminAppointmentsErrorCode =
  | "INVALID_REQUEST"
  | "TENANT_CONTEXT_REQUIRED"
  | "APPOINTMENT_NOT_FOUND"
  | "APPOINTMENT_STATE_INVALID"
  | "ADMIN_APPOINTMENTS_UNAVAILABLE";

export class AdminAppointmentsError extends Error {
  readonly status: number;
  readonly code: AdminAppointmentsErrorCode;

  constructor(status: number, code: AdminAppointmentsErrorCode, message: string) {
    super(message);
    this.name = "AdminAppointmentsError";
    this.status = status;
    this.code = code;
  }
}

const invalidRequest = (message = "Requisição inválida."): never => {
  throw new AdminAppointmentsError(400, "INVALID_REQUEST", message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const readAppointmentJsonBody = async (request: Request): Promise<Record<string, unknown>> => {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json") {
    return invalidRequest();
  }
  if (!request.body) return invalidRequest();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return invalidRequest("Payload excede o limite permitido.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!isRecord(parsed)) return invalidRequest();
    return parsed;
  } catch {
    return invalidRequest();
  }
};

export const validateAppointmentId = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_APPOINTMENT_ID_LENGTH ||
    value.includes("/") ||
    CONTROL_CHARACTERS.test(value)
  ) return invalidRequest("Appointment ID inválido.");
  return value;
};

export const parseAppointmentAction = (value: unknown): AdminAppointmentAction => {
  if (value !== "confirm" && value !== "cancel" && value !== "complete") {
    return invalidRequest("Ação inválida.");
  }
  return value;
};

const actionValue = (body: Record<string, unknown>): AdminAppointmentAction => {
  if (Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, "action")) {
    return invalidRequest();
  }
  return parseAppointmentAction(body.action);
};

export const resolveNextAppointmentStatus = (
  current: unknown,
  action: AdminAppointmentAction,
): AppointmentStatus => {
  if (current === "pending" && action === "confirm") return "confirmed";
  if (current === "pending" && action === "cancel") return "cancelled";
  if (current === "confirmed" && action === "complete") return "completed";
  if (current === "confirmed" && action === "cancel") return "cancelled";
  throw new AdminAppointmentsError(409, "APPOINTMENT_STATE_INVALID", "Transição de status inválida.");
};

const errorResponse = (error: AdminAppointmentsError): Response =>
  Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );

export const handleAdminAppointmentStatusRequest = async (
  request: Request,
  appointmentIdInput: unknown,
  dependencies: AdminAppointmentsDependencies,
): Promise<Response> => {
  let ownerId: string | undefined;
  let appointmentId: string | undefined;
  try {
    if (request.method !== "POST" || new URL(request.url).search.length > 0) return invalidRequest();
    appointmentId = validateAppointmentId(appointmentIdInput);
    const context = await dependencies.requireCommercialAccess(request);
    ownerId = context.ownerId;
    if (!context.pageSlug) {
      throw new AdminAppointmentsError(409, "TENANT_CONTEXT_REQUIRED", "Contexto de tenant necessário.");
    }
    const action = actionValue(await readAppointmentJsonBody(request));
    const status = await dependencies.store.runAppointmentTransaction(appointmentId, (appointment) => {
      if (!appointment || appointment.pageSlug !== context.pageSlug) {
        throw new AdminAppointmentsError(404, "APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
      }
      return resolveNextAppointmentStatus(appointment.status, action);
    });
    return Response.json(
      { ok: true, appointment: { id: appointmentId, status } },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CommercialAccessError) return commercialAccessErrorResponse(error);
    if (error instanceof AdminAppointmentsError) return errorResponse(error);
    dependencies.logError?.({ ownerId, appointmentId, error });
    return errorResponse(new AdminAppointmentsError(
      503,
      "ADMIN_APPOINTMENTS_UNAVAILABLE",
      "Agenda indisponível.",
    ));
  }
};
