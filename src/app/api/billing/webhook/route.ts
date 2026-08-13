import type Stripe from "stripe";

import {
  BILLING_COLLECTION,
  applyStripeBillingSnapshot,
  getBillingByOwnerId,
  reconcileStripeBillingSnapshot,
} from "@/lib/billingService";
import { BILLING_CHECKOUT_STATE_COLLECTION, createFirestoreCheckoutStore } from "@/lib/checkoutStore";
import { getAdminFirestore } from "@/lib/firebaseAdmin";
import { getStripeServer } from "@/lib/stripeServer";
import { resolveWebhookServerConfig } from "@/lib/webhookConfig";
import {
  handleStripeWebhookRequest,
  type CanonicalCustomer,
  type CanonicalSubscription,
  type StripeWebhookEvent,
  type WebhookBinding,
} from "@/lib/webhookService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resourceId = (value: string | { id: string }): string =>
  typeof value === "string" ? value : value.id;

const subscriptionView = (subscription: Stripe.Subscription): CanonicalSubscription => {
  const legacyPeriodEnd = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  return {
    id: subscription.id,
    customerId: resourceId(subscription.customer),
    livemode: subscription.livemode,
    status: subscription.status,
    metadata: subscription.metadata,
    items: subscription.items.data.map((item) => ({
      priceId: item.price.id,
      currentPeriodEnd: item.current_period_end,
    })),
    currentPeriodEnd: legacyPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
};

const customerView = (customer: Stripe.Customer | Stripe.DeletedCustomer): CanonicalCustomer =>
  customer.deleted
    ? { id: customer.id, deleted: true, livemode: false, metadata: {} }
    : {
        id: customer.id,
        deleted: false,
        livemode: customer.livemode,
        metadata: customer.metadata,
      };

const documentBinding = (
  document: FirebaseFirestore.QueryDocumentSnapshot,
): WebhookBinding => {
  const data = document.data();
  return {
    ownerId: document.id,
    ...(typeof data.pageSlug === "string" ? { pageSlug: data.pageSlug } : {}),
    ...(typeof data.stripeCustomerId === "string"
      ? { stripeCustomerId: data.stripeCustomerId }
      : {}),
    ...(typeof data.stripeSubscriptionId === "string"
      ? { stripeSubscriptionId: data.stripeSubscriptionId }
      : {}),
  };
};

const findBindings = async (
  customerId: string,
  subscriptionId: string,
): Promise<WebhookBinding[]> => {
  const db = getAdminFirestore();
  const [checkout, billingCustomer, billingSubscription] = await Promise.all([
    db.collection(BILLING_CHECKOUT_STATE_COLLECTION)
      .where("stripeCustomerId", "==", customerId)
      .get(),
    db.collection(BILLING_COLLECTION).where("stripeCustomerId", "==", customerId).get(),
    db.collection(BILLING_COLLECTION).where("stripeSubscriptionId", "==", subscriptionId).get(),
  ]);
  const unique = new Map<string, WebhookBinding>();
  for (const document of [
    ...checkout.docs,
    ...billingCustomer.docs,
    ...billingSubscription.docs,
  ]) {
    const binding = documentBinding(document);
    const previous = unique.get(binding.ownerId);
    unique.set(binding.ownerId, { ...previous, ...binding });
  }
  return [...unique.values()];
};

const safeWebhookLog = (context: {
  eventId?: string;
  eventType?: string;
  eventCreated?: number;
  result?: string;
  category?: string;
}) => console.info("Stripe webhook.", context);

export const POST = (request: Request) => {
  const checkoutStore = createFirestoreCheckoutStore();
  return handleStripeWebhookRequest(request, {
    constructEvent(rawBody, signature, secret): StripeWebhookEvent {
      const event = getStripeServer().webhooks.constructEvent(rawBody, signature, secret);
      return {
        id: event.id,
        type: event.type,
        created: event.created,
        object: event.data.object as unknown as Record<string, unknown>,
      };
    },
    stripe: {
      async retrieveSubscription(id) {
        return subscriptionView(await getStripeServer().subscriptions.retrieve(id));
      },
      async retrieveCustomer(id) {
        return customerView(await getStripeServer().customers.retrieve(id));
      },
    },
    accounts: {
      findBindings,
      async getUser(ownerId) {
        const document = await getAdminFirestore().collection("users").doc(ownerId).get();
        return document.exists ? document.data()! : null;
      },
      async getPage(pageSlug) {
        const document = await getAdminFirestore().collection("pages").doc(pageSlug).get();
        return document.exists ? document.data()! : null;
      },
      async getCheckoutState(ownerId) {
        return checkoutStore.get(ownerId);
      },
    },
    billing: {
      getBillingByOwnerId,
      apply: applyStripeBillingSnapshot,
      reconcile: reconcileStripeBillingSnapshot,
    },
    getConfig: () => resolveWebhookServerConfig(process.env),
    log: safeWebhookLog,
  });
};
