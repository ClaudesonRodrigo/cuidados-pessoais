import {
  AdminServicesError,
  SERVICE_ACTION_METHOD,
  applyServiceMutation,
  assertServiceLinksSize,
  canonicalServiceLinks,
  parseServiceMutation,
  readServicesJsonBody,
  type AdminServiceAction,
  type AdminServicesStore,
} from "./adminServicesService.ts";
import {
  SuperadminTenantContextError,
  superadminTenantContextErrorResponse,
  type SuperadminTenantContext,
} from "./superadminTenantContextService.ts";

export type MasterServicesDependencies = {
  requireSuperadminTenantContext(
    request: Request,
    targetOwnerId: unknown,
  ): Promise<SuperadminTenantContext>;
  store: AdminServicesStore;
  logError?(context: { targetOwnerId?: string; error: unknown }): void;
};

const errorResponse = (error: AdminServicesError): Response => Response.json(
  { error: { code: error.code, message: error.message } },
  { status: error.status, headers: { "Cache-Control": "no-store" } },
);

const invalidRequest = (): never => {
  throw new AdminServicesError(400, "INVALID_REQUEST", "Requisição inválida.");
};

const splitMasterBody = (body: Record<string, unknown>) => {
  if (!Object.prototype.hasOwnProperty.call(body, "targetOwnerId")) return invalidRequest();
  return {
    targetOwnerId: body.targetOwnerId,
    mutation: Object.fromEntries(
      Object.entries(body).filter(([key]) => key !== "targetOwnerId"),
    ),
  };
};

export const handleMasterServicesRequest = async (
  request: Request,
  action: AdminServiceAction,
  dependencies: MasterServicesDependencies,
): Promise<Response> => {
  let targetOwnerId: string | undefined;
  try {
    if (request.method !== SERVICE_ACTION_METHOD[action] || new URL(request.url).search.length > 0) {
      return invalidRequest();
    }

    const input = splitMasterBody(await readServicesJsonBody(request));
    const context = await dependencies.requireSuperadminTenantContext(
      request,
      input.targetOwnerId,
    );
    targetOwnerId = context.targetOwnerId;
    const parsed = parseServiceMutation(action, input.mutation);

    await dependencies.store.runLinksTransaction(context.pageSlug, (page) => {
      if (!page || page.userId !== context.targetOwnerId || page.slug !== context.pageSlug) {
        throw new AdminServicesError(409, "TENANT_INCONSISTENT", "Tenant inconsistente.");
      }
      const links = applyServiceMutation(
        action,
        parsed,
        canonicalServiceLinks(page),
      );
      assertServiceLinksSize(links);
      return links;
    });

    return Response.json(
      { ok: true },
      { status: action === "CREATE" ? 201 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperadminTenantContextError) {
      return superadminTenantContextErrorResponse(error);
    }
    if (error instanceof AdminServicesError) return errorResponse(error);
    dependencies.logError?.({ targetOwnerId, error });
    return errorResponse(
      new AdminServicesError(503, "MASTER_SERVICES_UNAVAILABLE", "Serviços indisponíveis."),
    );
  }
};
