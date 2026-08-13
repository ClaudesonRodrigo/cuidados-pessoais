import type {
  BillingProjectionResult,
  BillingRecord,
  BillingStripeSnapshot,
  StripeBillingStatus,
  StripeEventCursor,
} from "./billingTypes.ts";
import { STRIPE_BILLING_STATUSES } from "./billingTypes.ts";
import {
  MissingWebhookSecretError,
  type WebhookServerConfig,
} from "./webhookConfig.ts";

export const SUPPORTED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

type SupportedWebhookEvent = (typeof SUPPORTED_WEBHOOK_EVENTS)[number];

export type StripeWebhookEvent = StripeEventCursor & {
  type: string;
  object: Record<string, unknown>;
};

export type CanonicalSubscription = {
  id: string;
  customerId: string;
  livemode: boolean;
  status: string;
  metadata: Record<string, string>;
  items: Array<{ priceId: string; currentPeriodEnd?: number }>;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd: boolean;
};

export type CanonicalCustomer = {
  id: string;
  deleted: boolean;
  livemode: boolean;
  metadata: Record<string, string>;
};

export type WebhookBinding = {
  ownerId: string;
  pageSlug?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

export type WebhookDependencies = {
  constructEvent(rawBody: string, signature: string, secret: string): StripeWebhookEvent;
  stripe: {
    retrieveSubscription(id: string): Promise<CanonicalSubscription>;
    retrieveCustomer(id: string): Promise<CanonicalCustomer>;
  };
  accounts: {
    findBindings(customerId: string, subscriptionId: string): Promise<WebhookBinding[]>;
    getUser(ownerId: string): Promise<Record<string, unknown> | null>;
    getPage(pageSlug: string): Promise<Record<string, unknown> | null>;
    getCheckoutState(ownerId: string): Promise<WebhookBinding | null>;
  };
  billing: {
    getBillingByOwnerId(ownerId: string): Promise<BillingRecord | null>;
    apply(input: {
      ownerId: string;
      pageSlug: string;
      event: StripeEventCursor;
      snapshot: BillingStripeSnapshot;
    }): Promise<BillingProjectionResult>;
    reconcile(input: {
      ownerId: string;
      pageSlug: string;
      event: StripeEventCursor;
      snapshot: BillingStripeSnapshot;
    }): Promise<BillingProjectionResult>;
  };
  getConfig(): WebhookServerConfig;
  log(context: {
    eventId?: string;
    eventType?: string;
    eventCreated?: number;
    result?: string;
    category?: string;
  }): void;
};

export class WebhookConflictError extends Error {}

const valueId = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return undefined;
};

const subscriptionIdForEvent = (
  type: SupportedWebhookEvent,
  object: Record<string, unknown>,
): string | undefined => {
  if (type === "checkout.session.completed") {
    if (object.mode !== "subscription") {
      throw new WebhookConflictError("Checkout Session fora do modo subscription.");
    }
    return valueId(object.subscription);
  }
  if (type.startsWith("customer.subscription.")) return valueId(object.id);

  const legacy = valueId(object.subscription);
  if (legacy) return legacy;
  const parent = object.parent;
  if (!parent || typeof parent !== "object") return undefined;
  const details = "subscription_details" in parent ? parent.subscription_details : undefined;
  return details && typeof details === "object" && "subscription" in details
    ? valueId(details.subscription)
    : undefined;
};

const metadataValue = (
  metadata: Record<string, string>,
  key: "beautyProOwnerId" | "beautyProPageSlug",
): string | undefined => metadata[key] || undefined;

const singleEvidence = (values: Array<string | undefined>, label: string): string | undefined => {
  const distinct = [...new Set(values.filter((value): value is string => Boolean(value)))];
  if (distinct.length > 1) throw new WebhookConflictError(`Binding ${label} conflitante.`);
  return distinct[0];
};

const validateMetadataAgreement = (
  subscription: CanonicalSubscription,
  customer: CanonicalCustomer,
): void => {
  for (const key of ["beautyProOwnerId", "beautyProPageSlug"] as const) {
    const fromSubscription = metadataValue(subscription.metadata, key);
    const fromCustomer = metadataValue(customer.metadata, key);
    if (fromSubscription && fromCustomer && fromSubscription !== fromCustomer) {
      throw new WebhookConflictError("Metadata Stripe conflitante.");
    }
  }
};

const assertBinding = (
  binding: WebhookBinding | BillingRecord,
  ownerId: string,
  pageSlug: string,
  customerId: string,
  subscriptionId: string,
): void => {
  if (binding.ownerId !== ownerId || (binding.pageSlug && binding.pageSlug !== pageSlug)) {
    throw new WebhookConflictError("Binding de tenant conflitante.");
  }
  if (binding.stripeCustomerId && binding.stripeCustomerId !== customerId) {
    throw new WebhookConflictError("Binding de Customer conflitante.");
  }
  if (binding.stripeSubscriptionId && binding.stripeSubscriptionId !== subscriptionId) {
    throw new WebhookConflictError("Binding de Subscription conflitante.");
  }
};

