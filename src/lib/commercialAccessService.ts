import {
  resolveCommercialEntitlement,
  type CommercialEntitlement,
} from "./commercialEntitlement.ts";
import type { BillingRecord } from "./billingTypes.ts";
import { isCredentialVerificationError } from "./onboardingService.ts";

const JWT_STRUCTURE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const PAGE_SLUG_PATTERN = /^[a-z0-9-]{3,120}$/;
const ALLOWED_COMMERCIAL_STATES = new Set<CommercialEntitlement["state"]>([
  "ADMIN_BYPASS",
  "ACTIVE",
  "TRIAL_ACTIVE",
  "PAST_DUE_GRACE",
]);

type AccountDocument = Record<string, unknown>;

export type CommercialIdentity = Readonly<{ uid: string }>;

export type CommercialContext = Readonly<{
  identity: CommercialIdentity;
  ownerId: string;
  pageSlug: string | null;
  entitlement: CommercialEntitlement;
}>;

export type CommercialContextDependencies = {
  verifyIdToken(token: string): Promise<CommercialIdentity>;
  accounts: {
    getUser(uid: string): Promise<AccountDocument | null>;
    getPage(pageSlug: string): Promise<AccountDocument | null>;
  };
  billing: {
    getBillingByOwnerId(ownerId: string): Promise<BillingRecord | null>;
  };
  now(): Date;
};

export type CommercialAccessErrorCode =
  | "UNAUTHORIZED"
  | "ACCOUNT_NOT_READY"
  | "TENANT_INCONSISTENT"
  | "COMMERCIAL_ACCESS_BLOCKED"
  | "COMMERCIAL_CONTEXT_UNAVAILABLE";

export class CommercialAccessError extends Error {
  readonly status: number;
  readonly code: CommercialAccessErrorCode;

  constructor(status: number, code: CommercialAccessErrorCode, message: string) {
    super(message);
    this.name = "CommercialAccessError";
    this.status = status;
    this.code = code;
  }
}

export type CommercialContextSnapshot = Readonly<{
  context: CommercialContext;
  billing: BillingRecord | null;
}>;

const unavailable = (): CommercialAccessError =>
  new CommercialAccessError(
    503,
    "COMMERCIAL_CONTEXT_UNAVAILABLE",
    "Contexto comercial indisponível.",
  );

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
};

const noDateValue = (value: unknown): boolean => value === undefined || value === null;

const resolveLegacySources = (
  ownerId: string,
  user: AccountDocument,
  page: AccountDocument,
) => {
  const userTrial = dateValue(user.trialDeadline);
  const pageTrial = dateValue(page.trialDeadline);
  const plansAgree = user.plan === "pro" && page.plan === "pro";
  const trialsAgree = Boolean(
    userTrial && pageTrial && userTrial.getTime() === pageTrial.getTime(),
  );

  return {
    legacyGrant: plansAgree && noDateValue(user.trialDeadline) && noDateValue(page.trialDeadline)
      ? { ownerId, active: true as const, source: "legacy_grant" as const }
      : null,
    promotionalTrial: plansAgree && trialsAgree && userTrial
      ? { ownerId, endsAt: userTrial }
      : null,
  };
};
export const resolveCommercialEntitlementForAccounts = (
  ownerId: string,
  user: AccountDocument,
  page: AccountDocument,
  billing: BillingRecord | null,
  now: Date,
): CommercialEntitlement => {
  const { legacyGrant, promotionalTrial } = resolveLegacySources(ownerId, user, page);
  return resolveCommercialEntitlement({
    identity: { uid: ownerId },
    billing,
    legacyGrant,
    promotionalTrial,
    now,
  });
};

export const resolveCommercialContextSnapshot = async (
  identity: CommercialIdentity,
  dependencies: Omit<CommercialContextDependencies, "verifyIdToken">,
  options: Readonly<{ enforceBillingTenant?: boolean }> = {},
): Promise<CommercialContextSnapshot> => {
  const ownerId = identity.uid;
  if (typeof ownerId !== "string" || ownerId.length === 0) {
    throw new CommercialAccessError(401, "UNAUTHORIZED", "Token inválido.");
  }

  const now = dependencies.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw unavailable();

  const identityOnlyEntitlement = resolveCommercialEntitlement({ identity, now });
  if (identityOnlyEntitlement.state === "ADMIN_BYPASS") {
    return {
      context: {
        identity: { uid: ownerId },
        ownerId,
        pageSlug: null,
        entitlement: identityOnlyEntitlement,
      },
      billing: null,
    };
  }

  const user = await dependencies.accounts.getUser(ownerId);
  if (
    !user ||
    user.role !== "owner" ||
    typeof user.pageSlug !== "string" ||
    !PAGE_SLUG_PATTERN.test(user.pageSlug)
  ) {
    throw new CommercialAccessError(403, "ACCOUNT_NOT_READY", "Conta comercial inválida.");
  }

  const pageSlug = user.pageSlug;
  const page = await dependencies.accounts.getPage(pageSlug);
  if (!page || page.userId !== ownerId || page.slug !== pageSlug) {
    throw new CommercialAccessError(403, "TENANT_INCONSISTENT", "Tenant comercial inconsistente.");
  }

  const billing = await dependencies.billing.getBillingByOwnerId(ownerId);
  if (
    options.enforceBillingTenant !== false &&
    billing &&
    (billing.ownerId !== ownerId || billing.pageSlug !== pageSlug)
  ) {
    throw new CommercialAccessError(403, "TENANT_INCONSISTENT", "Tenant comercial inconsistente.");
  }

  const entitlement = resolveCommercialEntitlementForAccounts(
    ownerId,
    user,
    page,
    billing,
    now,
  );

  return {
    context: { identity: { uid: ownerId }, ownerId, pageSlug, entitlement },
    billing,
  };
};

export const resolveCommercialContext = async (
  identity: CommercialIdentity,
  dependencies: Omit<CommercialContextDependencies, "verifyIdToken">,
): Promise<CommercialContext> =>
  (await resolveCommercialContextSnapshot(identity, dependencies)).context;

export const resolveAuthenticatedCommercialContext = async (
  request: Request,
  dependencies: CommercialContextDependencies,
): Promise<CommercialContext> => {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match || !JWT_STRUCTURE_PATTERN.test(match[1])) {
    throw new CommercialAccessError(401, "UNAUTHORIZED", "Autenticação necessária.");
  }

  let identity: CommercialIdentity;
  try {
    const decoded = await dependencies.verifyIdToken(match[1]);
    identity = { uid: decoded.uid };
  } catch (error) {
    if (isCredentialVerificationError(error)) {
      throw new CommercialAccessError(401, "UNAUTHORIZED", "Token inválido.");
    }
    throw unavailable();
  }

  try {
    return await resolveCommercialContext(identity, dependencies);
  } catch (error) {
    if (error instanceof CommercialAccessError) throw error;
    throw unavailable();
  }
};

export const requireCommercialAccess = async (
  request: Request,
  dependencies: CommercialContextDependencies,
): Promise<CommercialContext> => {
  const context = await resolveAuthenticatedCommercialContext(request, dependencies);
  if (!ALLOWED_COMMERCIAL_STATES.has(context.entitlement.state)) {
    throw new CommercialAccessError(
      403,
      "COMMERCIAL_ACCESS_BLOCKED",
      "Acesso comercial bloqueado.",
    );
  }
  return context;
};

export const commercialAccessErrorResponse = (error: CommercialAccessError): Response =>
  Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
