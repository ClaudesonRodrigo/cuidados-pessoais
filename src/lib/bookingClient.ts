export type BookAppointmentInput = {
  pageSlug: string;
  startAt: string;
  services: string[];
  customerName: string;
  customerPhone: string;
  idempotencyKey: string;
};

export type BookAppointmentResult = {
  status: "BOOKED" | "ALREADY_BOOKED";
  appointmentId: string;
  serviceName: string;
  totalValue: number;
  startAt: string;
};

export class BookAppointmentRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super("Não foi possível concluir o agendamento.");
    this.status = status;
    this.code = code;
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const bookAppointment = async (
  input: BookAppointmentInput,
  idToken: string,
): Promise<BookAppointmentResult> => {
  const response = await fetch("/api/book", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new BookAppointmentRequestError(response.status, "BOOKING_UNAVAILABLE");
  }

  if (!response.ok) {
    const code = isPlainObject(body) && isPlainObject(body.error) && typeof body.error.code === "string"
      ? body.error.code
      : "BOOKING_UNAVAILABLE";
    throw new BookAppointmentRequestError(response.status, code);
  }

  if (
    !isPlainObject(body) ||
    (body.status !== "BOOKED" && body.status !== "ALREADY_BOOKED") ||
    typeof body.appointmentId !== "string" ||
    typeof body.serviceName !== "string" ||
    typeof body.totalValue !== "number" ||
    typeof body.startAt !== "string"
  ) {
    throw new BookAppointmentRequestError(response.status, "BOOKING_UNAVAILABLE");
  }
  return body as BookAppointmentResult;
};
