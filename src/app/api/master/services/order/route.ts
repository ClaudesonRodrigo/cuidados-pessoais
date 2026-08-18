import { handleMasterServicesMutation } from "@/lib/masterServices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = (request: Request) => handleMasterServicesMutation(request, "REORDER");

export const GET = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "PUT", "Cache-Control": "no-store" } },
  );
