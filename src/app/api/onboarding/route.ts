import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import {
  handleOnboardingRequest,
  InvalidOnboardingTokenError,
  type OnboardingStore,
} from "@/lib/onboardingService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_ID_TOKEN_CODES = new Set([
  "auth/argument-error",
  "auth/invalid-argument",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/user-disabled",
]);

const isInvalidIdTokenError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string" &&
  INVALID_ID_TOKEN_CODES.has(error.code);

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
      const adminAuth = getAdminAuth();
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        return { uid: decoded.uid, email: decoded.email };
      } catch (error) {
        if (isInvalidIdTokenError(error)) throw new InvalidOnboardingTokenError();
        throw error;
      }
    },
    store: onboardingStore,
  });

export const GET = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
