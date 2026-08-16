'use client';

import { useEffect, useState } from "react";
import type { BillingStatusDto } from "./billingStatusService";

export interface BillingStatusUser {
  getIdToken(): Promise<string>;
}

export type BillingStatusClientState = {
  loading: boolean;
  data: BillingStatusDto | null;
  error: string | null;
};

export type PortalUiStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string };

type BillingStatusResponseBody = Partial<BillingStatusDto> & {
  url?: unknown;
  error?: { code?: unknown };
};

const STATUS_ERROR = "Não foi possível consultar sua assinatura. Atualize a página e tente novamente.";
const PORTAL_ERROR = "Não foi possível abrir o gerenciamento da assinatura. Tente novamente.";

const PORTAL_ERROR_MESSAGES: Record<string, string> = {
  PORTAL_NOT_AVAILABLE: "O gerenciamento da assinatura ainda não está disponível para esta conta.",
  ACCOUNT_NOT_READY: "Sua conta ainda está sendo preparada. Atualize a página e tente novamente.",
  CUSTOMER_BINDING_CONFLICT: "Não foi possível confirmar os dados da assinatura. Entre em contato com o suporte.",
  BILLING_UNAVAILABLE: "O sistema de cobrança está temporariamente indisponível. Tente novamente.",
  BILLING_CONFIG_INVALID: "O gerenciamento da assinatura está temporariamente indisponível.",
  UNAUTHORIZED: "Sua sessão expirou. Entre novamente para gerenciar sua assinatura.",
};

const FINANCIAL_STATES = new Set([
  "ADMIN_BYPASS",
  "ACTIVE",
  "PAST_DUE_GRACE",
  "TRIAL_ACTIVE",
  "BLOCKED",
]);
const FINANCIAL_SOURCES = new Set([
  "superadmin",
  "stripe",
  "legacy_grant",
  "promotional_trial",
  "none",
]);

const isBillingStatusDto = (value: BillingStatusResponseBody): value is BillingStatusDto =>
  typeof value.state === "string" &&
  FINANCIAL_STATES.has(value.state) &&
  typeof value.source === "string" &&
  FINANCIAL_SOURCES.has(value.source) &&
  typeof value.requiresPaymentAction === "boolean" &&
  typeof value.canOpenPortal === "boolean" &&
  typeof value.canSubscribe === "boolean" &&
  (value.accessUntil === undefined || typeof value.accessUntil === "string") &&
  (value.billingStatus === undefined || typeof value.billingStatus === "string");

const responseBody = async (response: Response): Promise<BillingStatusResponseBody> => {
  try {
    return await response.json() as BillingStatusResponseBody;
  } catch {
    return {};
  }
};

export const fetchBillingStatus = async (
  user: BillingStatusUser,
  fetchStatus: typeof fetch = fetch,
): Promise<BillingStatusDto> => {
  const idToken = await user.getIdToken();
  const response = await fetchStatus("/api/billing/status", {
    method: "GET",
    headers: { Authorization: `Bearer ${idToken}` },
    cache: "no-store",
  });
  const body = await responseBody(response);
  if (!response.ok || !isBillingStatusDto(body)) throw new Error(STATUS_ERROR);
  return body;
};

export const useBillingStatus = (user: BillingStatusUser | null): BillingStatusClientState => {
  const [state, setState] = useState<BillingStatusClientState>({
    loading: Boolean(user),
    data: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    if (!user) {
      setState({ loading: false, data: null, error: null });
      return () => { active = false; };
    }

    setState({ loading: true, data: null, error: null });
    fetchBillingStatus(user)
      .then((data) => {
        if (active) setState({ loading: false, data, error: null });
      })
      .catch(() => {
        if (active) setState({ loading: false, data: null, error: STATUS_ERROR });
      });

    return () => { active = false; };
  }, [user]);

  return state;
};

const portalMessageFor = (code: unknown): string =>
  typeof code === "string" ? PORTAL_ERROR_MESSAGES[code] ?? PORTAL_ERROR : PORTAL_ERROR;

export const isStripePortalUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === "billing.stripe.com";
  } catch {
    return false;
  }
};

export const createPortalHandler = ({
  getCurrentUser,
  fetch: fetchPortal,
  redirect,
  onStatusChange,
}: {
  getCurrentUser: () => BillingStatusUser | null;
  fetch: typeof fetch;
  redirect: (url: string) => void;
  onStatusChange: (status: PortalUiStatus) => void;
}) => {
  let inFlight = false;

  return async function openPortal() {
    if (inFlight) return;
    inFlight = true;
    onStatusChange({ state: "loading" });

    try {
      const user = getCurrentUser();
      if (!user) throw new Error(PORTAL_ERROR);
      const idToken = await user.getIdToken();
      const response = await fetchPortal("/api/billing/portal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(portalMessageFor(body.error?.code));
      if (!isStripePortalUrl(body.url)) throw new Error(PORTAL_ERROR);

      redirect(body.url);
      onStatusChange({ state: "idle" });
    } catch (error) {
      const knownMessages = new Set([...Object.values(PORTAL_ERROR_MESSAGES), PORTAL_ERROR]);
      onStatusChange({
        state: "error",
        message: error instanceof Error && knownMessages.has(error.message)
          ? error.message
          : PORTAL_ERROR,
      });
    } finally {
      inFlight = false;
    }
  };
};
