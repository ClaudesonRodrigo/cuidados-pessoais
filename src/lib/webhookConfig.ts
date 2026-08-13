import { getStripeSecretKey } from "./stripeServerConfig.ts";

export type WebhookEnvironment = Readonly<Record<string, string | undefined>>;

export type WebhookServerConfig = {
  webhookSecret: string;
  priceId: string;
};

export class MissingWebhookSecretError extends Error {}

export const resolveWebhookServerConfig = (
  environment: WebhookEnvironment,
): WebhookServerConfig => {
  const secretKey = getStripeSecretKey(environment);
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Stripe Test Mode é obrigatório neste ciclo.");
  }

  const webhookSecret = environment.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new MissingWebhookSecretError(
      "Configuração server-side ausente: STRIPE_WEBHOOK_SECRET",
    );
  }
  const priceId = environment.STRIPE_PRICE_ID;
  if (!priceId || !priceId.startsWith("price_")) {
    throw new Error("Configuração server-side ausente ou inválida: STRIPE_PRICE_ID");
  }
  return { webhookSecret, priceId };
};
