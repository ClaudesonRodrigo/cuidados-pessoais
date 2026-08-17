const MAX_BODY_BYTES = 4_096;
const MAX_TRANSACTION_ID_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_CATEGORY_LENGTH = 120;
const MAX_VALUE = 1_000_000_000;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type TransactionType = "income" | "expense";

export type TransactionBusinessInput = Readonly<{
  type: TransactionType;
  description: string;
  value: number;
  category: string;
  date: Date;
}>;

type TransactionsErrorCode =
  | "INVALID_REQUEST"
  | "TENANT_CONTEXT_REQUIRED"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTIONS_UNAVAILABLE";

export class TransactionsError extends Error {
  readonly status: number;
  readonly code: TransactionsErrorCode;

  constructor(status: number, code: TransactionsErrorCode, message: string) {
    super(message);
    this.name = "TransactionsError";
    this.status = status;
    this.code = code;
  }
}

export const invalidTransactionRequest = (message = "Requisição inválida."): never => {
  throw new TransactionsError(400, "INVALID_REQUEST", message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const readTransactionJsonBody = async (request: Request): Promise<Record<string, unknown>> => {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json") {
    return invalidTransactionRequest();
  }
  if (!request.body) return invalidTransactionRequest();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return invalidTransactionRequest("Payload excede o limite permitido.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!isRecord(parsed)) return invalidTransactionRequest();
    return parsed;
  } catch {
    return invalidTransactionRequest();
  }
};

export const validateTransactionId = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_TRANSACTION_ID_LENGTH ||
    value.includes("/") ||
    CONTROL_CHARACTERS.test(value)
  ) return invalidTransactionRequest("Transaction ID inválido.");
  return value;
};

const normalizedText = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== "string" || CONTROL_CHARACTERS.test(value)) {
    return invalidTransactionRequest(`${field} inválido.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    return invalidTransactionRequest(`${field} inválido.`);
  }
  return normalized;
};

export const parseTransactionBusinessInput = (
  body: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): TransactionBusinessInput => {
  const keys = Object.keys(body);
  if (keys.length !== allowedKeys.size || keys.some((key) => !allowedKeys.has(key))) {
    return invalidTransactionRequest();
  }
  if (body.type !== "income" && body.type !== "expense") {
    return invalidTransactionRequest("type inválido.");
  }
  if (
    typeof body.value !== "number" ||
    !Number.isFinite(body.value) ||
    body.value <= 0 ||
    body.value > MAX_VALUE
  ) return invalidTransactionRequest("value inválido.");
  if (typeof body.date !== "string" || body.date.length > 40) {
    return invalidTransactionRequest("date inválido.");
  }
  const date = new Date(body.date);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== body.date) {
    return invalidTransactionRequest("date inválido.");
  }
  return {
    type: body.type,
    description: normalizedText(body.description, "description", MAX_DESCRIPTION_LENGTH),
    value: body.value,
    category: normalizedText(body.category, "category", MAX_CATEGORY_LENGTH),
    date,
  };
};

export const transactionErrorResponse = (error: TransactionsError): Response => Response.json(
  { error: { code: error.code, message: error.message } },
  { status: error.status, headers: { "Cache-Control": "no-store" } },
);
