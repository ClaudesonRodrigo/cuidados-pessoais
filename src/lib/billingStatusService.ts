import { isOfficialSuperAdminUid } from "./adminIdentity.ts";
import {
  resolveCommercialEntitlement,
  type CommercialEntitlement,
  type CommercialEntitlementSource,
  type CommercialEntitlementState,
} from "./commercialEntitlement.ts";
import type { BillingRecord, StripeBillingStatus } from "./billingTypes.ts";
import type { BillingCheckoutState, CheckoutIdentity } from "./checkoutTypes.ts";
import {
  CustomerPortalError,
  resolveValidatedPortalCustomer,
  type CustomerPortalCustomer,
} from "./customerPortalService.ts";

const JWT_STRUCTURE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export type BillingStatusDto = {
  state: CommercialEntitlementState;
  source: CommercialEntitlementSource;
  billingStatus?: StripeBillingStatus;
  accessUntil?: string;
  requiresPaymentAction: boolean;
  canOpenPortal: boolean;
  canSubscribe: boolean;
};

type AccountDocument = Record<string, unknown>;

export type BillingStatusDependencies = {
  verifyIdToken(token: string): Promise<CheckoutIdentity>;
  accounts: {
    getUser(uid: string): Promise<AccountDocument | null>;
    getPage(pageSlug: string): Promise<AccountDocument | null>;
  };
  billing: {
    getBillingByOwnerId(ownerId: string): Promise<BillingRecord | null>;
  };
  checkoutState: {
    get(ownerId: string): Promise<BillingCheckoutState | null>;
  };
  stripe: {
    retrieveCustomer(customerId: string): Promise<CustomerPortalCustomer | null>;
  };
  now(): Date;
  logError?(context: { ownerId?: string; error: unknown }): void;
};

export type BillingStatusErrorCode =
  | "UNAUTHORIZED"
  | "ACCOUNT_NOT_READY"
  | "BILLING_UNAVAILABLE";

export class BillingStatusError extends Error {
  readonly status: number;
  readonly code: BillingStatusErrorCode;

  constructor(status: number, code: BillingStatusErrorCode, message: string) {
    super(message);
    this.name = "BillingStatusError";
    this.status = status;
    this.code = code;
  }
}

export class InvalidBillingStatusTokenError extends Error {
  constructor() {
    super("Invalid Firebase ID token.");
    this.name = "InvalidBillingStatusTokenError";
  }
}

export const verifyBillingStatusIdToken = async (
  token: string,
  verify: (token: string) => Promise<CheckoutIdentity>,
): Promise<CheckoutIdentity> => {
  if (!JWT_STRUCTURE_PATTERN.test(token)) throw new InvalidBillingStatusTokenError();
  try {
    return await verify(token);
  } catch {
    throw new InvalidBillingStatusTokenError();
  }
};

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

const checkoutAllowsSubscription = (status?: StripeBillingStatus): boolean =>
  status === undefined || status === "canceled" || status === "incomplete_expired";

const blockedDto = (): BillingStatusDto => ({
  state: "BLOCKED",
  source: "none",
  requiresPaymentAction: false,
  canOpenPortal: false,
  canSubscribe: false,
});

const entitlementDto = (
  entitlement: CommercialEntitlement,
  billingStatus: StripeBillingStatus | undefined,
  canOpenPortal: boolean,
  canSubscribe: boolean,
): BillingStatusDto => ({
  state: entitlement.state,
  source: entitlement.source,
  ...(billingStatus ? { billingStatus } : {}),
  ...(entitlement.accessUntil ? { accessUntil: entitlement.accessUntil.toISOString() } : {}),
  requiresPaymentAction: entitlement.requiresPaymentAction,
  canOpenPortal,
  canSubscribe,
});

export const resolveBillingStatus = async (
  identity: CheckoutIdentity,
  dependencies: BillingStatusDependencies,
): Promise<BillingStatusDto> => {
  const ownerId = identity.uid;
  if (isOfficialSuperAdminUid(ownerId)) {
    return {
      state: "ADMIN_BYPASS",
      source: "superadmin",
      requiresPaymentAction: false,
      canOpenPortal: false,
      canSubscribe: false,
    };
  }

  const user = await dependencies.accounts.getUser(ownerId);
  if (
    !user ||
    user.role !== "owner" ||
    typeof user.pageSlug !== "string" ||
    !/^[a-z0-9-]{3,120}$/.test(user.pageSlug)
  ) {
    throw new BillingStatusError(409, "ACCOUNT_NOT_READY", "Conta ainda não preparada.");
  }

  const pageSlug = user.pageSlug;
  const page = await dependencies.accounts.getPage(pageSlug);
  if (!page || page.userId !== ownerId || page.slug !== pageSlug) {
    throw new BillingStatusError(409, "ACCOUNT_NOT_READY", "Conta ainda não preparada.");
  }

  const [billing, checkoutState] = await Promise.all([
    dependencies.billing.getBillingByOwnerId(ownerId),
    dependencies.checkoutState.get(ownerId),
  ]);

  let canOpenPortal = false;
  try {
    await resolveValidatedPortalCustomer(ownerId, pageSlug, {
      billing,
      checkoutState,
      retrieveCustomer: dependencies.stripe.retrieveCustomer,
    });
    canOpenPortal = true;
  } catch (error) {
    if (!(error instanceof CustomerPortalError)) throw error;
    if (error.code !== "PORTAL_NOT_AVAILABLE") return blockedDto();
  }

  const now = dependencies.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new BillingStatusError(503, "BILLING_UNAVAILABLE", "Billing indisponível.");
  }

  const { legacyGrant, promotionalTrial } = resolveLegacySources(ownerId, user, page);
  const entitlement = resolveCommercialEntitlement({
    identity: { uid: ownerId },
    billing,
    legacyGrant,
    promotionalTrial,
    now,
  });
  return entitlementDto(
    entitlement,
    billing?.status,
    canOpenPortal,
    checkoutAllowsSubscription(billing?.status),
  );
};

const errorResponse = (error: BillingStatusError): Response =>
  Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );

export const handleBillingStatusRequest = async (
  request: Request,
  dependencies: BillingStatusDependencies,
): Promise<Response> => {
  let ownerId: string | undefined;
  try {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match) {
      throw new BillingStatusError(401, "UNAUTHORIZED", "Autenticação necessária.");
    }

    let identity: CheckoutIdentity;
    try {
      identity = await dependencies.verifyIdToken(match[1]);
    } catch (error) {
      if (error instanceof InvalidBillingStatusTokenError) {
        throw new BillingStatusError(401, "UNAUTHORIZED", "Token inválido.");
      }
      throw error;
    }
    ownerId = identity.uid;
    const result = await resolveBillingStatus(identity, dependencies);
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof BillingStatusError) return errorResponse(error);
    dependencies.logError?.({ ownerId, error });
    return errorResponse(
      new BillingStatusError(503, "BILLING_UNAVAILABLE", "Billing indisponível."),
    );
  }
};
