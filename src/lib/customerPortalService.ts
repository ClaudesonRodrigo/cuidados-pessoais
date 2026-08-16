import { isOfficialSuperAdminUid } from "./adminIdentity.ts";
import type { BillingRecord } from "./billingTypes.ts";
import { resolveCheckoutAppUrl, type CheckoutEnvironment } from "./checkoutConfigCore.ts";
import type {
  BillingCheckoutState,
  CheckoutIdentity,
  CheckoutPage,
  CheckoutUser,
} from "./checkoutTypes.ts";
import { getStripeSecretKey } from "./stripeServerConfig.ts";

const MAX_PORTAL_BODY_BYTES = 1_024;
const JWT_STRUCTURE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export type CustomerPortalErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "PORTAL_NOT_ALLOWED"
  | "ACCOUNT_NOT_READY"
  | "TENANT_INCONSISTENT"
  | "CUSTOMER_BINDING_CONFLICT"
  | "PORTAL_NOT_AVAILABLE"
  | "BILLING_CONFIG_INVALID"
  | "BILLING_UNAVAILABLE";

export class CustomerPortalError extends Error {
  readonly status: number;
  readonly code: CustomerPortalErrorCode;

  constructor(status: number, code: CustomerPortalErrorCode, message: string) {
    super(message);
    this.name = "CustomerPortalError";
    this.status = status;
    this.code = code;
  }
}

export class InvalidCustomerPortalTokenError extends Error {
  constructor() {
    super("Invalid Firebase ID token.");
    this.name = "InvalidCustomerPortalTokenError";
  }
}

export type CustomerPortalCustomer = {
  id: string;
  deleted: boolean;
  livemode: boolean;
  metadata: Record<string, string>;
};

export type CustomerPortalBindingDependencies = {
  billing: BillingRecord | null;
  checkoutState: BillingCheckoutState | null;
  retrieveCustomer(customerId: string): Promise<CustomerPortalCustomer | null>;
};

export const resolveValidatedPortalCustomer = async (
  ownerId: string,
  pageSlug: string,
  dependencies: CustomerPortalBindingDependencies,
): Promise<CustomerPortalCustomer> => {
  const { billing, checkoutState: state } = dependencies;
  if (billing && (billing.ownerId !== ownerId || billing.pageSlug !== pageSlug)) {
    throw new CustomerPortalError(409, "TENANT_INCONSISTENT", "Billing pertence a outro tenant.");
  }
  if (state && (state.ownerId !== ownerId || state.pageSlug !== pageSlug)) {
    throw new CustomerPortalError(
      409,
      "CUSTOMER_BINDING_CONFLICT",
      "Binding operacional inconsistente.",
    );
  }

  const billingCustomer = billing?.stripeCustomerId;
  const checkoutCustomer = state?.stripeCustomerId;
  if (billingCustomer && checkoutCustomer && billingCustomer !== checkoutCustomer) {
    throw new CustomerPortalError(
      409,
      "CUSTOMER_BINDING_CONFLICT",
      "Customers canônicos divergentes.",
    );
  }
  const canonicalCustomerId = billingCustomer || checkoutCustomer;
  if (!canonicalCustomerId) {
    throw new CustomerPortalError(409, "PORTAL_NOT_AVAILABLE", "Portal ainda não disponível.");
  }

  const customer = await dependencies.retrieveCustomer(canonicalCustomerId);
  if (
    !customer ||
    customer.id !== canonicalCustomerId ||
    customer.deleted ||
    customer.livemode ||
    customer.metadata.beautyProOwnerId !== ownerId ||
    customer.metadata.beautyProPageSlug !== pageSlug
  ) {
    throw new CustomerPortalError(
      409,
      "CUSTOMER_BINDING_CONFLICT",
      "Customer Stripe inconsistente.",
    );
  }
  return customer;
};

export type CustomerPortalDependencies = {
  verifyIdToken(token: string): Promise<CheckoutIdentity>;
  accounts: {
    getUser(uid: string): Promise<CheckoutUser | null>;
    getPage(pageSlug: string): Promise<CheckoutPage | null>;
  };
  billing: {
    getBillingByOwnerId(ownerId: string): Promise<BillingRecord | null>;
  };
  checkoutState: {
    get(ownerId: string): Promise<BillingCheckoutState | null>;
  };
  stripe: {
    retrieveCustomer(customerId: string): Promise<CustomerPortalCustomer | null>;
    createPortalSession(input: { customer: string; returnUrl: string }): Promise<{ url: string }>;
  };
  getConfig(): { appUrl: string };
  logError?(context: { ownerId?: string; error: unknown }): void;
};

export const resolveCustomerPortalConfig = (
  environment: CheckoutEnvironment,
): { appUrl: string } => {
  const secretKey = getStripeSecretKey(environment);
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Stripe Test Mode é obrigatório neste ciclo.");
  }
  return { appUrl: resolveCheckoutAppUrl(environment) };
};

