import {
  SuperadminTenantContextError,
  superadminTenantContextErrorResponse,
  type SuperadminTenantContext,
} from "./superadminTenantContextService.ts";

const MAX_BODY_BYTES = 4_096;

export type MasterPlan = "free" | "pro";

export type MasterPlanStore = {
  updatePlanAtomically(
    targetOwnerId: string,
    pageSlug: string,
    plan: MasterPlan,
  ): Promise<void>;
};

export type MasterPlanDependencies = {
  requireSuperadminTenantContext(
    request: Request,
    targetOwnerId: unknown,
  ): Promise<SuperadminTenantContext>;
  store: MasterPlanStore;
  logError?(context: { targetOwnerId?: string; error: unknown }): void;
};

type MasterPlanErrorCode =
  | "INVALID_REQUEST"
  | "TENANT_INCONSISTENT"
  | "MASTER_PLAN_UNAVAILABLE";

export class MasterPlanError extends Error {
  readonly status: number;
  readonly code: MasterPlanErrorCode;

  constructor(status: number, code: MasterPlanErrorCode, message: string) {
    super(message);
    this.name = "MasterPlanError";
    this.status = status;
    this.code = code;
  }
}

const invalidRequest = (): never => {
  throw new MasterPlanError(400, "INVALID_REQUEST", "Requisição inválida.");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readBody = async (request: Request): Promise<Record<string, unknown>> => {
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
      return invalidRequest();
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

const parseClosedBody = (body: Record<string, unknown>): { targetOwnerId: unknown; plan: MasterPlan } => {
  const keys = Object.keys(body);
  if (
    keys.length !== 2 ||
    !Object.prototype.hasOwnProperty.call(body, "targetOwnerId") ||
    !Object.prototype.hasOwnProperty.call(body, "plan") ||
    (body.plan !== "free" && body.plan !== "pro")
  ) {
    return invalidRequest();
  }
  return { targetOwnerId: body.targetOwnerId, plan: body.plan as MasterPlan };
};

const errorResponse = (error: MasterPlanError): Response => Response.json(
  { error: { code: error.code, message: error.message } },
  { status: error.status, headers: { "Cache-Control": "no-store" } },
);

export const handleMasterPlanRequest = async (
  request: Request,
  dependencies: MasterPlanDependencies,
): Promise<Response> => {
  let targetOwnerId: string | undefined;
  try {
    if (request.method !== "PATCH" || new URL(request.url).search.length > 0) {
      return invalidRequest();
    }
    const input = parseClosedBody(await readBody(request));
    const context = await dependencies.requireSuperadminTenantContext(
      request,
      input.targetOwnerId,
    );
    targetOwnerId = context.targetOwnerId;
    await dependencies.store.updatePlanAtomically(
      context.targetOwnerId,
      context.pageSlug,
      input.plan,
    );
    return Response.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperadminTenantContextError) {
      return superadminTenantContextErrorResponse(error);
    }
    if (error instanceof MasterPlanError) return errorResponse(error);
    dependencies.logError?.({ targetOwnerId, error });
    return errorResponse(
      new MasterPlanError(503, "MASTER_PLAN_UNAVAILABLE", "Plano indisponível."),
    );
  }
};
