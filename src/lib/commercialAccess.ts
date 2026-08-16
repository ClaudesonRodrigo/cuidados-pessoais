import "server-only";

import { getBillingByOwnerId } from "./billingService";
import {
  requireCommercialAccess as requireCommercialAccessWithDependencies,
  resolveAuthenticatedCommercialContext as resolveAuthenticatedCommercialContextWithDependencies,
} from "./commercialAccessService";
import { getAdminAuth, getAdminFirestore } from "./firebaseAdmin";

const dependencies = () => ({
  verifyIdToken: async (token: string) => {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  },
  accounts: {
    async getUser(uid: string) {
      const snapshot = await getAdminFirestore().collection("users").doc(uid).get();
      return snapshot.exists ? snapshot.data()! : null;
    },
    async getPage(pageSlug: string) {
      const snapshot = await getAdminFirestore().collection("pages").doc(pageSlug).get();
      return snapshot.exists ? snapshot.data()! : null;
    },
  },
  billing: { getBillingByOwnerId },
  now: () => new Date(),
});

export const resolveAuthenticatedCommercialContext = (request: Request) =>
  resolveAuthenticatedCommercialContextWithDependencies(request, dependencies());

export const requireCommercialAccess = (request: Request) =>
  requireCommercialAccessWithDependencies(request, dependencies());

export {
  CommercialAccessError,
  commercialAccessErrorResponse,
} from "./commercialAccessService";
export type { CommercialContext } from "./commercialAccessService";
