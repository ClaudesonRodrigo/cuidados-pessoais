import "server-only";

import { isOfficialSuperAdminUid } from "./adminIdentity";
import { getAdminAuth } from "./firebaseAdmin";
import {
  requireSuperadminIdentity as requireWithDependencies,
} from "./superadminIdentityService";

const dependencies = () => ({
  verifyIdToken: async (token: string) => {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  },
  isOfficialSuperAdminUid,
  logError({ phase, error }: { phase: "verify"; error: unknown }) {
    const name = typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : undefined;
    console.error("Falha interna ao verificar identidade Master.", { phase, name });
  },
});

export const requireSuperadminIdentity = (request: Request) =>
  requireWithDependencies(request, dependencies());

export {
  SuperadminIdentityError,
  superadminIdentityErrorResponse,
} from "./superadminIdentityService";
export type { SuperadminIdentity } from "./superadminIdentityService";
