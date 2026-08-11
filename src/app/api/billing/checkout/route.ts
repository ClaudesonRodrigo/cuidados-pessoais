import { randomUUID } from "node:crypto";

import type Stripe from "stripe";

import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import { getBillingByOwnerId } from "@/lib/billingService";
import { getCheckoutServerConfig } from "@/lib/checkoutConfig";
import {
  handleCheckoutRequest,
  verifyCheckoutIdToken,
} from "@/lib/checkoutService";
import { createFirestoreCheckoutStore } from "@/lib/checkoutStore";
import type {
  CheckoutStripeGateway,
  CheckoutSubscription,
} from "@/lib/checkoutTypes";
import { getStripeServer } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const missingResource = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "resource_missing";

const resourceOrNull = async <T>(operation: () => Promise<T>): Promise<T | null> => {
  try {
    return await operation();
  } catch (error) {
    if (missingResource(error)) return null;
    throw error;
  }
};

const resourceId = (value: string | { id: string } | null): string | undefined =>
  typeof value === "string" ? value : value?.id;

const subscriptionView = (subscription: Stripe.Subscription): CheckoutSubscription => {
  const supportedStatus = [
    "trialing", "active", "past_due", "unpaid", "canceled",
    "incomplete", "incomplete_expired", "paused",
  ].find((status) => status === subscription.status);
  if (!supportedStatus) throw new Error("Status Stripe não suportado no Checkout.");
  return {
    id: subscription.id,
    status: supportedStatus as CheckoutSubscription["status"],
    customerId: resourceId(subscription.customer),
  };
};

const sessionView = (session: Stripe.Checkout.Session) => ({
  id: session.id,
  url: session.url,
  status: session.status,
  expiresAt: session.expires_at,
  subscriptionId: resourceId(session.subscription),
  customerId: resourceId(session.customer),
  livemode: session.livemode,
  mode: session.mode,
  clientReferenceId: session.client_reference_id,
  metadata: session.metadata ?? {},
  priceIds: (session.line_items?.data ?? []).flatMap((lineItem) => {
    const price = lineItem.price;
    if (!price) return [];
    return [typeof price === "string" ? price : price.id];
  }),
});

const stripeGateway = (): CheckoutStripeGateway => ({
  async retrievePrice(priceId) {
    const price = await resourceOrNull(() => getStripeServer().prices.retrieve(priceId));
    return price ? {
      id: price.id,
      active: price.active,
      currency: price.currency,
      unitAmount: price.unit_amount,
      recurringInterval: price.recurring?.interval ?? null,
      livemode: price.livemode,
    } : null;
  },

  async retrieveCustomer(customerId) {
    const customer = await resourceOrNull(() => getStripeServer().customers.retrieve(customerId));
    if (!customer) return null;
    if (customer.deleted) {
      return { id: customer.id, deleted: true, livemode: false, metadata: {} };
    }
    return {
      id: customer.id,
      deleted: false,
      livemode: customer.livemode,
      metadata: customer.metadata,
    };
  },

  async createCustomer(input, idempotencyKey) {
    const customer = await getStripeServer().customers.create(
      {
        ...(input.email ? { email: input.email } : {}),
        ...(input.name ? { name: input.name } : {}),
        metadata: input.metadata,
      },
      { idempotencyKey },
    );
    return {
      id: customer.id,
      deleted: false,
      livemode: customer.livemode,
      metadata: customer.metadata,
    };
  },

  async retrieveSubscription(subscriptionId) {
    const subscription = await resourceOrNull(() =>
      getStripeServer().subscriptions.retrieve(subscriptionId));
    return subscription ? subscriptionView(subscription) : null;
  },

  async listCustomerSubscriptions(customerId) {
    const subscriptions: CheckoutSubscription[] = [];
    for await (const subscription of getStripeServer().subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    })) {
      subscriptions.push(subscriptionView(subscription));
    }
    return subscriptions;
  },

  async retrieveSession(sessionId) {
    const session = await resourceOrNull(() =>
      getStripeServer().checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price"],
      }));
    return session ? sessionView(session) : null;
  },

  async createSession(input, idempotencyKey) {
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: input.subscriptionMetadata,
      ...(input.trialEnd === undefined ? {} : { trial_end: input.trialEnd }),
      ...(input.trialPeriodDays === undefined
        ? {}
        : { trial_period_days: input.trialPeriodDays }),
    };
    const session = await getStripeServer().checkout.sessions.create(
      {
        mode: input.mode,
        customer: input.customer,
        line_items: [{ price: input.priceId, quantity: input.quantity }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.clientReferenceId,
        metadata: input.metadata,
        subscription_data: subscriptionData,
        payment_method_collection: input.paymentMethodCollection,
        expires_at: input.expiresAt,
        expand: ["line_items.data.price"],
      },
      { idempotencyKey },
    );
    return sessionView(session);
  },
});

const safeStripeLog = ({ ownerId, error }: { ownerId?: string; error: unknown }) => {
  const details = typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : {};
  console.error("Falha interna no Checkout Stripe.", {
    ownerId,
    type: typeof details.type === "string" ? details.type : undefined,
    code: typeof details.code === "string" ? details.code : undefined,
    requestId: typeof details.requestId === "string" ? details.requestId : undefined,
  });
};

export const POST = (request: Request) =>
  handleCheckoutRequest(request, {
    verifyIdToken: (token) =>
      verifyCheckoutIdToken(token, async () => {
        const decoded = await getAdminAuth().verifyIdToken(token);
        return { uid: decoded.uid, email: decoded.email };
      }),
    accounts: {
      async getUser(uid) {
        const snapshot = await getAdminFirestore().collection("users").doc(uid).get();
        return snapshot.exists ? snapshot.data()! : null;
      },
      async getPage(pageSlug) {
        const snapshot = await getAdminFirestore().collection("pages").doc(pageSlug).get();
        return snapshot.exists ? snapshot.data()! : null;
      },
    },
    operations: createFirestoreCheckoutStore(),
    billing: { getBillingByOwnerId },
    stripe: stripeGateway(),
    getConfig: getCheckoutServerConfig,
    now: () => new Date(),
    createProvisioningKey: randomUUID,
    createCheckoutAttemptId: randomUUID,
    logError: safeStripeLog,
  });

export const GET = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
