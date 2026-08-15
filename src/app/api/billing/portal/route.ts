import type Stripe from "stripe";

import { getBillingByOwnerId } from "@/lib/billingService";
import {
  handleCustomerPortalRequest,
  resolveCustomerPortalConfig,
  verifyCustomerPortalIdToken,
} from "@/lib/customerPortalService";
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

const safeStripeLog = ({ ownerId, error }: { ownerId?: string; error: unknown }) => {
  const details = typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : {};
  console.error("Falha interna no Customer Portal Stripe.", {
    ownerId,
    type: typeof details.type === "string" ? details.type : undefined,
    code: typeof details.code === "string" ? details.code : undefined,
    requestId: typeof details.requestId === "string" ? details.requestId : undefined,
  });
};

export const POST = (request: Request) =>
  handleCustomerPortalRequest(request, {
    verifyIdToken: (token) =>
      verifyCustomerPortalIdToken(token, async () => {
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
    stripe: {
      retrieveCustomer,
      async createPortalSession(input) {
        const session = await getStripeServer().billingPortal.sessions.create({
          customer: input.customer,
          return_url: input.returnUrl,
        });
        return { url: session.url };
      },
    },
    getConfig: () => resolveCustomerPortalConfig(process.env),
    logError: safeStripeLog,
  });

export const GET = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
