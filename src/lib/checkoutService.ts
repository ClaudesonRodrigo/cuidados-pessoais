import { isOfficialSuperAdminUid } from "./adminIdentity.ts";
import { isCredentialVerificationError } from "./onboardingService.ts";
import type {
  BillingCheckoutState,
  CheckoutCustomer,
  CheckoutDependencies,
  CheckoutIdentity,
  CheckoutSessionCreateInput,
  CheckoutStatusGuard,
  CheckoutSubscription,
  HostedCheckoutSession,
} from "./checkoutTypes.ts";
import { CheckoutStoreConflictError } from "./checkoutTypes.ts";
import type { BillingRecord } from "./billingTypes.ts";

const MAX_CHECKOUT_BODY_BYTES = 1_024;
const TRIAL_END_SAFE_THRESHOLD_MS = 49 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const CHECKOUT_SESSION_SECONDS = 35 * 60;
const CHECKOUT_MINIMUM_SECONDS = 30 * 60;
const CHECKOUT_MAXIMUM_SECONDS = 24 * 60 * 60;
const OPERATION_LEASE_MS = 5 * 60 * 1_000;
const JWT_STRUCTURE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export type CheckoutErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "CHECKOUT_NOT_ALLOWED"
  | "ACCOUNT_NOT_READY"
  | "TENANT_INCONSISTENT"
  | "ALREADY_SUBSCRIBED"
  | "PAYMENT_REQUIRES_ACTION"
  | "SUBSCRIPTION_INCOMPLETE"
  | "SUBSCRIPTION_REQUIRES_ACTION"
  | "CUSTOMER_BINDING_CONFLICT"
  | "CHECKOUT_SESSION_CONFLICT"
  | "CHECKOUT_IN_PROGRESS"
  | "BILLING_UNAVAILABLE"
  | "BILLING_CONFIG_INVALID";

export class CheckoutError extends Error {
  readonly status: number;
  readonly code: CheckoutErrorCode;

  constructor(status: number, code: CheckoutErrorCode, message: string) {
    super(message);
    this.name = "CheckoutError";
    this.status = status;
    this.code = code;
  }
}

export class InvalidCheckoutTokenError extends Error {
  constructor() {
    super("Invalid Firebase ID token.");
    this.name = "InvalidCheckoutTokenError";
  }
}

export const verifyCheckoutIdToken = async (
  token: string,
  verify: (token: string) => Promise<CheckoutIdentity>,
): Promise<CheckoutIdentity> => {
  if (!JWT_STRUCTURE_PATTERN.test(token)) throw new InvalidCheckoutTokenError();
  try {
    return await verify(token);
  } catch (error) {
    if (isCredentialVerificationError(error)) throw new InvalidCheckoutTokenError();
    throw error;
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
    const result = value.toDate();
    return result instanceof Date && Number.isFinite(result.getTime()) ? result : null;
  }
  return null;
};

const safeString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const parseEmptyBody = async (request: Request): Promise<void> => {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (declaredLength > MAX_CHECKOUT_BODY_BYTES) {
    throw new CheckoutError(400, "INVALID_REQUEST", "Requisição inválida.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_CHECKOUT_BODY_BYTES) {
    throw new CheckoutError(400, "INVALID_REQUEST", "Requisição inválida.");
  }
  if (raw.trim() === "") return;
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new CheckoutError(400, "INVALID_REQUEST", "Content-Type inválido.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CheckoutError(400, "INVALID_REQUEST", "JSON inválido.");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 0
  ) {
    throw new CheckoutError(400, "INVALID_REQUEST", "O body deve ser vazio.");
  }
};

const assertCheckoutEligibleStatus = (status: CheckoutStatusGuard): void => {
  if (status === "active" || status === "trialing") {
    throw new CheckoutError(409, "ALREADY_SUBSCRIBED", "Assinatura já existente.");
  }
  if (status === "past_due" || status === "unpaid") {
    throw new CheckoutError(409, "PAYMENT_REQUIRES_ACTION", "Pagamento requer ação.");
  }
  if (status === "paused") {
    throw new CheckoutError(409, "SUBSCRIPTION_REQUIRES_ACTION", "Assinatura requer ação.");
  }
  if (status === "incomplete") {
    throw new CheckoutError(409, "SUBSCRIPTION_INCOMPLETE", "Assinatura incompleta.");
  }
};

export const resolveCurrentCustomerSubscriptions = async (
  customerId: string,
  dependencies: CheckoutDependencies,
): Promise<CheckoutSubscription[]> => {
  const subscriptions = await dependencies.stripe.listCustomerSubscriptions(customerId);
  for (const subscription of subscriptions) {
    if (subscription.customerId !== customerId) {
      throw new CheckoutError(
        409,
        "CUSTOMER_BINDING_CONFLICT",
        "Subscription pertence a outro Customer.",
      );
    }
  }

  const statuses = new Set(subscriptions.map((subscription) => subscription.status));
  for (const status of ["active", "trialing"] as const) {
    if (statuses.has(status)) assertCheckoutEligibleStatus(status);
  }
  for (const status of ["past_due", "unpaid"] as const) {
    if (statuses.has(status)) assertCheckoutEligibleStatus(status);
  }
  if (statuses.has("paused")) assertCheckoutEligibleStatus("paused");
  if (statuses.has("incomplete")) assertCheckoutEligibleStatus("incomplete");
  return subscriptions;
};

const checkedNow = (dependencies: CheckoutDependencies): Date => {
  const now = dependencies.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new CheckoutError(503, "BILLING_UNAVAILABLE", "Billing temporariamente indisponível.");
  }
  return now;
};

