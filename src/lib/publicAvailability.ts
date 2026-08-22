// Um único dia civil IANA pode durar 23h, 24h ou 25h; 26h mantém folga restrita.
export const MAX_AVAILABILITY_RANGE_MS = 26 * 60 * 60 * 1000;
export const MAX_AVAILABILITY_RESULTS = 200;
export const MAX_AVAILABILITY_BODY_BYTES = 2_048;

const PAGE_SLUG_PATTERN = /^[a-z0-9-]+$/;
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export type BusyInterval = {
  startAt: string;
  endAt: string;
};

export type PublicAvailabilityInput = {
  pageSlug: string;
  startAt: string;
  endAt: string;
};

export type AvailabilityDocument = {
  status?: unknown;
  startAt?: unknown;
  endAt?: unknown;
};

export type AvailabilityStore = {
  pageExists(pageSlug: string): Promise<boolean>;
  findAppointments(input: {
    pageSlug: string;
    startAt: Date;
    endAt: Date;
    limit: number;
  }): Promise<AvailabilityDocument[]>;
};

type AvailabilityQuery = {
  where(fieldPath: string, opStr: "==" | "<", value: unknown): AvailabilityQuery;
  select(...fieldPaths: string[]): AvailabilityQuery;
  limit(value: number): AvailabilityQuery;
  get(): Promise<{ docs: Array<{ data(): AvailabilityDocument }> }>;
};

type AvailabilityCollection = AvailabilityQuery & {
  doc(id: string): { get(): Promise<{ exists: boolean }> };
};

export type AvailabilityFirestore = {
  collection(path: string): AvailabilityCollection;
};

export const createFirestoreAvailabilityStore = (
  getFirestore: () => AvailabilityFirestore,
): AvailabilityStore => ({
  async pageExists(pageSlug) {
    const snapshot = await getFirestore().collection("pages").doc(pageSlug).get();
    return snapshot.exists;
  },

  async findAppointments({ pageSlug, endAt, limit }) {
    const snapshot = await getFirestore()
      .collection("appointments")
      .where("pageSlug", "==", pageSlug)
      .where("startAt", "<", endAt)
      .select("startAt", "endAt", "status")
      .limit(Math.min(limit, MAX_AVAILABILITY_RESULTS + 1))
      .get();

    return snapshot.docs.map((document) => document.data());
  },
});

type PublicErrorCode =
  | "invalid_request"
  | "page_not_found"
  | "availability_timeout"
  | "availability_unavailable";

class PublicAvailabilityError extends Error {
  readonly status: number;
  readonly code: PublicErrorCode;

  constructor(status: number, code: PublicErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class PublicAvailabilityRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Não foi possível consultar a agenda.");
    this.status = status;
  }
}

const jsonResponse = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseIsoDate = (value: unknown, field: string): Date => {
  if (typeof value !== "string" || !ISO_DATETIME_PATTERN.test(value)) {
    throw new PublicAvailabilityError(400, "invalid_request", `${field} inválido.`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new PublicAvailabilityError(400, "invalid_request", `${field} inválido.`);
  }

  return parsed;
};

export const parsePublicAvailabilityInput = (
  value: unknown,
): PublicAvailabilityInput & { startDate: Date; endDate: Date } => {
  if (!isPlainObject(value)) {
    throw new PublicAvailabilityError(400, "invalid_request", "Entrada inválida.");
  }

  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "endAt,pageSlug,startAt") {
    throw new PublicAvailabilityError(400, "invalid_request", "Entrada inválida.");
  }

  const { pageSlug, startAt, endAt } = value;
  if (
    typeof pageSlug !== "string" ||
    pageSlug.length === 0 ||
    pageSlug.length > 120 ||
    !PAGE_SLUG_PATTERN.test(pageSlug)
  ) {
    throw new PublicAvailabilityError(400, "invalid_request", "pageSlug inválido.");
  }

  const startDate = parseIsoDate(startAt, "startAt");
  const endDate = parseIsoDate(endAt, "endAt");
  const range = endDate.getTime() - startDate.getTime();

  if (range <= 0 || range > MAX_AVAILABILITY_RANGE_MS) {
    throw new PublicAvailabilityError(400, "invalid_request", "Período inválido.");
  }

  return {
    pageSlug,
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
    startDate,
    endDate,
  };
};

const documentDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (isPlainObject(value) && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }
  return null;
};

export const projectBusyIntervals = (
  documents: AvailabilityDocument[],
  requestedStart: Date,
  requestedEnd: Date,
): BusyInterval[] => {
  if (documents.length > MAX_AVAILABILITY_RESULTS) {
    throw new PublicAvailabilityError(
      503,
      "availability_unavailable",
      "Agenda temporariamente indisponível.",
    );
  }

  return documents.flatMap((document) => {
    if (document.status === "cancelled") return [];

    const startAt = documentDate(document.startAt);
    const endAt = documentDate(document.endAt);
    if (!startAt || !endAt || endAt <= startAt) {
      throw new PublicAvailabilityError(
        503,
        "availability_unavailable",
        "Agenda temporariamente indisponível.",
      );
    }

    if (!(startAt < requestedEnd && endAt > requestedStart)) return [];

    return [{ startAt: startAt.toISOString(), endAt: endAt.toISOString() }];
  });
};

const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new PublicAvailabilityError(504, "availability_timeout", "Consulta expirou.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const handlePublicAvailabilityRequest = async (
  request: Request,
  store: AvailabilityStore,
  timeoutMs = 8_000,
): Promise<Response> => {
  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > MAX_AVAILABILITY_BODY_BYTES) {
      throw new PublicAvailabilityError(400, "invalid_request", "Entrada inválida.");
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_AVAILABILITY_BODY_BYTES) {
      throw new PublicAvailabilityError(400, "invalid_request", "Entrada inválida.");
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new PublicAvailabilityError(400, "invalid_request", "JSON inválido.");
    }

    const input = parsePublicAvailabilityInput(body);
    const busyIntervals = await withTimeout(
      (async () => {
        if (!(await store.pageExists(input.pageSlug))) {
          throw new PublicAvailabilityError(404, "page_not_found", "Página não encontrada.");
        }

        const documents = await store.findAppointments({
          pageSlug: input.pageSlug,
          startAt: input.startDate,
          endAt: input.endDate,
          limit: MAX_AVAILABILITY_RESULTS + 1,
        });
        return projectBusyIntervals(documents, input.startDate, input.endDate);
      })(),
      timeoutMs,
    );

    return jsonResponse({ busyIntervals }, 200);
  } catch (error) {
    if (error instanceof PublicAvailabilityError) {
      return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
    }

    console.error("Falha interna ao consultar disponibilidade pública.");
    return jsonResponse(
      {
        error: {
          code: "availability_unavailable",
          message: "Agenda temporariamente indisponível.",
        },
      },
      503,
    );
  }
};

const isBusyInterval = (value: unknown): value is BusyInterval => {
  if (!isPlainObject(value) || Object.keys(value).sort().join(",") !== "endAt,startAt") {
    return false;
  }

  if (
    typeof value.startAt !== "string" ||
    typeof value.endAt !== "string" ||
    !ISO_DATETIME_PATTERN.test(value.startAt) ||
    !ISO_DATETIME_PATTERN.test(value.endAt)
  ) {
    return false;
  }

  const startAt = new Date(value.startAt);
  const endAt = new Date(value.endAt);
  return !Number.isNaN(startAt.getTime()) && !Number.isNaN(endAt.getTime()) && endAt > startAt;
};

export const fetchPublicAvailability = async (
  input: PublicAvailabilityInput,
  signal?: AbortSignal,
): Promise<BusyInterval[]> => {
  const response = await fetch("/api/availability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
    signal,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PublicAvailabilityRequestError(response.status);
  }

  if (
    !response.ok ||
    !isPlainObject(body) ||
    Object.keys(body).join(",") !== "busyIntervals" ||
    !Array.isArray(body.busyIntervals) ||
    !body.busyIntervals.every(isBusyInterval)
  ) {
    throw new PublicAvailabilityRequestError(response.status);
  }

  return body.busyIntervals;
};
