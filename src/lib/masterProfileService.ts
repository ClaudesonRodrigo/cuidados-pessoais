import {
  AdminProfileError,
  readProfileJsonBody,
  validateProfileUpdate,
  type AdminProfileStore,
} from "./adminProfileService.ts";
import {
  SuperadminTenantContextError,
  superadminTenantContextErrorResponse,
  type SuperadminTenantContext,
} from "./superadminTenantContextService.ts";

export type MasterProfileDependencies = {
  requireSuperadminTenantContext(
    request: Request,
    targetOwnerId: unknown,
  ): Promise<SuperadminTenantContext>;
  store: AdminProfileStore;
  logError?(context: { targetOwnerId?: string; error: unknown }): void;
};

const errorResponse = (error: AdminProfileError): Response => Response.json(
  { error: { code: error.code, message: error.message } },
  { status: error.status, headers: { "Cache-Control": "no-store" } },
);

const invalidRequest = (): never => {
  throw new AdminProfileError(400, "INVALID_REQUEST", "Requisição inválida.");
};

const parseClosedBody = (body: Record<string, unknown>) => {
  const keys = Object.keys(body);
  if (
    keys.length !== 2 ||
    !Object.prototype.hasOwnProperty.call(body, "targetOwnerId") ||
    !Object.prototype.hasOwnProperty.call(body, "update") ||
    typeof body.update !== "object" ||
    body.update === null ||
    Array.isArray(body.update)
  ) {
    return invalidRequest();
  }
  return {
    targetOwnerId: body.targetOwnerId,
    update: body.update as Record<string, unknown>,
  };
};

export const handleMasterProfileRequest = async (
  request: Request,
  dependencies: MasterProfileDependencies,
): Promise<Response> => {
  let targetOwnerId: string | undefined;
  try {
    if (request.method !== "PATCH" || new URL(request.url).search.length > 0) {
      return invalidRequest();
    }
    const input = parseClosedBody(await readProfileJsonBody(request));
    const context = await dependencies.requireSuperadminTenantContext(
      request,
      input.targetOwnerId,
    );
    targetOwnerId = context.targetOwnerId;
    const update = validateProfileUpdate(input.update);

    await dependencies.store.runProfileTransaction(context.pageSlug, (page) => {
      if (!page || page.userId !== context.targetOwnerId || page.slug !== context.pageSlug) {
        throw new AdminProfileError(409, "TENANT_INCONSISTENT", "Tenant inconsistente.");
      }
      return update;
    });

    return Response.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperadminTenantContextError) {
      return superadminTenantContextErrorResponse(error);
    }
    if (error instanceof AdminProfileError) return errorResponse(error);
    dependencies.logError?.({ targetOwnerId, error });
    return errorResponse(
      new AdminProfileError(503, "MASTER_PROFILE_UNAVAILABLE", "Perfil indisponível."),
    );
  }
};
