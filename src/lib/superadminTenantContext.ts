import "server-only";

import { isOfficialSuperAdminUid } from "./adminIdentity";
import { getAdminAuth, getAdminFirestore } from "./firebaseAdmin";
import {
  requireSuperadminTenantContext as requireWithDependencies,
  resolveSuperadminTenantContext as resolveWithDependencies,
} from "./superadminTenantContextService";

const dependencies = () => ({
  verifyIdToken: async (token: string) => {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  },
  isOfficialSuperAdminUid,
  accounts: {
    async getUser(targetOwnerId: string) {
      const snapshot = await getAdminFirestore().collection("users").doc(targetOwnerId).get();
      return snapshot.exists ? snapshot.data()! : null;
    },
    async getPage(pageSlug: string) {
      const snapshot = await getAdminFirestore().collection("pages").doc(pageSlug).get();
      return snapshot.exists ? snapshot.data()! : null;
    },
  },
  logError({ phase, error }: { phase: "verify" | "target"; error: unknown }) {
    const name = typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : undefined;
    console.error("Falha interna ao resolver contexto Master.", { phase, name });
  },
});

export const requireSuperadminTenantContext = (request: Request, targetOwnerId: unknown) =>
  requireWithDependencies(request, targetOwnerId, dependencies());

export const resolveSuperadminTenantContext = (
  identity: Readonly<{ uid: string }>,
  targetOwnerId: unknown,
) => resolveWithDependencies(identity, targetOwnerId, dependencies());

export {
  SuperadminTenantContextError,
  superadminTenantContextErrorResponse,
} from "./superadminTenantContextService";
export type { SuperadminTenantContext } from "./superadminTenantContextService";
