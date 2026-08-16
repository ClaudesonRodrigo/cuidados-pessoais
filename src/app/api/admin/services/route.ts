import { handleAdminServicesMutation } from "@/lib/adminServices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request) => handleAdminServicesMutation(request, "CREATE");
export const PATCH = (request: Request) => handleAdminServicesMutation(request, "EDIT");
export const DELETE = (request: Request) => handleAdminServicesMutation(request, "DELETE");

export const GET = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "POST, PATCH, DELETE", "Cache-Control": "no-store" } },
  );
