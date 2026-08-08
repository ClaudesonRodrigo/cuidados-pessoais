import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import {
  handleOnboardingRequest,
  type OnboardingStore,
} from "@/lib/onboardingService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const onboardingStore: OnboardingStore = {
  runTransaction(operation) {
    const db = getAdminFirestore();
    return db.runTransaction(async (firestoreTransaction) =>
      operation({
        async getUser(uid) {
          const snapshot = await firestoreTransaction.get(db.collection("users").doc(uid));
          return snapshot.exists ? snapshot.data()! : null;
        },
        async getPage(slug) {
          const snapshot = await firestoreTransaction.get(db.collection("pages").doc(slug));
          return snapshot.exists ? snapshot.data()! : null;
        },
        createUser(uid, data) {
          firestoreTransaction.create(db.collection("users").doc(uid), data);
        },
        createPage(slug, data) {
          firestoreTransaction.create(db.collection("pages").doc(slug), data);
        },
      }),
    );
  },
};

export const POST = (request: Request) =>
  handleOnboardingRequest(request, {
    verifyIdToken: async (token) => {
      const decoded = await getAdminAuth().verifyIdToken(token);
      return { uid: decoded.uid, email: decoded.email };
    },
    store: onboardingStore,
  });

export const GET = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
