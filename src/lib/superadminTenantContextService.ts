import { isCredentialVerificationError } from "./onboardingService.ts";

const JWT_STRUCTURE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const PAGE_SLUG_PATTERN = /^[a-z0-9-]{3,120}$/;
const MAX_TARGET_OWNER_ID_LENGTH = 200;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

type AccountDocument = Record<string, unknown>;

export type SuperadminTenantContext = Readonly<{
  identity: Readonly<{ uid: string }>;
  targetOwnerId: string;
  pageSlug: string;
}>;

export type SuperadminTenantContextDependencies = {
  verifyIdToken(token: string): Promise<{ uid: string }>;
  isOfficialSuperAdminUid(uid: string): boolean;
  accounts: {
    getUser(targetOwnerId: string): Promise<AccountDocument | null>;
    getPage(pageSlug: string): Promise<AccountDocument | null>;
  };
  logError?(context: { phase: "verify" | "target"; error: unknown }): void;
};

type SuperadminTenantContextErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "SUPERADMIN_REQUIRED"
  | "TARGET_TENANT_NOT_FOUND"
  | "SUPERADMIN_CONTEXT_UNAVAILABLE";

export class SuperadminTenantContextError extends Error {
  readonly status: number;
  readonly code: SuperadminTenantContextErrorCode;

  constructor(status: number, code: SuperadminTenantContextErrorCode, message: string) {
    super(message);
    this.name = "SuperadminTenantContextError";
    this.status = status;
    this.code = code;
  }
}

const unavailable = () => new SuperadminTenantContextError(
  503,
  "SUPERADMIN_CONTEXT_UNAVAILABLE",
  "Contexto Master indisponível.",
);

const validateTargetOwnerId = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new SuperadminTenantContextError(400, "INVALID_REQUEST", "targetOwnerId inválido.");
  }
  const targetOwnerId = value.trim();
  if (
    targetOwnerId.length === 0 ||
    targetOwnerId.length > MAX_TARGET_OWNER_ID_LENGTH ||
    targetOwnerId.includes("/") ||
    CONTROL_CHARACTERS.test(targetOwnerId)
  ) {
    throw new SuperadminTenantContextError(400, "INVALID_REQUEST", "targetOwnerId inválido.");
  }
  return targetOwnerId;
};

export const resolveSuperadminTenantContext = async (
  identity: Readonly<{ uid: string }>,
  targetOwnerIdInput: unknown,
  dependencies: Omit<SuperadminTenantContextDependencies, "verifyIdToken">,
): Promise<SuperadminTenantContext> => {
  if (!dependencies.isOfficialSuperAdminUid(identity.uid)) {
    throw new SuperadminTenantContextError(403, "SUPERADMIN_REQUIRED", "Superadmin necessário.");
  }

  const targetOwnerId = validateTargetOwnerId(targetOwnerIdInput);
  try {
    const user = await dependencies.accounts.getUser(targetOwnerId);
    if (!user || typeof user.pageSlug !== "string" || !PAGE_SLUG_PATTERN.test(user.pageSlug)) {
      throw new SuperadminTenantContextError(404, "TARGET_TENANT_NOT_FOUND", "Tenant alvo não encontrado.");
    }
    const pageSlug = user.pageSlug;
    const page = await dependencies.accounts.getPage(pageSlug);
    if (!page || page.userId !== targetOwnerId || page.slug !== pageSlug) {
      throw new SuperadminTenantContextError(404, "TARGET_TENANT_NOT_FOUND", "Tenant alvo não encontrado.");
    }
    return { identity: { uid: identity.uid }, targetOwnerId, pageSlug };
  } catch (error) {
    if (error instanceof SuperadminTenantContextError) throw error;
    dependencies.logError?.({ phase: "target", error });
    throw unavailable();
  }
};

export const requireSuperadminTenantContext = async (
  request: Request,
  targetOwnerId: unknown,
  dependencies: SuperadminTenantContextDependencies,
): Promise<SuperadminTenantContext> => {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match || !JWT_STRUCTURE_PATTERN.test(match[1])) {
    throw new SuperadminTenantContextError(401, "UNAUTHORIZED", "Autenticação necessária.");
  }

  let identity: { uid: string };
  try {
    const decoded = await dependencies.verifyIdToken(match[1]);
    identity = { uid: decoded.uid };
  } catch (error) {
    if (isCredentialVerificationError(error)) {
      throw new SuperadminTenantContextError(401, "UNAUTHORIZED", "Token inválido.");
    }
    dependencies.logError?.({ phase: "verify", error });
    throw unavailable();
  }

  return resolveSuperadminTenantContext(identity, targetOwnerId, dependencies);
};

export const superadminTenantContextErrorResponse = (
  error: SuperadminTenantContextError,
): Response => Response.json(
  { error: { code: error.code, message: error.message } },
  { status: error.status, headers: { "Cache-Control": "no-store" } },
);
