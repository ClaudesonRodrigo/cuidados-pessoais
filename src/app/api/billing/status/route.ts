import type Stripe from "stripe";

import { getBillingByOwnerId } from "@/lib/billingService";
import {
  handleBillingStatusRequest,
  verifyBillingStatusIdToken,
} from "@/lib/billingStatusService";
import { createFirestoreCheckoutStore } from "@/lib/checkoutStore";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import { getStripeServer } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const missingResource = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "resource_missing";

const retrieveCustomer = async (customerId: string) => {
  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await getStripeServer().customers.retrieve(customerId);
  } catch (error) {
    if (missingResource(error)) return null;
    throw error;
  }
  if (customer.deleted) {
    return { id: customer.id, deleted: true, livemode: false, metadata: {} };
  }
  return {
    id: customer.id,
    deleted: false,
    livemode: customer.livemode,
    metadata: customer.metadata,
  };
};

const safeBillingLog = ({ ownerId, error }: { ownerId?: string; error: unknown }) => {
  const details = typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : {};
  console.error("Falha interna ao consultar status de billing.", {
    ownerId,
    name: typeof details.name === "string" ? details.name : undefined,
  });
};

export const GET = (request: Request) =>
  handleBillingStatusRequest(request, {
    verifyIdToken: (token) =>
      verifyBillingStatusIdToken(token, async () => {
        const decoded = await getAdminAuth().verifyIdToken(token);
        return { uid: decoded.uid };
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
    billing: { getBillingByOwnerId },
    checkoutState: createFirestoreCheckoutStore(),
    stripe: { retrieveCustomer },
    now: () => new Date(),
    logError: safeBillingLog,
  });

export const POST = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } },
  );
