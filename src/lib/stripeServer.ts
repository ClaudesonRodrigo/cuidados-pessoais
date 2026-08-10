import "server-only";

import Stripe from "stripe";

let stripeServer: Stripe | undefined;

const getStripeSecretKey = (): string => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Configuração server-side ausente: STRIPE_SECRET_KEY");
  }
  return secretKey;
};

export const getStripeServer = (): Stripe => {
  if (!stripeServer) {
    stripeServer = new Stripe(getStripeSecretKey(), {
      appInfo: { name: "BeautyPro" },
    });
  }

  return stripeServer;
};
