import { handleAdminAppointmentStatusMutation } from "@/lib/adminAppointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ appointmentId: string }> };

export const POST = async (request: Request, context: RouteContext) => {
  const { appointmentId } = await context.params;
  return handleAdminAppointmentStatusMutation(request, appointmentId);
};

export const GET = () =>
  Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
