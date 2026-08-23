"use client";

import type { MasterOverviewDto } from "./masterOverviewMetrics";

export interface MasterOverviewUser {
  getIdToken(): Promise<string>;
}

const OVERVIEW_ERROR = "Não foi possível carregar o resumo da plataforma.";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatMrrCents = (cents: number): string => brl.format(cents / 100);

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

export const isMasterOverviewDto = (value: unknown): value is MasterOverviewDto => {
  if (typeof value !== "object" || value === null) return false;
  const dto = value as Record<string, any>;
  return (
    isCount(dto.tenants?.total) &&
    isCount(dto.tenants?.active) &&
    isCount(dto.tenants?.trial) &&
    isCount(dto.tenants?.blocked) &&
    isCount(dto.billing?.subscribers) &&
    isCount(dto.billing?.activeSubscriptions) &&
    isCount(dto.billing?.pastDue) &&
    isCount(dto.billing?.mrrCents) &&
    isCount(dto.appointments?.today) &&
    isCount(dto.appointments?.last7Days) &&
    isCount(dto.appointments?.currentMonth) &&
    isCount(dto.growth?.newTenants7Days) &&
    isCount(dto.growth?.newTenants30Days) &&
    isCount(dto.alerts?.pastDue) &&
    isCount(dto.alerts?.blocked) &&
    isCount(dto.alerts?.trialsEndingSoon) &&
    typeof dto.generatedAt === "string" &&
    Number.isFinite(Date.parse(dto.generatedAt))
  );
};

export const fetchMasterOverview = async (
  user: MasterOverviewUser,
  fetchOverview: typeof fetch = fetch,
): Promise<MasterOverviewDto> => {
  const idToken = await user.getIdToken();
  const response = await fetchOverview("/api/master/overview", {
    method: "GET",
    headers: { Authorization: `Bearer ${idToken}` },
    cache: "no-store",
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(OVERVIEW_ERROR);
  }
  if (!response.ok || !isMasterOverviewDto(body)) throw new Error(OVERVIEW_ERROR);
  return body;
};

export const masterOverviewErrorMessage = OVERVIEW_ERROR;
