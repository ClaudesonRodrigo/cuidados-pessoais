export type CheckoutUiStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string };

export interface CheckoutUser {
  getIdToken(): Promise<string>;
}

interface CheckoutResponseBody {
  url?: unknown;
  error?: { code?: unknown };
}

interface CheckoutHandlerDependencies {
  getCurrentUser: () => CheckoutUser | null;
  fetch: typeof fetch;
  redirect: (url: string) => void;
  onStatusChange: (status: CheckoutUiStatus) => void;
}

const GENERIC_ERROR = "Não foi possível iniciar a assinatura agora. Tente novamente.";

const ERROR_MESSAGES: Record<string, string> = {
  ALREADY_SUBSCRIBED: "Você já possui uma assinatura ativa.",
  PAYMENT_REQUIRES_ACTION: "Existe uma assinatura que precisa de regularização.",
  SUBSCRIPTION_INCOMPLETE: "Existe uma assinatura que precisa de regularização.",
  SUBSCRIPTION_REQUIRES_ACTION: "Existe uma assinatura que precisa de regularização.",
  CHECKOUT_IN_PROGRESS: "Já existe um checkout em andamento.",
  CHECKOUT_SESSION_CONFLICT: GENERIC_ERROR,
  CUSTOMER_BINDING_CONFLICT: GENERIC_ERROR,
  TENANT_INCONSISTENT: GENERIC_ERROR,
  ACCOUNT_NOT_READY: GENERIC_ERROR,
  BILLING_UNAVAILABLE: GENERIC_ERROR,
  BILLING_CONFIG_INVALID: GENERIC_ERROR,
};

function errorMessageFor(code: unknown) {
  return typeof code === "string" ? ERROR_MESSAGES[code] ?? GENERIC_ERROR : GENERIC_ERROR;
}

function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

async function responseBody(response: Response): Promise<CheckoutResponseBody> {
  try {
    return (await response.json()) as CheckoutResponseBody;
  } catch {
    return {};
  }
}

export function createCheckoutHandler({
  getCurrentUser,
  fetch: fetchCheckout,
  redirect,
  onStatusChange,
}: CheckoutHandlerDependencies) {
  let inFlight = false;

  return async function startCheckout() {
    if (inFlight) return;

    inFlight = true;
    onStatusChange({ state: "loading" });

    try {
      const user = getCurrentUser();
      if (!user) throw new Error(GENERIC_ERROR);

      const idToken = await user.getIdToken();
      const response = await fetchCheckout("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const body = await responseBody(response);

      if (!response.ok) throw new Error(errorMessageFor(body.error?.code));
      if (!isStripeCheckoutUrl(body.url)) throw new Error(GENERIC_ERROR);

      redirect(body.url);
      onStatusChange({ state: "idle" });
    } catch (error) {
      onStatusChange({
        state: "error",
        message: error instanceof Error && Object.values(ERROR_MESSAGES).includes(error.message)
          ? error.message
          : GENERIC_ERROR,
      });
    } finally {
      inFlight = false;
    }
  };
}
