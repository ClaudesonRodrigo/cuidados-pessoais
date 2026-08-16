'use client';

import { useRef, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import {
  createPortalHandler,
  type PortalUiStatus,
} from "@/lib/billingStatusClient";
import type { BillingStatusDto } from "@/lib/billingStatusService";

type SubscriptionCardProps = {
  data: BillingStatusDto | null;
  loading: boolean;
  error: string | null;
  onSubscribe: () => void;
};

export type SubscriptionCardContent = {
  badge: string;
  title: string;
  copy: string;
  action?: "portal" | "subscribe";
  actionLabel?: string;
  showAccessUntil?: boolean;
};

export const getSubscriptionCardContent = (
  data: BillingStatusDto,
): SubscriptionCardContent => {
  if (data.state === "ADMIN_BYPASS") {
    return {
      badge: "Acesso administrativo",
      title: "BeautyPro — Administração",
      copy: "Seu acesso administrativo não depende de uma assinatura Stripe.",
    };
  }

  if (data.state === "TRIAL_ACTIVE") {
    return {
      badge: "Teste grátis ativo",
      title: "Seu BeautyPro está em período de teste",
      copy: "Aproveite todos os recursos disponíveis durante o período de teste.",
      ...(data.canSubscribe
        ? { action: "subscribe" as const, actionLabel: "Assinar BeautyPro" }
        : data.canOpenPortal
          ? { action: "portal" as const, actionLabel: "Gerenciar assinatura" }
          : {}),
      showAccessUntil: true,
    };
  }

  if (data.state === "ACTIVE" && data.source === "stripe") {
    return {
      badge: "Assinatura ativa",
      title: "BeautyPro Start ativo",
      copy: "Sua assinatura está ativa.",
      ...(data.canOpenPortal
        ? { action: "portal" as const, actionLabel: "Gerenciar assinatura" }
        : data.canSubscribe
          ? { action: "subscribe" as const, actionLabel: "Assinar BeautyPro" }
          : {}),
    };
  }

  if (data.state === "ACTIVE" && data.source === "legacy_grant") {
    return {
      badge: "Acesso ativo",
      title: "Acesso BeautyPro ativo",
      copy: "Seu acesso ao BeautyPro está ativo.",
      ...(data.canOpenPortal
        ? { action: "portal" as const, actionLabel: "Gerenciar assinatura" }
        : data.canSubscribe
          ? { action: "subscribe" as const, actionLabel: "Assinar BeautyPro" }
          : {}),
    };
  }

  if (data.state === "PAST_DUE_GRACE") {
    return {
      badge: "Pagamento pendente",
      title: "Regularize sua assinatura",
      copy: "Identificamos um problema no pagamento da sua assinatura. Seu acesso permanece disponível temporariamente durante o período de tolerância.",
      ...(data.canOpenPortal
        ? { action: "portal" as const, actionLabel: "Regularizar pagamento" }
        : data.canSubscribe
          ? { action: "subscribe" as const, actionLabel: "Assinar BeautyPro" }
          : {}),
      showAccessUntil: true,
    };
  }

  if (data.state === "BLOCKED" || data.state === "ACTIVE") return {
    badge: "Acesso inativo",
    title: "Acesso comercial inativo",
    copy: "Sua conta não possui acesso comercial ativo no momento.",
    ...(data.canOpenPortal
      ? { action: "portal" as const, actionLabel: "Regularizar assinatura" }
      : data.canSubscribe
        ? { action: "subscribe" as const, actionLabel: "Assinar BeautyPro" }
        : {}),
  };

  throw new Error("Estado comercial inválido.");
};

const formatAccessUntil = (value: string | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
};

export function SubscriptionCard({ data, loading, error, onSubscribe }: SubscriptionCardProps) {
  const [portalStatus, setPortalStatus] = useState<PortalUiStatus>({ state: "idle" });
  const portalHandler = useRef<ReturnType<typeof createPortalHandler> | null>(null);
  if (!portalHandler.current) {
    portalHandler.current = createPortalHandler({
      getCurrentUser: () => auth.currentUser,
      fetch: (input, init) => window.fetch(input, init),
      redirect: (url) => window.location.assign(url),
      onStatusChange: setPortalStatus,
    });
  }

  if (loading) {
    return (
      <section aria-label="Assinatura BeautyPro" className="rounded-[2rem] border border-purple-100 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-purple-400 animate-pulse">Consultando sua assinatura...</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section aria-label="Assinatura BeautyPro" className="rounded-[2rem] border border-red-100 bg-white p-6 shadow-sm">
        <p role="alert" className="text-sm font-medium text-red-600">{error || "Não foi possível consultar sua assinatura."}</p>
      </section>
    );
  }

  const content = getSubscriptionCardContent(data);
  const accessUntil = content.showAccessUntil ? formatAccessUntil(data.accessUntil) : null;
  const portalLoading = portalStatus.state === "loading";

  return (
    <section aria-label="Assinatura BeautyPro" className="rounded-[2rem] border border-purple-100 bg-white p-6 shadow-xl shadow-purple-50">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <span className="inline-flex rounded-full bg-purple-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-purple-700">
            {content.badge}
          </span>
          <h2 className="text-xl font-black tracking-tight text-gray-900">{content.title}</h2>
          <p className="max-w-2xl text-sm font-medium text-gray-500">{content.copy}</p>
          {accessUntil && (
            <p className="text-xs font-bold text-purple-600">Acesso disponível até {accessUntil}.</p>
          )}
        </div>
        {content.action && (
          <button
            type="button"
            onClick={content.action === "portal" ? () => portalHandler.current?.() : onSubscribe}
            disabled={content.action === "portal" && portalLoading}
            className="shrink-0 rounded-2xl bg-gray-900 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {content.action === "portal" && portalLoading
              ? "Abrindo gerenciamento..."
              : content.actionLabel}
          </button>
        )}
      </div>
      {portalStatus.state === "error" && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600">{portalStatus.message}</p>
      )}
    </section>
  );
}
