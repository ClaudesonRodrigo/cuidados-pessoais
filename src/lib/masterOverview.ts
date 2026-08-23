import "server-only";

import { getAdminFirestore } from "./firebaseAdmin";
import {
  handleMasterOverviewRequest as handleWithDependencies,
  type MasterOverviewDependencies,
} from "./masterOverviewService";
import { requireSuperadminIdentity } from "./superadminIdentity";

const store: MasterOverviewDependencies["store"] = {
  async readTenantReferences() {
    const firestore = getAdminFirestore();
    const [usersSnapshot, pagesSnapshot] = await Promise.all([
      firestore.collection("users")
        .where("role", "==", "owner")
        .select("pageSlug", "role")
        .get(),
      firestore.collection("pages")
        .select("userId", "slug")
        .get(),
    ]);
    return {
      users: usersSnapshot.docs.map((document) => {
        const data = document.data();
        return { id: document.id, pageSlug: data.pageSlug, role: data.role };
      }),
      pages: pagesSnapshot.docs.map((document) => {
        const data = document.data();
        return { id: document.id, userId: data.userId, slug: data.slug };
      }),
    };
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
