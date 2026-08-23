import { handleMasterOverviewRequest } from "@/lib/masterOverview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => handleMasterOverviewRequest(request);