const leaseIsValid = (state: BillingCheckoutState, now: Date): boolean =>
  Boolean(state.operationLeaseUntil && state.operationLeaseUntil.getTime() > now.getTime());

const metadataFor = (ownerId: string, pageSlug: string): Record<string, string> => ({
  beautyProOwnerId: ownerId,
  beautyProPageSlug: pageSlug,
});

function assertCustomerBinding(
  customer: CheckoutCustomer | null,
  ownerId: string,
  pageSlug: string,
): asserts customer is CheckoutCustomer {
  if (
    !customer ||
    customer.deleted ||
    customer.livemode ||
    customer.metadata.beautyProOwnerId !== ownerId ||
    customer.metadata.beautyProPageSlug !== pageSlug
  ) {
    throw new CheckoutError(409, "CUSTOMER_BINDING_CONFLICT", "Customer Stripe inconsistente.");
  }
}

const assertOperationalBinding = (
  state: BillingCheckoutState | null,
  ownerId: string,
  pageSlug: string,
): void => {
  if (state && (state.ownerId !== ownerId || state.pageSlug !== pageSlug)) {
    throw new CheckoutError(409, "CUSTOMER_BINDING_CONFLICT", "Binding operacional inconsistente.");
  }
};

const resolveCanonicalCustomer = async (input: {
  identity: CheckoutIdentity;
  ownerId: string;
  pageSlug: string;
  displayName?: string;
  billing: BillingRecord | null;
  dependencies: CheckoutDependencies;
}): Promise<CheckoutCustomer> => {
  const { identity, ownerId, pageSlug, displayName, billing, dependencies } = input;
  let state = await dependencies.operations.get(ownerId);
  assertOperationalBinding(state, ownerId, pageSlug);

  if (
    state?.stripeCustomerId &&
    billing?.stripeCustomerId &&
    state.stripeCustomerId !== billing.stripeCustomerId
  ) {
    throw new CheckoutError(409, "CUSTOMER_BINDING_CONFLICT", "Customers canônicos divergentes.");
  }

  const existingCustomerId = state?.stripeCustomerId || billing?.stripeCustomerId;
  if (existingCustomerId) {
    const customer = await dependencies.stripe.retrieveCustomer(existingCustomerId);
    assertCustomerBinding(customer, ownerId, pageSlug);

    if (!state?.stripeCustomerId) {
      const reservationNow = checkedNow(dependencies);
      state = await dependencies.operations.reserveCustomer({
        ownerId,
        pageSlug,
        proposedProvisioningKey: dependencies.createProvisioningKey(),
        now: reservationNow,
        leaseUntil: new Date(reservationNow.getTime() + OPERATION_LEASE_MS),
      });
      state = await dependencies.operations.bindCustomer({
        ownerId,
        pageSlug,
        provisioningKey: state.customerProvisioningKey!,
        stripeCustomerId: customer.id,
        now: checkedNow(dependencies),
      });
    }
    return customer;
  }

  const reservationNow = checkedNow(dependencies);
  state = await dependencies.operations.reserveCustomer({
    ownerId,
    pageSlug,
    proposedProvisioningKey: dependencies.createProvisioningKey(),
    now: reservationNow,
    leaseUntil: new Date(reservationNow.getTime() + OPERATION_LEASE_MS),
  });
  assertOperationalBinding(state, ownerId, pageSlug);

  if (state.stripeCustomerId) {
    const customer = await dependencies.stripe.retrieveCustomer(state.stripeCustomerId);
    assertCustomerBinding(customer, ownerId, pageSlug);
    return customer;
  }
  if (!state.customerProvisioningKey) {
    throw new CheckoutError(409, "CHECKOUT_IN_PROGRESS", "Provisionamento em andamento.");
  }
  if (state.operationState !== "CUSTOMER_PROVISIONING" || !leaseIsValid(state, checkedNow(dependencies))) {
    throw new CheckoutError(
      503,
      "BILLING_UNAVAILABLE",
      "Customer requer reconciliação operacional.",
    );
  }

  const customer = await dependencies.stripe.createCustomer(
    {
      email: identity.email,
      name: displayName,
      metadata: metadataFor(ownerId, pageSlug),
    },
    `beautypro:customer:v1:${ownerId}:${state.customerProvisioningKey}`,
  );
  assertCustomerBinding(customer, ownerId, pageSlug);

  try {
    await dependencies.operations.bindCustomer({
      ownerId,
      pageSlug,
      provisioningKey: state.customerProvisioningKey,
      stripeCustomerId: customer.id,
      now: checkedNow(dependencies),
    });
  } catch (error) {
    if (error instanceof CheckoutStoreConflictError) {
      throw new CheckoutError(409, "CUSTOMER_BINDING_CONFLICT", "Customer canônico divergente.");
    }
    throw error;
  }
  return customer;
};

