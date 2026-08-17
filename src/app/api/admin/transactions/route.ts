import { handleAdminTransactionCreate } from "@/lib/adminTransactions";

export const runtime = "nodejs";

export const POST = (request: Request) => handleAdminTransactionCreate(request);
