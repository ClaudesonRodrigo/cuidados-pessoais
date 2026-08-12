import type { BillingRecord, StripeBillingStatus } from "./billingTypes.ts";

export class CheckoutStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutStoreConflictError";
  }
}

export type CheckoutIdentity = {
  uid: string;
  email?: string;
};

export type CheckoutUser = {
  role?: unknown;
  pageSlug?: unknown;
  email?: unknown;
  displayName?: unknown;
  trialDeadline?: unknown;
};

export type CheckoutPage = {
  userId?: unknown;
  slug?: unknown;
};

export type CheckoutAccountStore = {
  getUser(uid: string): Promise<CheckoutUser | null>;
  getPage(pageSlug: string): Promise<CheckoutPage | null>;
};

export type CheckoutOperationState =
  | "CUSTOMER_PROVISIONING"
  | "READY"
  | "CHECKOUT_PROVISIONING"
  | "CHECKOUT_OPEN";

export type BillingCheckoutState = {
  ownerId: string;
  pageSlug: string;
  stripeCustomerId?: string;
  customerProvisioningKey?: string;
  checkoutAttemptId?: string;
  checkoutSessionId?: string;
  checkoutSessionUrl?: string;
  checkoutExpiresAt?: Date;
  checkoutTrialEnd?: number;
  checkoutTrialPeriodDays?: number;
  operationStartedAt?: Date;
  operationLeaseUntil?: Date;
  operationState: CheckoutOperationState;
  createdAt: Date;
  updatedAt: Date;
};

export type CheckoutOperationalStore = {
  get(ownerId: string): Promise<BillingCheckoutState | null>;
  reserveCustomer(input: {
    ownerId: string;
    pageSlug: string;
    proposedProvisioningKey: string;
    now: Date;
    leaseUntil: Date;
  }): Promise<BillingCheckoutState>;
  bindCustomer(input: {
    ownerId: string;
    pageSlug: string;
    provisioningKey: string;
    stripeCustomerId: string;
    now: Date;
  }): Promise<BillingCheckoutState>;
  reserveCheckoutAttempt(input: {
    ownerId: string;
    pageSlug: string;
    proposedAttemptId: string;
    replaceAttemptId?: string;
    now: Date;
    leaseUntil: Date;
    expiresAt: Date;
    trialEnd?: number;
    trialPeriodDays?: number;
  }): Promise<BillingCheckoutState>;
  recordCheckoutSession(input: {
    ownerId: string;
    pageSlug: string;
    checkoutAttemptId: string;
    sessionId: string;
    sessionUrl: string;
    expiresAt: Date;
    now: Date;
  }): Promise<BillingCheckoutState>;
};

export type CheckoutPrice = {
  id: string;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  recurringInterval: string | null;
  livemode: boolean;
};

export type CheckoutCustomer = {
  id: string;
  deleted: boolean;
  livemode: boolean;
  metadata: Record<string, string>;
};

export type CheckoutSubscription = {
  id: string;
  status: StripeBillingStatus;
  customerId?: string;
};

export type HostedCheckoutSession = {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired" | string | null;
  expiresAt: number;
  subscriptionId?: string;
  customerId?: string;
  livemode: boolean;
  mode: string | null;
  clientReferenceId: string | null;
  metadata: Record<string, string>;
  priceIds: string[];
};

export type CheckoutSessionCreateInput = {
  mode: "subscription";
  customer: string;
  priceId: string;
  quantity: 1;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId: string;
  metadata: Record<string, string>;
  subscriptionMetadata: Record<string, string>;
  paymentMethodCollection: "always";
  expiresAt: number;
  trialEnd?: number;
  trialPeriodDays?: number;
};

export type CheckoutStripeGateway = {
  retrievePrice(priceId: string): Promise<CheckoutPrice | null>;
  retrieveCustomer(customerId: string): Promise<CheckoutCustomer | null>;
  createCustomer(
    input: {
      email?: string;
      name?: string;
      metadata: Record<string, string>;
    },
    idempotencyKey: string,
  ): Promise<CheckoutCustomer>;
  retrieveSubscription(subscriptionId: string): Promise<CheckoutSubscription | null>;
  listCustomerSubscriptions(customerId: string): Promise<CheckoutSubscription[]>;
  retrieveSession(sessionId: string): Promise<HostedCheckoutSession | null>;
  createSession(
    input: CheckoutSessionCreateInput,
    idempotencyKey: string,
  ): Promise<HostedCheckoutSession>;
};

export type CheckoutBillingReader = {
  getBillingByOwnerId(ownerId: string): Promise<BillingRecord | null>;
};

export type CheckoutConfig = {
  priceId: string;
  appUrl: string;
};

export type CheckoutDependencies = {
  verifyIdToken(token: string): Promise<CheckoutIdentity>;
  accounts: CheckoutAccountStore;
  operations: CheckoutOperationalStore;
  billing: CheckoutBillingReader;
  stripe: CheckoutStripeGateway;
  getConfig: () => CheckoutConfig;
  now: () => Date;
  createProvisioningKey: () => string;
  createCheckoutAttemptId: () => string;
  logError?: (context: { ownerId?: string; error: unknown }) => void;
};

export type CheckoutStatusGuard = BillingRecord["status"] | CheckoutSubscription["status"];
