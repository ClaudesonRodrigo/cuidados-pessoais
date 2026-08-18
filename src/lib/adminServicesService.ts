import {
  CommercialAccessError,
  commercialAccessErrorResponse,
  type CommercialContext,
} from "./commercialAccessService.ts";

const MAX_BODY_BYTES = 16_384;
const MAX_LINKS = 500;
const MAX_CANONICAL_LINKS_BYTES = 750_000;
const TITLE_MAX_LENGTH = 120;
const PRICE_MAX_LENGTH = 24;
const DESCRIPTION_MAX_LENGTH = 2_000;
const CATEGORY_MAX_LENGTH = 80;
const IMAGE_URL_MAX_LENGTH = 2_048;
const PRICE_PATTERN = /^(?:\d{1,9}(?:[.,]\d{1,2})?)?$/;

export type AdminServiceAction = "CREATE" | "EDIT" | "DELETE" | "REORDER";
type PageDocument = Record<string, unknown>;
type ServiceLink = Record<string, unknown>;

export type AdminServicesStore = {
  runLinksTransaction(
    pageSlug: string,
    operation: (page: PageDocument | null) => ServiceLink[],
  ): Promise<void>;
};

export type AdminServicesDependencies = {
  requireCommercialAccess(request: Request): Promise<CommercialContext>;
  store: AdminServicesStore;
  logError?(context: { ownerId?: string; error: unknown }): void;
};

export type AdminServicesErrorCode =
  | "INVALID_REQUEST"
  | "TENANT_CONTEXT_REQUIRED"
  | "TENANT_INCONSISTENT"
  | "SERVICE_NOT_FOUND"
  | "SERVICE_STATE_INVALID"
  | "MASTER_SERVICES_UNAVAILABLE"
  | "ADMIN_SERVICES_UNAVAILABLE";

export class AdminServicesError extends Error {
  readonly status: number;
  readonly code: AdminServicesErrorCode;

  constructor(status: number, code: AdminServicesErrorCode, message: string) {
    super(message);
    this.name = "AdminServicesError";
    this.status = status;
    this.code = code;
  }
}

const invalidRequest = (message = "Requisição inválida."): never => {
  throw new AdminServicesError(400, "INVALID_REQUEST", message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const requireOnlyKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>) => {
  if (Object.keys(value).some((key) => !allowed.has(key))) invalidRequest();
};

const requiredTitle = (value: unknown): string => {
  if (typeof value !== "string") return invalidRequest("Título inválido.");
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > TITLE_MAX_LENGTH) {
    return invalidRequest("Título inválido.");
  }
  return normalized;
};

