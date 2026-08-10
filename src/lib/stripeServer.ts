import "server-only";

import Stripe from "stripe";

import { getStripeSecretKey } from "./stripeServerConfig";

let stripeServer: Stripe | undefined;

export const getStripeServer = (): Stripe => {
  if (!stripeServer) {
    stripeServer = new Stripe(getStripeSecretKey(), {
      appInfo: { name: "BeautyPro" },
    });
  }

  return stripeServer;
};
