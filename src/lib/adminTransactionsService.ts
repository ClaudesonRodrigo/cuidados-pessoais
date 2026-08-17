import {
  CommercialAccessError,
  commercialAccessErrorResponse,
  type CommercialContext,
} from "./commercialAccessService.ts";
import {
  TransactionsError,
  invalidTransactionRequest,
  parseTransactionBusinessInput,
  readTransactionJsonBody,
  transactionErrorResponse,
  validateTransactionId,
  type TransactionBusinessInput,
} from "./transactionsService.ts";

const OWNER_CREATE_KEYS = new Set(["type", "description", "value", "category", "date"]);

export type AdminTransactionsStore = {
  createTransaction(pageSlug: string, input: TransactionBusinessInput): Promise<string>;
  deleteTransaction(transactionId: string, pageSlug: string): Promise<boolean>;
};

export type AdminTransactionsDependencies = {
  requireCommercialAccess(request: Request): Promise<CommercialContext>;
  store: AdminTransactionsStore;
  logError?(context: { ownerId?: string; transactionId?: string; error: unknown }): void;
};

const requirePageSlug = (context: CommercialContext): string => {
  if (!context.pageSlug) {
    throw new TransactionsError(409, "TENANT_CONTEXT_REQUIRED", "Contexto de tenant necessário.");
  }
  return context.pageSlug;
};

export const handleAdminCreateTransactionRequest = async (
  request: Request,
  dependencies: AdminTransactionsDependencies,
): Promise<Response> => {
  let ownerId: string | undefined;
  try {
    if (request.method !== "POST" || new URL(request.url).search.length > 0) {
      return invalidTransactionRequest();
    }
    const context = await dependencies.requireCommercialAccess(request);
    ownerId = context.ownerId;
    const pageSlug = requirePageSlug(context);
    const input = parseTransactionBusinessInput(
      await readTransactionJsonBody(request),
      OWNER_CREATE_KEYS,
    );
    const id = await dependencies.store.createTransaction(pageSlug, input);
    return Response.json(
      { ok: true, transaction: { id } },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CommercialAccessError) return commercialAccessErrorResponse(error);
    if (error instanceof TransactionsError) return transactionErrorResponse(error);
    dependencies.logError?.({ ownerId, error });
    return transactionErrorResponse(new TransactionsError(
      503, "TRANSACTIONS_UNAVAILABLE", "Movimentações indisponíveis.",
    ));
  }
};

export const handleAdminDeleteTransactionRequest = async (
  request: Request,
  transactionIdInput: unknown,
  dependencies: AdminTransactionsDependencies,
): Promise<Response> => {
  let ownerId: string | undefined;
  let transactionId: string | undefined;
  try {
    if (
      request.method !== "DELETE" ||
      new URL(request.url).search.length > 0 ||
      request.body !== null
    ) return invalidTransactionRequest();
    transactionId = validateTransactionId(transactionIdInput);
    const context = await dependencies.requireCommercialAccess(request);
    ownerId = context.ownerId;
    const deleted = await dependencies.store.deleteTransaction(transactionId, requirePageSlug(context));
    if (!deleted) {
      throw new TransactionsError(404, "TRANSACTION_NOT_FOUND", "Movimentação não encontrada.");
    }
    return Response.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CommercialAccessError) return commercialAccessErrorResponse(error);
    if (error instanceof TransactionsError) return transactionErrorResponse(error);
    dependencies.logError?.({ ownerId, transactionId, error });
    return transactionErrorResponse(new TransactionsError(
      503, "TRANSACTIONS_UNAVAILABLE", "Movimentações indisponíveis.",
    ));
  }
};