const resolveTenant = async (
  subscription: CanonicalSubscription,
  customer: CanonicalCustomer,
  dependencies: WebhookDependencies,
): Promise<{ ownerId: string; pageSlug: string }> => {
  if (subscription.customerId !== customer.id) {
    throw new WebhookConflictError("Subscription e Customer conflitantes.");
  }
  validateMetadataAgreement(subscription, customer);
  const bindings = await dependencies.accounts.findBindings(customer.id, subscription.id);

  let ownerId = singleEvidence([
    metadataValue(subscription.metadata, "beautyProOwnerId"),
    metadataValue(customer.metadata, "beautyProOwnerId"),
    ...bindings.map((binding) => binding.ownerId),
  ], "owner");
  let pageSlug = singleEvidence([
    metadataValue(subscription.metadata, "beautyProPageSlug"),
    metadataValue(customer.metadata, "beautyProPageSlug"),
    ...bindings.map((binding) => binding.pageSlug),
  ], "page");

  if (!ownerId && pageSlug) {
    const page = await dependencies.accounts.getPage(pageSlug);
    ownerId = typeof page?.userId === "string" ? page.userId : undefined;
  }
  if (!ownerId) throw new WebhookConflictError("Owner canônico não resolvido.");

  const user = await dependencies.accounts.getUser(ownerId);
  const userPageSlug = typeof user?.pageSlug === "string" ? user.pageSlug : undefined;
  pageSlug = singleEvidence([pageSlug, userPageSlug], "page");
  if (!pageSlug) throw new WebhookConflictError("Page canônica não resolvida.");

  const page = await dependencies.accounts.getPage(pageSlug);
  if (!user || userPageSlug !== pageSlug || page?.userId !== ownerId) {
    throw new WebhookConflictError("Tenant canônico inconsistente.");
  }

  const checkoutState = await dependencies.accounts.getCheckoutState(ownerId);
  const billing = await dependencies.billing.getBillingByOwnerId(ownerId);
  for (const binding of [...bindings, ...(checkoutState ? [checkoutState] : []), ...(billing ? [billing] : [])]) {
    assertBinding(binding, ownerId, pageSlug, customer.id, subscription.id);
  }
  return { ownerId, pageSlug };
};

const billingStatus = (status: string): StripeBillingStatus => {
  if (!(STRIPE_BILLING_STATUSES as readonly string[]).includes(status)) {
    throw new WebhookConflictError("Status Stripe não suportado.");
  }
  return status as StripeBillingStatus;
};

const buildSnapshot = (
  subscription: CanonicalSubscription,
  expectedPriceId: string,
): BillingStripeSnapshot => {
  if (subscription.livemode) throw new WebhookConflictError("Recurso Stripe live rejeitado.");
  if (subscription.items.length !== 1 || subscription.items[0]?.priceId !== expectedPriceId) {
    throw new WebhookConflictError("Configuração de Price incompatível.");
  }
  const periodEnd = subscription.items[0].currentPeriodEnd ?? subscription.currentPeriodEnd;
  if (!Number.isSafeInteger(periodEnd) || (periodEnd as number) <= 0) {
    throw new WebhookConflictError("Período canônico da Subscription inválido.");
  }
  return {
    stripeCustomerId: subscription.customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: expectedPriceId,
    status: billingStatus(subscription.status),
    currentPeriodEnd: new Date((periodEnd as number) * 1_000),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
};

export type WebhookSyncResult = {
  handled: boolean;
  result: "IGNORED" | BillingProjectionResult["decision"];
};

export const syncStripeWebhookEvent = async (
  event: StripeWebhookEvent,
  dependencies: WebhookDependencies,
  config: WebhookServerConfig,
): Promise<WebhookSyncResult> => {
  if (!(SUPPORTED_WEBHOOK_EVENTS as readonly string[]).includes(event.type)) {
    return { handled: false, result: "IGNORED" };
  }
  const type = event.type as SupportedWebhookEvent;
  const subscriptionId = subscriptionIdForEvent(type, event.object);
  if (!subscriptionId) {
    if (type === "invoice.paid" || type === "invoice.payment_failed") {
      return { handled: false, result: "IGNORED" };
    }
    throw new WebhookConflictError("Subscription associada ausente.");
  }

  const subscription = await dependencies.stripe.retrieveSubscription(subscriptionId);
  if (subscription.id !== subscriptionId) {
    throw new WebhookConflictError("Subscription recuperada divergente.");
  }
  const customer = await dependencies.stripe.retrieveCustomer(subscription.customerId);
  if (customer.deleted || customer.livemode) {
    throw new WebhookConflictError("Customer Stripe incompatível.");
  }
  const tenant = await resolveTenant(subscription, customer, dependencies);
  const snapshot = buildSnapshot(subscription, config.priceId);
  const input = { ...tenant, event: { id: event.id, created: event.created }, snapshot };
  let projection = await dependencies.billing.apply(input);
  if (projection.decision === "REQUIRES_STRIPE_SYNC") {
    projection = await dependencies.billing.reconcile(input);
  }
  return { handled: true, result: projection.decision };
};

const response = (status: number, body: Record<string, unknown>): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const handleStripeWebhookRequest = async (
  request: Request,
  dependencies: WebhookDependencies,
): Promise<Response> => {
  let config: WebhookServerConfig;
  try {
    config = dependencies.getConfig();
  } catch (error) {
    dependencies.log({ category: error instanceof MissingWebhookSecretError ? "CONFIG_WEBHOOK_SECRET" : "CONFIG" });
    return response(503, { received: false });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return response(400, { received: false });
  const rawBody = await request.text();

  let event: StripeWebhookEvent;
  try {
    event = dependencies.constructEvent(rawBody, signature, config.webhookSecret);
  } catch {
    dependencies.log({ category: "SIGNATURE" });
    return response(400, { received: false });
  }

  try {
    const outcome = await syncStripeWebhookEvent(event, dependencies, config);
    dependencies.log({
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      result: outcome.result,
    });
    return response(200, { received: true });
  } catch (error) {
    const conflict = error instanceof WebhookConflictError;
    dependencies.log({
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      category: conflict ? "CONFLICT" : "TEMPORARY",
    });
    return response(conflict ? 500 : 503, { received: false });
  }
};