const optionalString = (value: unknown, maxLength: number, field: string): string => {
  if (typeof value !== "string") return invalidRequest(`${field} inválido.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) return invalidRequest(`${field} inválido.`);
  return normalized;
};

const priceValue = (value: unknown): string => {
  const normalized = optionalString(value, PRICE_MAX_LENGTH, "Preço");
  if (!PRICE_PATTERN.test(normalized)) return invalidRequest("Preço inválido.");
  return normalized;
};

const imageUrlValue = (value: unknown): string => {
  const normalized = optionalString(value, IMAGE_URL_MAX_LENGTH, "Imagem");
  if (normalized.length === 0) return normalized;
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

const durationValue = (value: unknown): number => {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 1_440) {
    return invalidRequest("Duração inválida.");
  }
  return value as number;
};

const indexValue = (value: unknown): number => {
  if (!Number.isInteger(value) || (value as number) < 0) {
    return invalidRequest("Índice inválido.");
  }
  return value as number;
};

const EDITABLE_KEYS = new Set([
  "title",
  "price",
  "description",
  "imageUrl",
  "category",
  "durationMinutes",
]);

const parseEditableFields = (
  body: Record<string, unknown>,
  requireCoreFields: boolean,
): ServiceLink => {
  if (requireCoreFields && (!hasOwn(body, "title") || !hasOwn(body, "durationMinutes"))) {
    return invalidRequest();
  }

  const fields: ServiceLink = {};
  if (hasOwn(body, "title")) fields.title = requiredTitle(body.title);
  if (hasOwn(body, "price")) fields.price = priceValue(body.price);
  if (hasOwn(body, "description")) {
    fields.description = optionalString(body.description, DESCRIPTION_MAX_LENGTH, "Descrição");
  }
  if (hasOwn(body, "imageUrl")) fields.imageUrl = imageUrlValue(body.imageUrl);
  if (hasOwn(body, "category")) {
    fields.category = optionalString(body.category, CATEGORY_MAX_LENGTH, "Categoria");
  }
  if (hasOwn(body, "durationMinutes")) {
    fields.durationMinutes = durationValue(body.durationMinutes);
  }
  if (Object.keys(fields).length === 0) return invalidRequest();
  return fields;
};

export const readServicesJsonBody = async (request: Request): Promise<Record<string, unknown>> => {
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return invalidRequest();
  }
  if (!isRecord(parsed)) return invalidRequest();
  return parsed;
};

export const assertServiceLinksSize = (links: ServiceLink[]): void => {
  try {
    if (new TextEncoder().encode(JSON.stringify(links)).byteLength > MAX_CANONICAL_LINKS_BYTES) {
      throw new AdminServicesError(409, "SERVICE_STATE_INVALID", "Estado de serviços inválido.");
    }
  } catch (error) {
    if (error instanceof AdminServicesError) throw error;
    throw new AdminServicesError(409, "SERVICE_STATE_INVALID", "Estado de serviços inválido.");
  }
};

export const canonicalServiceLinks = (page: PageDocument): ServiceLink[] => {
  const value = page.links ?? [];
  if (!Array.isArray(value) || value.length > MAX_LINKS || value.some((link) => !isRecord(link))) {
    throw new AdminServicesError(409, "SERVICE_STATE_INVALID", "Estado de serviços inválido.");
  }
  const links = value as ServiceLink[];
  assertServiceLinksSize(links);
  return links;
};

const serviceAt = (links: ServiceLink[], index: number): ServiceLink => {
  if (index >= links.length || links[index].type !== "service") {
    throw new AdminServicesError(404, "SERVICE_NOT_FOUND", "Serviço não encontrado.");
  }
  return links[index];
};

export const parseServiceMutation = (action: AdminServiceAction, body: Record<string, unknown>) => {
  if (action === "CREATE") {
    requireOnlyKeys(body, EDITABLE_KEYS);
    return { fields: parseEditableFields(body, true) };
  }
  if (action === "EDIT") {
    requireOnlyKeys(body, new Set(["index", ...EDITABLE_KEYS]));
    const index = indexValue(body.index);
    const fieldsBody = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "index"));
    return { index, fields: parseEditableFields(fieldsBody, false) };
  }
  if (action === "DELETE") {
    requireOnlyKeys(body, new Set(["index"]));
    return { index: indexValue(body.index) };
  }

  requireOnlyKeys(body, new Set(["indices"]));
  if (!Array.isArray(body.indices) || body.indices.length > MAX_LINKS) return invalidRequest();
  const indices = body.indices.map(indexValue);
  if (new Set(indices).size !== indices.length) return invalidRequest("Ordem inválida.");
  return { indices };
};

export const applyServiceMutation = (
  action: AdminServiceAction,
  parsed: ReturnType<typeof parseServiceMutation>,
  links: ServiceLink[],
): ServiceLink[] => {
  if (action === "CREATE") {
    if (links.length >= MAX_LINKS) {
      throw new AdminServicesError(409, "SERVICE_STATE_INVALID", "Limite técnico atingido.");
    }
    const fields = parsed.fields!;
    return [
      ...links,
      { ...fields, type: "service", order: links.length + 1, clicks: 0, url: "" },
    ];
  }

  if (action === "EDIT") {
    const index = parsed.index!;
    const current = serviceAt(links, index);
    return links.map((link, currentIndex) =>
      currentIndex === index ? { ...current, ...parsed.fields! } : link
    );
  }

  if (action === "DELETE") {
    const index = parsed.index!;
    serviceAt(links, index);
    return links.filter((_, currentIndex) => currentIndex !== index)
      .map((link, currentIndex) => ({ ...link, order: currentIndex + 1 }));
  }

  const indices = parsed.indices!;
  if (
    indices.length !== links.length ||
    indices.some((index) => index < 0 || index >= links.length)
  ) {
    return invalidRequest("Ordem inválida.");
  }
  return indices.map((index, currentIndex) => ({ ...links[index], order: currentIndex + 1 }));
};

const errorResponse = (error: AdminServicesError): Response =>
  Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );

export const SERVICE_ACTION_METHOD: Record<AdminServiceAction, string> = {
  CREATE: "POST",
  EDIT: "PATCH",
  DELETE: "DELETE",
  REORDER: "PUT",
};

export const handleAdminServicesRequest = async (
  request: Request,
  action: AdminServiceAction,
  dependencies: AdminServicesDependencies,
): Promise<Response> => {
  let ownerId: string | undefined;
  try {
    if (request.method !== SERVICE_ACTION_METHOD[action] || new URL(request.url).search.length > 0) {
      return invalidRequest();
    }
    const context = await dependencies.requireCommercialAccess(request);
    ownerId = context.ownerId;
    if (!context.pageSlug) {
      throw new AdminServicesError(
        409,
        "TENANT_CONTEXT_REQUIRED",
        "Contexto de tenant necessário.",
      );
    }

    const body = await readServicesJsonBody(request);
    const parsed = parseServiceMutation(action, body);
    await dependencies.store.runLinksTransaction(context.pageSlug, (page) => {
      if (
        !page ||
        page.userId !== context.ownerId ||
        page.slug !== context.pageSlug
      ) {
        throw new AdminServicesError(409, "TENANT_INCONSISTENT", "Tenant inconsistente.");
      }
      const links = applyServiceMutation(action, parsed, canonicalServiceLinks(page));
      assertServiceLinksSize(links);
      return links;
    });

    return Response.json(
      { ok: true },
      { status: action === "CREATE" ? 201 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CommercialAccessError) return commercialAccessErrorResponse(error);
    if (error instanceof AdminServicesError) return errorResponse(error);
    dependencies.logError?.({ ownerId, error });
    return errorResponse(
      new AdminServicesError(503, "ADMIN_SERVICES_UNAVAILABLE", "Serviços indisponíveis."),
    );
  }
};
