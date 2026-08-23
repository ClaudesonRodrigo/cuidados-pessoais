import {
  SuperadminIdentityError,
  superadminIdentityErrorResponse,
  type SuperadminIdentity,
} from "./superadminIdentityService.ts";

import {
  appointmentQueryRangeFor,
  calculateMasterOverview,
  type AppointmentQueryRange,
  type AppointmentReference,
  type MasterOverviewDto,
  type OverviewReferences,
} from "./masterOverviewMetrics.ts";

export type TenantReferences = OverviewReferences;
export type {
  AppointmentQueryRange,
  AppointmentReference,
  MasterOverviewDto,
  OverviewReferences,
  TenantPageReference,
  TenantUserReference,
} from "./masterOverviewMetrics.ts";
export { countValidTenants } from "./masterOverviewMetrics.ts";

export type MasterOverviewStore = {
  readOverviewReferences(): Promise<OverviewReferences>;
  readAppointments(range: AppointmentQueryRange): Promise<readonly AppointmentReference[]>;
};

export type MasterOverviewDependencies = {
  requireSuperadminIdentity(request: Request): Promise<SuperadminIdentity>;
  store: MasterOverviewStore;
  now?(): Date;
  logError?(context: { phase: "overview"; error: unknown }): void;
};

type MasterOverviewErrorCode = "INVALID_REQUEST" | "MASTER_OVERVIEW_UNAVAILABLE";

export class MasterOverviewError extends Error {
  readonly status: number;
  readonly code: MasterOverviewErrorCode;

  constructor(status: number, code: MasterOverviewErrorCode, message: string) {
    super(message);
    this.name = "MasterOverviewError";
    this.status = status;
    this.code = code;
  }
}

const errorResponse = (error: MasterOverviewError): Response => Response.json(
  { error: { code: error.code, message: error.message } },
  { status: error.status, headers: { "Cache-Control": "no-store" } },
);

export const getMasterOverview = async (
  store: MasterOverviewStore,
  now = new Date(),
): Promise<MasterOverviewDto> => {
  const stableNow = new Date(now.getTime());
  const references = await store.readOverviewReferences();
  const range = appointmentQueryRangeFor(references, stableNow);
  const appointments = range ? await store.readAppointments(range) : [];
  return calculateMasterOverview(references, appointments, stableNow);
};

export const handleMasterOverviewRequest = async (
  request: Request,
  dependencies: MasterOverviewDependencies,
): Promise<Response> => {
  try {
    await dependencies.requireSuperadminIdentity(request);
    if (request.method !== "GET" || new URL(request.url).search.length > 0) {
      throw new MasterOverviewError(400, "INVALID_REQUEST", "Requisição inválida.");
    }
    const overview = await getMasterOverview(
      dependencies.store,
      (dependencies.now ?? (() => new Date()))(),
    );
    return Response.json(overview, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SuperadminIdentityError) {
      return superadminIdentityErrorResponse(error);
    }
    if (error instanceof MasterOverviewError) return errorResponse(error);
    dependencies.logError?.({ phase: "overview", error });
    return errorResponse(new MasterOverviewError(
      503,
      "MASTER_OVERVIEW_UNAVAILABLE",
      "Overview Master indisponível.",
    ));
  }
};