export const resolvePromotionalTrial = (
  deadline: Date | null,
  now: Date,
): Pick<CheckoutSessionCreateInput, "trialEnd" | "trialPeriodDays"> => {
  if (!deadline || deadline.getTime() <= now.getTime()) return {};
  const remaining = deadline.getTime() - now.getTime();
  if (remaining >= TRIAL_END_SAFE_THRESHOLD_MS) {
    return { trialEnd: Math.ceil(deadline.getTime() / 1_000) };
  }
  return { trialPeriodDays: Math.max(1, Math.ceil(remaining / DAY_MS)) };
};

const validCheckoutUrl = (url: string | null): url is string => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
};

const validatePrice = async (dependencies: CheckoutDependencies, priceId: string): Promise<void> => {
  const price = await dependencies.stripe.retrievePrice(priceId);
  if (
    !price ||
    price.id !== priceId ||
    !price.active ||
    price.livemode ||
    price.currency !== "brl" ||
    price.unitAmount !== 2_990 ||
    price.recurringInterval !== "month"
  ) {
    throw new CheckoutError(503, "BILLING_CONFIG_INVALID", "Configuração de billing inválida.");
  }
};

type SessionBindingInput = {
  session: HostedCheckoutSession | null;
  customerId: string;
  ownerId: string;
  pageSlug: string;
  priceId: string;
  checkoutAttemptId?: string;
};

function assertSessionBinding(
  input: SessionBindingInput,
): asserts input is SessionBindingInput & { session: HostedCheckoutSession } {
  const { session, customerId, ownerId, pageSlug, priceId, checkoutAttemptId } = input;
  if (
    !session ||
    session.livemode ||
    session.mode !== "subscription" ||
    session.customerId !== customerId ||
    session.clientReferenceId !== ownerId ||
    session.metadata.beautyProOwnerId !== ownerId ||
    session.metadata.beautyProPageSlug !== pageSlug ||
    (checkoutAttemptId !== undefined &&
      session.metadata.beautyProCheckoutAttemptId !== checkoutAttemptId) ||
    session.priceIds.length !== 1 ||
    session.priceIds[0] !== priceId
  ) {
    throw new CheckoutError(
      409,
      "CHECKOUT_SESSION_CONFLICT",
      "Checkout Session inconsistente.",
    );
  }
}

const inspectExistingSession = async (input: {
  state: BillingCheckoutState;
  customerId: string;
  ownerId: string;
  pageSlug: string;
  priceId: string;
  dependencies: CheckoutDependencies;
}): Promise<{ url?: string; expiredAttemptId?: string }> => {
  const { state, customerId, ownerId, pageSlug, priceId, dependencies } = input;
  if (!state.checkoutSessionId) return {};
  const binding: SessionBindingInput = {
    session: await dependencies.stripe.retrieveSession(state.checkoutSessionId),
    customerId,
    ownerId,
    pageSlug,
    priceId,
    checkoutAttemptId: state.checkoutAttemptId,
  };
  assertSessionBinding(binding);
  const session = binding.session;
  if (session.status === "open") {
    if (!validCheckoutUrl(session.url)) {
      throw new CheckoutError(503, "BILLING_UNAVAILABLE", "Checkout indisponível.");
    }
    return { url: session.url };
  }
  if (session.status === "complete") {
    await resolveCurrentCustomerSubscriptions(customerId, dependencies);
    throw new CheckoutError(409, "CHECKOUT_IN_PROGRESS", "Assinatura em confirmação.");
  }
  if (session.status === "expired") {
    await resolveCurrentCustomerSubscriptions(customerId, dependencies);
    return { expiredAttemptId: state.checkoutAttemptId };
  }
  throw new CheckoutError(409, "CHECKOUT_IN_PROGRESS", "Checkout requer reconciliação.");
};

