import { handleAdminTransactionDelete } from "@/lib/adminTransactions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ transactionId: string }> };

export const DELETE = async (request: Request, context: RouteContext) => {
  const { transactionId } = await context.params;
  return handleAdminTransactionDelete(request, transactionId);
};
