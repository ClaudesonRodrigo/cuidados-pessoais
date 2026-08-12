import { getStripeSecretKey } from "./stripeServerConfig.ts";

export type CheckoutEnvironment = Readonly<Record<string, string | undefined>>;

const normalizedUrl = (value: string): string => {
  const parsed = new URL(value);
  const isLocalHttp = parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.protocol !== "https:" && !isLocalHttp) {
    throw new Error("APP_URL deve usar HTTPS fora do ambiente local.");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
};

export const resolveCheckoutAppUrl = (environment: CheckoutEnvironment): string => {
  if (environment.APP_URL) return normalizedUrl(environment.APP_URL);

  const vercelDeploymentUrl = environment.VERCEL_URL || environment.VERCEL_BRANCH_URL;
  if (vercelDeploymentUrl) return normalizedUrl(`https://${vercelDeploymentUrl}`);

  if (environment.NODE_ENV === "development" || environment.NODE_ENV === "test") {
    return "http://localhost:3000";
  }

  throw new Error("URL server-side do aplicativo não configurada.");
};

export const resolveCheckoutServerConfig = (
  environment: CheckoutEnvironment,
): { priceId: string; appUrl: string } => {
  const secretKey = getStripeSecretKey(environment);
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Stripe Test Mode é obrigatório neste ciclo.");
  }

  const priceId = environment.STRIPE_PRICE_ID;
  if (!priceId || !priceId.startsWith("price_")) {
    throw new Error("Configuração server-side ausente ou inválida: STRIPE_PRICE_ID");
  }

  return { priceId, appUrl: resolveCheckoutAppUrl(environment) };
};
