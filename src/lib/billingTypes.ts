export const STRIPE_BILLING_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const;

export type StripeBillingStatus = (typeof STRIPE_BILLING_STATUSES)[number];

export type BillingRecord = {
  ownerId: string;
  pageSlug: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  status?: StripeBillingStatus;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  pastDueSince?: Date;
  createdAt: Date;
  updatedAt: Date;
  lastStripeEventId?: string;
  lastStripeEventCreated?: number;
};

/** Estado financeiro completo recuperado da Stripe, nunca um patch do frontend. */
export type BillingStripeSnapshot = {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  status?: StripeBillingStatus;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  pastDueSince?: Date;
};

export type StripeEventCursor = {
  id: string;
  created: number;
};

export type BillingProjectionDecision =
  | "APPLIED"
  | "DUPLICATE"
  | "STALE"
  | "REQUIRES_STRIPE_SYNC";

export type BillingProjectionResult = {
  decision: BillingProjectionDecision;
  billing: BillingRecord | null;
};

export type LegacyCommercialGrant = {
  ownerId: string;
  active: boolean;
  source: "legacy_grant";
  grantedAt?: Date;
  reason?: string;
};

export type PromotionalTrial = {
  ownerId: string;
  endsAt: Date;
};
