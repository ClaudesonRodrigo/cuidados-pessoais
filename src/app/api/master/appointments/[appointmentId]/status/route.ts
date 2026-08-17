import { handleMasterAppointmentStatusMutation } from "@/lib/masterAppointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ appointmentId: string }> };

export const POST = async (request: Request, context: RouteContext) => {
  const { appointmentId } = await context.params;
  return handleMasterAppointmentStatusMutation(request, appointmentId);
};

export const GET = () => Response.json(
  { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
  { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
);
