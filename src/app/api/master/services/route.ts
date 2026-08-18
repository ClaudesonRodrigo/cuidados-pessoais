import { handleMasterServicesMutation } from "@/lib/masterServices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request) => handleMasterServicesMutation(request, "CREATE");
export const PATCH = (request: Request) => handleMasterServicesMutation(request, "EDIT");
export const DELETE = (request: Request) => handleMasterServicesMutation(request, "DELETE");

export const GET = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "POST, PATCH, DELETE", "Cache-Control": "no-store" } },
  );
