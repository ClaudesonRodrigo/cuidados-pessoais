import "server-only";

import { getAdminFirestore } from "./firebaseAdmin";
import { STRIPE_BILLING_STATUSES, type BillingRecord } from "./billingTypes";
import {
  handleMasterOverviewRequest as handleWithDependencies,
  type MasterOverviewDependencies,
} from "./masterOverviewService";
import { requireSuperadminIdentity } from "./superadminIdentity";

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (
    typeof value === "object" && value !== null &&
    "toDate" in value && typeof value.toDate === "function"
  ) {
    const result = value.toDate();
    return result instanceof Date && Number.isFinite(result.getTime()) ? result : null;
  }
  return null;
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const store: MasterOverviewDependencies["store"] = {
  async readOverviewReferences() {
    const firestore = getAdminFirestore();
    const [usersSnapshot, pagesSnapshot, billingSnapshot] = await Promise.all([
      firestore.collection("users")
        .where("role", "==", "owner")
        .select("pageSlug", "role", "plan", "trialDeadline", "createdAt")
        .get(),
      firestore.collection("pages")
        .select("userId", "slug", "plan", "trialDeadline", "createdAt", "timezone")
        .get(),
      firestore.collection("billing")
        .select(
          "ownerId", "pageSlug", "stripeSubscriptionId", "status",
          "currentPeriodEnd", "pastDueSince", "createdAt", "updatedAt",
        )
        .get(),
    ]);
    return {
      users: usersSnapshot.docs.map((document) => {
        const data = document.data();
        return {
          id: document.id,
          pageSlug: data.pageSlug,
          role: data.role,
          plan: data.plan,
          trialDeadline: data.trialDeadline,
          createdAt: data.createdAt,
        };
      }),
      pages: pagesSnapshot.docs.map((document) => {
        const data = document.data();
        return {
          id: document.id,
          userId: data.userId,
          slug: data.slug,
          plan: data.plan,
          trialDeadline: data.trialDeadline,
          createdAt: data.createdAt,
          timezone: data.timezone,
        };
      }),
      billing: billingSnapshot.docs.flatMap((document): BillingRecord[] => {
        const data = document.data();
        const createdAt = dateValue(data.createdAt);
        const updatedAt = dateValue(data.updatedAt);
        if (
          typeof data.ownerId !== "string" || typeof data.pageSlug !== "string" ||
          !createdAt || !updatedAt
        ) return [];
        const status = typeof data.status === "string" &&
          STRIPE_BILLING_STATUSES.includes(
            data.status as NonNullable<BillingRecord["status"]>,
          )
          ? data.status as BillingRecord["status"]
          : undefined;
        return [{
          ownerId: data.ownerId,
          pageSlug: data.pageSlug,
          stripeSubscriptionId: optionalString(data.stripeSubscriptionId),
          status,
          currentPeriodEnd: dateValue(data.currentPeriodEnd) ?? undefined,
          pastDueSince: dateValue(data.pastDueSince) ?? undefined,
          createdAt,
          updatedAt,
        }];
      }),
    };
  },
  async readAppointments({ startAt, endAt }) {
    const snapshot = await getAdminFirestore().collection("appointments")
      .where("startAt", ">=", startAt)
      .where("startAt", "<", endAt)
      .select("pageSlug", "startAt", "status")
      .get();
    return snapshot.docs.map((document) => {
      const data = document.data();
      return { pageSlug: data.pageSlug, startAt: dateValue(data.startAt), status: data.status };
    });
  },
};

export const handleMasterOverviewRequest = (request: Request) =>
  handleWithDependencies(request, {
    requireSuperadminIdentity,
    store,
    logError({ phase, error }) {
      const name = typeof error === "object" && error !== null && "name" in error
        ? String(error.name)
        : undefined;
      console.error("Falha interna no Overview Master.", { phase, name });
    },
  });
