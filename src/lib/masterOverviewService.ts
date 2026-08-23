import {
  SuperadminIdentityError,
  superadminIdentityErrorResponse,
  type SuperadminIdentity,
} from "./superadminIdentityService.ts";

const PAGE_SLUG_PATTERN = /^[a-z0-9-]{3,120}$/;
const MAX_OWNER_ID_LENGTH = 1_500;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type TenantUserReference = Readonly<{
  id: string;
  pageSlug: unknown;
  role: unknown;
}>;

export type TenantPageReference = Readonly<{
  id: string;
  userId: unknown;
  slug: unknown;
}>;

export type TenantReferences = Readonly<{
  users: readonly TenantUserReference[];
  pages: readonly TenantPageReference[];
}>;

export type MasterOverviewDto = Readonly<{
  tenants: Readonly<{ total: number }>;
  generatedAt: string;
}>;

export type MasterOverviewStore = {
  readTenantReferences(): Promise<TenantReferences>;
};

export type MasterOverviewDependencies = {
  requireSuperadminIdentity(request: Request): Promise<SuperadminIdentity>;
  store: MasterOverviewStore;
  now?(): Date;
  logError?(context: { phase: "overview"; error: unknown }): void;
};

type MasterOverviewErrorCode = "INVALID_REQUEST" | "MASTER_OVERVIEW_UNAVAILABLE";

export class MasterOverviewError extends Error {
  readonly status: number;
  readonly code: MasterOverviewErrorCode;

  constructor(status: number, code: MasterOverviewErrorCode, message: string) {
    super(message);
    this.name = "MasterOverviewError";
    this.status = status;
    this.code = code;
  }
}

const errorResponse = (error: MasterOverviewError): Response => Response.json(
  { error: { code: error.code, message: error.message } },
  { status: error.status, headers: { "Cache-Control": "no-store" } },
);

const validOwnerId = (value: string): boolean => (
  value.length > 0 &&
  value.length <= MAX_OWNER_ID_LENGTH &&
  !value.includes("/") &&
  !CONTROL_CHARACTERS.test(value)
);

export const countValidTenants = (references: TenantReferences): number => {
  if (!Array.isArray(references.users) || !Array.isArray(references.pages)) {
    throw new TypeError("Referências de tenant inválidas.");
  }

  const pagesBySlug = new Map<string, TenantPageReference>();
  for (const page of references.pages) {
    if (
      typeof page.id === "string" &&
      PAGE_SLUG_PATTERN.test(page.id) &&
      page.slug === page.id &&
      typeof page.userId === "string" &&
      validOwnerId(page.userId)
    ) {
      pagesBySlug.set(page.id, page);
    }
  }

  const ownerIds = new Set<string>();
  for (const user of references.users) {
    if (
      typeof user.id !== "string" ||
      !validOwnerId(user.id) ||
      user.role !== "owner" ||
      typeof user.pageSlug !== "string" ||
      !PAGE_SLUG_PATTERN.test(user.pageSlug)
    ) {
      continue;
    }
    const page = pagesBySlug.get(user.pageSlug);
    if (page?.userId === user.id) ownerIds.add(user.id);
  }
  return ownerIds.size;
};

export const getMasterOverview = async (
  store: MasterOverviewStore,
  now = new Date(),
): Promise<MasterOverviewDto> => {
  const generatedAt = new Date(now.getTime()).toISOString();
  const references = await store.readTenantReferences();
  return {
    tenants: { total: countValidTenants(references) },
    generatedAt,
  };
};

export const handleMasterOverviewRequest = async (
  request: Request,
  dependencies: MasterOverviewDependencies,
): Promise<Response> => {
  try {
    await dependencies.requireSuperadminIdentity(request);
    if (request.method !== "GET" || new URL(request.url).search.length > 0) {
      throw new MasterOverviewError(400, "INVALID_REQUEST", "Requisição inválida.");
    }
    const overview = await getMasterOverview(
      dependencies.store,
      (dependencies.now ?? (() => new Date()))(),
    );
    return Response.json(overview, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SuperadminIdentityError) {
      return superadminIdentityErrorResponse(error);
    }
    if (error instanceof MasterOverviewError) return errorResponse(error);
    dependencies.logError?.({ phase: "overview", error });
    return errorResponse(new MasterOverviewError(
      503,
      "MASTER_OVERVIEW_UNAVAILABLE",
      "Overview Master indisponível.",
    ));
  }
};
