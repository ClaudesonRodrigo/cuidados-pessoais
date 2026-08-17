import {
  SuperadminTenantContextError,
  superadminTenantContextErrorResponse,
  type SuperadminTenantContext,
} from "./superadminTenantContextService.ts";
import {
  TransactionsError,
  invalidTransactionRequest,
  parseTransactionBusinessInput,
  readTransactionJsonBody,
  transactionErrorResponse,
  validateTransactionId,
  type TransactionBusinessInput,
} from "./transactionsService.ts";

const MASTER_CREATE_KEYS = new Set([
  "targetOwnerId", "type", "description", "value", "category", "date",
]);
const MASTER_DELETE_KEYS = new Set(["targetOwnerId"]);

export type MasterTransactionsStore = {
  createTransaction(pageSlug: string, input: TransactionBusinessInput): Promise<string>;
  deleteTransaction(transactionId: string, pageSlug: string): Promise<boolean>;
};

export type MasterTransactionsDependencies = {
  requireSuperadminTenantContext(
    request: Request,
    targetOwnerId: unknown,
  ): Promise<SuperadminTenantContext>;
  store: MasterTransactionsStore;
  logError?(context: { targetOwnerId?: string; transactionId?: string; error: unknown }): void;
};

export const handleMasterCreateTransactionRequest = async (
  request: Request,
  dependencies: MasterTransactionsDependencies,
): Promise<Response> => {
  let targetOwnerId: string | undefined;
  try {
    if (request.method !== "POST" || new URL(request.url).search.length > 0) {
      return invalidTransactionRequest();
    }
    const body = await readTransactionJsonBody(request);
    const context = await dependencies.requireSuperadminTenantContext(request, body.targetOwnerId);
    targetOwnerId = context.targetOwnerId;
    const input = parseTransactionBusinessInput(body, MASTER_CREATE_KEYS);
    const id = await dependencies.store.createTransaction(context.pageSlug, input);
    return Response.json(
      { ok: true, transaction: { id } },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperadminTenantContextError) {
      return superadminTenantContextErrorResponse(error);
    }
    if (error instanceof TransactionsError) return transactionErrorResponse(error);
    dependencies.logError?.({ targetOwnerId, error });
    return transactionErrorResponse(new TransactionsError(
      503, "TRANSACTIONS_UNAVAILABLE", "Movimentações indisponíveis.",
    ));
  }
};

export const handleMasterDeleteTransactionRequest = async (
  request: Request,
  transactionIdInput: unknown,
  dependencies: MasterTransactionsDependencies,
): Promise<Response> => {
  let targetOwnerId: string | undefined;
  let transactionId: string | undefined;
  try {
    if (request.method !== "DELETE" || new URL(request.url).search.length > 0) {
      return invalidTransactionRequest();
    }
    transactionId = validateTransactionId(transactionIdInput);
    const body = await readTransactionJsonBody(request);
    if (
      Object.keys(body).length !== MASTER_DELETE_KEYS.size ||
      Object.keys(body).some((key) => !MASTER_DELETE_KEYS.has(key))
    ) return invalidTransactionRequest();
    const context = await dependencies.requireSuperadminTenantContext(request, body.targetOwnerId);
    targetOwnerId = context.targetOwnerId;
    const deleted = await dependencies.store.deleteTransaction(transactionId, context.pageSlug);
    if (!deleted) {
      throw new TransactionsError(404, "TRANSACTION_NOT_FOUND", "Movimentação não encontrada.");
    }
    return Response.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperadminTenantContextError) {
      return superadminTenantContextErrorResponse(error);
    }
    if (error instanceof TransactionsError) return transactionErrorResponse(error);
    dependencies.logError?.({ targetOwnerId, transactionId, error });
    return transactionErrorResponse(new TransactionsError(
      503, "TRANSACTIONS_UNAVAILABLE", "Movimentações indisponíveis.",
    ));
  }
};
