import {
  CommercialAccessError,
  commercialAccessErrorResponse,
  type CommercialContext,
} from "./commercialAccessService.ts";

const MAX_BODY_BYTES = 16_384;
const TITLE_MAX_LENGTH = 120;
const BIO_MAX_LENGTH = 2_000;
const ADDRESS_MAX_LENGTH = 300;
const WHATSAPP_MAX_LENGTH = 32;
const PIX_KEY_MAX_LENGTH = 200;
const IMAGE_URL_MAX_LENGTH = 2_048;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

type PageDocument = Record<string, unknown>;
export type ProfileUpdate = Record<string, unknown>;

export type AdminProfileStore = {
  runProfileTransaction(
    pageSlug: string,
    operation: (page: PageDocument | null) => ProfileUpdate,
  ): Promise<void>;
};

export type AdminProfileDependencies = {
  requireCommercialAccess(request: Request): Promise<CommercialContext>;
  store: AdminProfileStore;
  logError?(context: { ownerId?: string; error: unknown }): void;
};

type AdminProfileErrorCode =
  | "INVALID_REQUEST"
  | "TENANT_CONTEXT_REQUIRED"
  | "TENANT_INCONSISTENT"
  | "MASTER_PROFILE_UNAVAILABLE"
  | "ADMIN_PROFILE_UNAVAILABLE";

export class AdminProfileError extends Error {
  readonly status: number;
  readonly code: AdminProfileErrorCode;

  constructor(status: number, code: AdminProfileErrorCode, message: string) {
    super(message);
    this.name = "AdminProfileError";
    this.status = status;
    this.code = code;
  }
}

const invalidRequest = (message = "Requisição inválida."): never => {
  throw new AdminProfileError(400, "INVALID_REQUEST", message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export const readProfileJsonBody = async (request: Request): Promise<Record<string, unknown>> => {
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

const trimmedString = (value: unknown, maxLength: number, label: string): string => {
  if (typeof value !== "string") return invalidRequest(`${label} inválido.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) return invalidRequest(`${label} inválido.`);
  return normalized;
};

const titleValue = (value: unknown): string => {
  const title = trimmedString(value, TITLE_MAX_LENGTH, "Título");
  if (!title) return invalidRequest("Título inválido.");
  return title;
};

const whatsappValue = (value: unknown): string => {
  const raw = trimmedString(value, WHATSAPP_MAX_LENGTH, "WhatsApp");
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return invalidRequest("WhatsApp inválido.");
  return digits;
};

const profileImageValue = (value: unknown): string => {
  const normalized = trimmedString(value, IMAGE_URL_MAX_LENGTH, "Imagem");
  if (!normalized) return invalidRequest("Imagem inválida.");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      return invalidRequest("Imagem inválida.");
    }
  } catch {
    return invalidRequest("Imagem inválida.");
  }
  return normalized;
};

const minutes = (value: unknown, label: string): number => {
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) {
    return invalidRequest(`${label} inválido.`);
  }
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const scheduleValue = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) return invalidRequest("Agenda inválida.");
  const allowed = new Set(["open", "close", "lunchStart", "lunchEnd", "workingDays"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return invalidRequest("Agenda inválida.");
  if (!hasOwn(value, "open") || !hasOwn(value, "close") || !hasOwn(value, "workingDays")) {
    return invalidRequest("Agenda inválida.");
  }

  const open = minutes(value.open, "Abertura");
  const close = minutes(value.close, "Fechamento");
  if (open >= close) return invalidRequest("Agenda inválida.");

  if (!Array.isArray(value.workingDays)) return invalidRequest("Dias inválidos.");
  const workingDays = value.workingDays;
  if (
    workingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(workingDays).size !== workingDays.length
  ) {
    return invalidRequest("Dias inválidos.");
  }

  const hasLunchStart = hasOwn(value, "lunchStart");
  const hasLunchEnd = hasOwn(value, "lunchEnd");
  if (hasLunchStart !== hasLunchEnd) return invalidRequest("Almoço inválido.");

  const schedule: Record<string, unknown> = {
    open: value.open,
    close: value.close,
    workingDays: [...workingDays],
  };
  if (hasLunchStart && hasLunchEnd) {
    const lunchStart = minutes(value.lunchStart, "Início do almoço");
    const lunchEnd = minutes(value.lunchEnd, "Fim do almoço");
    if (lunchStart < open || lunchStart >= lunchEnd || lunchEnd > close) {
      return invalidRequest("Almoço inválido.");
    }
    schedule.lunchStart = value.lunchStart;
    schedule.lunchEnd = value.lunchEnd;
  }
  return schedule;
};

const ALLOWED_FIELDS = new Set([
  "title",
  "bio",
  "address",
  "whatsapp",
  "pixKey",
  "isOpen",
  "schedule",
  "profileImageUrl",
]);

export const validateProfileUpdate = (body: Record<string, unknown>): ProfileUpdate => {
  if (Object.keys(body).length === 0 || Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    return invalidRequest();
  }

  const update: ProfileUpdate = {};
  if (hasOwn(body, "title")) update.title = titleValue(body.title);
  if (hasOwn(body, "bio")) update.bio = trimmedString(body.bio, BIO_MAX_LENGTH, "Biografia");
  if (hasOwn(body, "address")) {
    update.address = trimmedString(body.address, ADDRESS_MAX_LENGTH, "Endereço");
  }
  if (hasOwn(body, "whatsapp")) update.whatsapp = whatsappValue(body.whatsapp);
  if (hasOwn(body, "pixKey")) {
    update.pixKey = trimmedString(body.pixKey, PIX_KEY_MAX_LENGTH, "Chave PIX");
  }
  if (hasOwn(body, "isOpen")) {
    if (typeof body.isOpen !== "boolean") return invalidRequest("Status inválido.");
    update.isOpen = body.isOpen;
  }
  if (hasOwn(body, "schedule")) update.schedule = scheduleValue(body.schedule);
  if (hasOwn(body, "profileImageUrl")) {
    update.profileImageUrl = profileImageValue(body.profileImageUrl);
  }
  return update;
};

const errorResponse = (error: AdminProfileError): Response =>
  Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );

export const handleAdminProfileRequest = async (
  request: Request,
  dependencies: AdminProfileDependencies,
): Promise<Response> => {
  let ownerId: string | undefined;
  try {
    if (request.method !== "PATCH" || new URL(request.url).search.length > 0) {
      return invalidRequest();
    }
    const context = await dependencies.requireCommercialAccess(request);
    ownerId = context.ownerId;
    if (!context.pageSlug) {
      throw new AdminProfileError(409, "TENANT_CONTEXT_REQUIRED", "Contexto de tenant necessário.");
    }

    const update = validateProfileUpdate(await readProfileJsonBody(request));
    await dependencies.store.runProfileTransaction(context.pageSlug, (page) => {
      if (!page || page.userId !== context.ownerId || page.slug !== context.pageSlug) {
        throw new AdminProfileError(409, "TENANT_INCONSISTENT", "Tenant inconsistente.");
      }
      return update;
    });

    return Response.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CommercialAccessError) return commercialAccessErrorResponse(error);
    if (error instanceof AdminProfileError) return errorResponse(error);
    dependencies.logError?.({ ownerId, error });
    return errorResponse(
      new AdminProfileError(503, "ADMIN_PROFILE_UNAVAILABLE", "Perfil indisponível."),
    );
  }
};
