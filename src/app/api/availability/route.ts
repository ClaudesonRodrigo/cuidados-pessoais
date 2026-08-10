import { getAdminFirestore } from "@/lib/firebaseAdmin";
import {
  createFirestoreAvailabilityStore,
  handlePublicAvailabilityRequest,
} from "@/lib/publicAvailability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const availabilityStore = createFirestoreAvailabilityStore(getAdminFirestore);

export const POST = (request: Request) =>
  handlePublicAvailabilityRequest(request, availabilityStore);

export const GET = () =>
  Response.json(
    { error: { code: "method_not_allowed", message: "Método não permitido." } },
    {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    },
  );
