import { handleMasterTransactionCreate } from "@/lib/masterTransactions";

export const runtime = "nodejs";

export const POST = (request: Request) => handleMasterTransactionCreate(request);