export const createHostedCheckout = async (
  identity: CheckoutIdentity,
  dependencies: CheckoutDependencies,
): Promise<{ url: string }> => {
  if (isOfficialSuperAdminUid(identity.uid)) {
    throw new CheckoutError(403, "CHECKOUT_NOT_ALLOWED", "Checkout não permitido.");
  }

  const user = await dependencies.accounts.getUser(identity.uid);
  if (!user) throw new CheckoutError(409, "ACCOUNT_NOT_READY", "Conta ainda não preparada.");
  if (user.role === "customer") {
    throw new CheckoutError(403, "CHECKOUT_NOT_ALLOWED", "Checkout não permitido.");
  }
  if (
    user.role !== "owner" ||
    typeof user.pageSlug !== "string" ||
    !/^[a-z0-9-]{3,120}$/.test(user.pageSlug)
  ) {
    throw new CheckoutError(409, "ACCOUNT_NOT_READY", "Conta ainda não preparada.");
  }

  const pageSlug = user.pageSlug;
  const page = await dependencies.accounts.getPage(pageSlug);
  if (!page) throw new CheckoutError(409, "ACCOUNT_NOT_READY", "Página ainda não preparada.");
  if (page.userId !== identity.uid || page.slug !== pageSlug) {
    throw new CheckoutError(409, "TENANT_INCONSISTENT", "Tenant inconsistente.");
  }

  let config;
  try {
    config = dependencies.getConfig();
  } catch {
    throw new CheckoutError(503, "BILLING_CONFIG_INVALID", "Configuração de billing inválida.");
  }
  await validatePrice(dependencies, config.priceId);

  const billing = await dependencies.billing.getBillingByOwnerId(identity.uid);
  if (billing?.pageSlug && billing.pageSlug !== pageSlug) {
    throw new CheckoutError(409, "TENANT_INCONSISTENT", "Billing pertence a outro tenant.");
  }

  const existingOperation = await dependencies.operations.get(identity.uid);
  if (!existingOperation?.stripeCustomerId && !billing?.stripeCustomerId && billing?.status) {
    assertCheckoutEligibleStatus(billing.status);
  }
  const customer = await resolveCanonicalCustomer({
    identity,
    ownerId: identity.uid,
    pageSlug,
    displayName: safeString(user.displayName),
    billing,
    dependencies,
  });
  await resolveCurrentCustomerSubscriptions(customer.id, dependencies);
  if (billing?.stripeSubscriptionId) {
    const referencedSubscription = await dependencies.stripe.retrieveSubscription(
      billing.stripeSubscriptionId,
    );
    if (referencedSubscription) {
      if (referencedSubscription.customerId !== customer.id) {
        throw new CheckoutError(
          409,
          "CUSTOMER_BINDING_CONFLICT",
          "Subscription pertence a outro Customer.",
        );
      }
      assertCheckoutEligibleStatus(referencedSubscription.status);
    }
  }

  let state = await dependencies.operations.get(identity.uid);
  if (!state) throw new CheckoutError(409, "CHECKOUT_IN_PROGRESS", "Checkout em preparação.");
  assertOperationalBinding(state, identity.uid, pageSlug);

  const inspected = await inspectExistingSession({
    state,
    customerId: customer.id,
    ownerId: identity.uid,
    pageSlug,
    priceId: config.priceId,
    dependencies,
  });
  if (inspected.url) return { url: inspected.url };

  const checkoutCreationNow = checkedNow(dependencies);
  const trial = resolvePromotionalTrial(dateValue(user.trialDeadline), checkoutCreationNow);
  const proposedExpiresAt = new Date(
    checkoutCreationNow.getTime() + CHECKOUT_SESSION_SECONDS * 1_000,
  );
  state = await dependencies.operations.reserveCheckoutAttempt({
    ownerId: identity.uid,
    pageSlug,
    proposedAttemptId: dependencies.createCheckoutAttemptId(),
    replaceAttemptId: inspected.expiredAttemptId,
    now: checkoutCreationNow,
    leaseUntil: new Date(checkoutCreationNow.getTime() + OPERATION_LEASE_MS),
    expiresAt: proposedExpiresAt,
    ...trial,
  });
  if (!state.checkoutAttemptId) {
    throw new CheckoutError(409, "CHECKOUT_IN_PROGRESS", "Checkout em preparação.");
  }

  if (state.checkoutSessionId) {
    const canonical = await inspectExistingSession({
      state,
      customerId: customer.id,
      ownerId: identity.uid,
      pageSlug,
      priceId: config.priceId,
      dependencies,
    });
    if (canonical.url) return { url: canonical.url };
    throw new CheckoutError(409, "CHECKOUT_IN_PROGRESS", "Checkout em preparação.");
  }

  const immediatelyBeforeCreate = checkedNow(dependencies);
  if (
    state.operationState !== "CHECKOUT_PROVISIONING" ||
    !leaseIsValid(state, immediatelyBeforeCreate) ||
    !state.checkoutExpiresAt
  ) {
    throw new CheckoutError(409, "CHECKOUT_IN_PROGRESS", "Checkout requer reconciliação.");
  }
  const expiresAt = Math.ceil(state.checkoutExpiresAt.getTime() / 1_000);
  const remainingSessionSeconds = expiresAt - Math.ceil(immediatelyBeforeCreate.getTime() / 1_000);
  if (
    remainingSessionSeconds < CHECKOUT_MINIMUM_SECONDS ||
    remainingSessionSeconds > CHECKOUT_MAXIMUM_SECONDS
  ) {
    throw new CheckoutError(409, "CHECKOUT_IN_PROGRESS", "Checkout requer reconciliação.");
  }

  const metadata = {
    ...metadataFor(identity.uid, pageSlug),
    beautyProCheckoutAttemptId: state.checkoutAttemptId,
  };
  const session = await dependencies.stripe.createSession(
    {
      mode: "subscription",
      customer: customer.id,
      priceId: config.priceId,
      quantity: 1,
      successUrl: `${config.appUrl}/admin/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${config.appUrl}/admin/dashboard?billing=cancelled`,
      clientReferenceId: identity.uid,
      metadata,
      subscriptionMetadata: metadataFor(identity.uid, pageSlug),
      paymentMethodCollection: "always",
      expiresAt,
      trialEnd: state.checkoutTrialEnd,
      trialPeriodDays: state.checkoutTrialPeriodDays,
    },
    `beautypro:checkout:v1:${identity.uid}:${state.checkoutAttemptId}`,
  );
  assertSessionBinding({
    session,
    customerId: customer.id,
    ownerId: identity.uid,
    pageSlug,
    priceId: config.priceId,
    checkoutAttemptId: state.checkoutAttemptId,
  });
  if (!validCheckoutUrl(session.url) || session.status !== "open" || session.expiresAt <= 0) {
    throw new CheckoutError(503, "BILLING_UNAVAILABLE", "Checkout indisponível.");
  }

  try {
    await dependencies.operations.recordCheckoutSession({
      ownerId: identity.uid,
      pageSlug,
      checkoutAttemptId: state.checkoutAttemptId,
      sessionId: session.id,
      sessionUrl: session.url,
      expiresAt: new Date(session.expiresAt * 1_000),
      now: checkedNow(dependencies),
    });
  } catch (error) {
    if (error instanceof CheckoutStoreConflictError) {
      throw new CheckoutError(409, "CHECKOUT_IN_PROGRESS", "Checkout requer reconciliação.");
    }
    throw error;
  }
  return { url: session.url };
};

const errorResponse = (error: CheckoutError): Response =>
  Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );

export const handleCheckoutRequest = async (
  request: Request,
  dependencies: CheckoutDependencies,
): Promise<Response> => {
  let ownerId: string | undefined;
  try {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match) throw new CheckoutError(401, "UNAUTHORIZED", "Autenticação necessária.");

    let identity: CheckoutIdentity;
    try {
      identity = await dependencies.verifyIdToken(match[1]);
    } catch (error) {
      if (error instanceof InvalidCheckoutTokenError) {
        throw new CheckoutError(401, "UNAUTHORIZED", "Token inválido.");
      }
      throw error;
    }
    ownerId = identity.uid;
    await parseEmptyBody(request);
    const result = await createHostedCheckout(identity, dependencies);
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CheckoutError) return errorResponse(error);
    if (error instanceof CheckoutStoreConflictError) {
      return errorResponse(new CheckoutError(
        409,
        "CUSTOMER_BINDING_CONFLICT",
        "Estado operacional inconsistente.",
      ));
    }
    dependencies.logError?.({ ownerId, error });
    return errorResponse(new CheckoutError(
      503,
      "BILLING_UNAVAILABLE",
      "Billing temporariamente indisponível.",
    ));
  }
};
