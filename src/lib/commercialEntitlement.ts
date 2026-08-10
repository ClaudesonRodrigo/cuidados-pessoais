import { isOfficialSuperAdminUid } from "./adminIdentity.ts";
import type {
  BillingRecord,
  LegacyCommercialGrant,
  PromotionalTrial,
  StripeBillingStatus,
} from "./billingTypes.ts";

export const PAST_DUE_GRACE_DAYS = 3;
export const PAST_DUE_GRACE_MS = PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1_000;

export type CommercialEntitlementState =
  | "ADMIN_BYPASS"
  | "TRIAL_ACTIVE"
  | "ACTIVE"
  | "PAST_DUE_GRACE"
  | "BLOCKED";

export type CommercialEntitlementSource =
  | "superadmin"
  | "stripe"
  | "legacy_grant"
  | "promotional_trial"
  | "none";

export type CommercialEntitlement = {
  state: CommercialEntitlementState;
  source: CommercialEntitlementSource;
  accessUntil?: Date;
  billingStatus?: StripeBillingStatus;
  requiresPaymentAction: boolean;
};

export type CommercialIdentity = {
  uid: string;
};

export type ResolveCommercialEntitlementInput = {
  identity: CommercialIdentity;
  billing?: BillingRecord | null;
  promotionalTrial?: PromotionalTrial | null;
  legacyGrant?: LegacyCommercialGrant | null;
  now: Date;
};

const belongsToOwner = (ownerId: string, identity: CommercialIdentity): boolean =>
  ownerId === identity.uid;

export const resolveCommercialEntitlement = ({
  identity,
  billing,
  promotionalTrial,
  legacyGrant,
  now,
}: ResolveCommercialEntitlementInput): CommercialEntitlement => {
  if (isOfficialSuperAdminUid(identity.uid)) {
    return {
      state: "ADMIN_BYPASS",
      source: "superadmin",
      requiresPaymentAction: false,
    };
  }

  const ownerBilling = billing && belongsToOwner(billing.ownerId, identity) ? billing : null;
  if (ownerBilling?.status === "active" || ownerBilling?.status === "trialing") {
    return {
      state: "ACTIVE",
      source: "stripe",
      accessUntil: ownerBilling.currentPeriodEnd,
      billingStatus: ownerBilling.status,
      requiresPaymentAction: false,
    };
  }

  if (ownerBilling?.status === "past_due" && ownerBilling.pastDueSince) {
    const graceEnd = new Date(ownerBilling.pastDueSince.getTime() + PAST_DUE_GRACE_MS);
    if (Number.isFinite(graceEnd.getTime()) && now.getTime() < graceEnd.getTime()) {
      return {
        state: "PAST_DUE_GRACE",
        source: "stripe",
        accessUntil: graceEnd,
        billingStatus: "past_due",
        requiresPaymentAction: true,
      };
    }
  }

  if (legacyGrant?.active && belongsToOwner(legacyGrant.ownerId, identity)) {
    return {
      state: "ACTIVE",
      source: "legacy_grant",
      requiresPaymentAction: false,
    };
  }

  if (
    promotionalTrial &&
    belongsToOwner(promotionalTrial.ownerId, identity) &&
    Number.isFinite(promotionalTrial.endsAt.getTime()) &&
    now.getTime() < promotionalTrial.endsAt.getTime()
  ) {
    return {
      state: "TRIAL_ACTIVE",
      source: "promotional_trial",
      accessUntil: promotionalTrial.endsAt,
      requiresPaymentAction: false,
    };
  }

  return {
    state: "BLOCKED",
    source: ownerBilling ? "stripe" : "none",
    billingStatus: ownerBilling?.status,
    requiresPaymentAction:
      ownerBilling?.status === "past_due" ||
      ownerBilling?.status === "unpaid" ||
      ownerBilling?.status === "incomplete",
  };
};
