import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import {
  createFirestoreBookingStore,
  handleBookingRequest,
  verifyBookingIdToken,
} from "@/lib/bookingService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request) =>
  handleBookingRequest(request, {
    verifyIdToken: (token) =>
      verifyBookingIdToken(token, async () => {
        const decoded = await getAdminAuth().verifyIdToken(token);
        return { uid: decoded.uid, email: decoded.email };
      }),
    store: {
      runTransaction: (operation) =>
        createFirestoreBookingStore(getAdminFirestore()).runTransaction(operation),
    },
  });

export const GET = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