export const verifyCustomerPortalIdToken = async (
  token: string,
  verify: (token: string) => Promise<CheckoutIdentity>,
): Promise<CheckoutIdentity> => {
  if (!JWT_STRUCTURE_PATTERN.test(token)) throw new InvalidCustomerPortalTokenError();
  try {
    return await verify(token);
  } catch {
    throw new InvalidCustomerPortalTokenError();
  }
};

const parseEmptyBody = async (request: Request): Promise<void> => {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_PORTAL_BODY_BYTES) {
    throw new CustomerPortalError(400, "INVALID_REQUEST", "Requisição inválida.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_PORTAL_BODY_BYTES) {
    throw new CustomerPortalError(400, "INVALID_REQUEST", "Requisição inválida.");
  }
  if (raw.trim() === "") return;
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new CustomerPortalError(400, "INVALID_REQUEST", "Content-Type inválido.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CustomerPortalError(400, "INVALID_REQUEST", "JSON inválido.");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 0
  ) {
    throw new CustomerPortalError(400, "INVALID_REQUEST", "O body deve ser vazio.");
  }
};

const validPortalUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "billing.stripe.com";
  } catch {
    return false;
  }
};

export const createCustomerPortalSession = async (
  identity: CheckoutIdentity,
  dependencies: CustomerPortalDependencies,
): Promise<{ url: string }> => {
  const ownerId = identity.uid;
  if (isOfficialSuperAdminUid(ownerId)) {
    throw new CustomerPortalError(403, "PORTAL_NOT_ALLOWED", "Portal não permitido.");
  }

  const user = await dependencies.accounts.getUser(ownerId);
  if (!user) {
    throw new CustomerPortalError(409, "ACCOUNT_NOT_READY", "Conta ainda não preparada.");
  }
  if (user.role === "customer") {
    throw new CustomerPortalError(403, "PORTAL_NOT_ALLOWED", "Portal não permitido.");
  }
  if (
    user.role !== "owner" ||
    typeof user.pageSlug !== "string" ||
    !/^[a-z0-9-]{3,120}$/.test(user.pageSlug)
  ) {
    throw new CustomerPortalError(409, "ACCOUNT_NOT_READY", "Conta ainda não preparada.");
  }

  const pageSlug = user.pageSlug;
  const page = await dependencies.accounts.getPage(pageSlug);
  if (!page) {
    throw new CustomerPortalError(409, "ACCOUNT_NOT_READY", "Página ainda não preparada.");
  }
  if (page.userId !== ownerId || page.slug !== pageSlug) {
    throw new CustomerPortalError(409, "TENANT_INCONSISTENT", "Tenant inconsistente.");
  }

  let config: { appUrl: string };
  try {
    config = dependencies.getConfig();
  } catch {
    throw new CustomerPortalError(503, "BILLING_CONFIG_INVALID", "Configuração de billing inválida.");
  }

  const [billing, state] = await Promise.all([
    dependencies.billing.getBillingByOwnerId(ownerId),
    dependencies.checkoutState.get(ownerId),
  ]);
  const customer = await resolveValidatedPortalCustomer(ownerId, pageSlug, {
    billing,
    checkoutState: state,
    retrieveCustomer: dependencies.stripe.retrieveCustomer,
  });

  const session = await dependencies.stripe.createPortalSession({
    customer: customer.id,
    returnUrl: `${config.appUrl}/admin/dashboard`,
  });
  if (!validPortalUrl(session.url)) {
    throw new CustomerPortalError(503, "BILLING_UNAVAILABLE", "Portal temporariamente indisponível.");
  }
  return { url: session.url };
};

const errorResponse = (error: CustomerPortalError): Response =>
  Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );

export const handleCustomerPortalRequest = async (
  request: Request,
  dependencies: CustomerPortalDependencies,
): Promise<Response> => {
  let ownerId: string | undefined;
  try {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match) {
      throw new CustomerPortalError(401, "UNAUTHORIZED", "Autenticação necessária.");
    }

    let identity: CheckoutIdentity;
    try {
      identity = await dependencies.verifyIdToken(match[1]);
    } catch (error) {
      if (error instanceof InvalidCustomerPortalTokenError) {
        throw new CustomerPortalError(401, "UNAUTHORIZED", "Token inválido.");
      }
      throw error;
    }
    ownerId = identity.uid;
    await parseEmptyBody(request);
    const result = await createCustomerPortalSession(identity, dependencies);
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CustomerPortalError) return errorResponse(error);
    dependencies.logError?.({ ownerId, error });
    return errorResponse(new CustomerPortalError(
      503,
      "BILLING_UNAVAILABLE",
      "Billing temporariamente indisponível.",
    ));
  }
};
