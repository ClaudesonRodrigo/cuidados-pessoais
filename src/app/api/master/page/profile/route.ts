import { handleMasterProfileMutation } from "@/lib/masterProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = (request: Request) => handleMasterProfileMutation(request);

export const GET = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "PATCH", "Cache-Control": "no-store" } },
  );
