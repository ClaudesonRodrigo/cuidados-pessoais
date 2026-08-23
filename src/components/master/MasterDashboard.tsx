"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  FaBell, FaBolt, FaBuilding, FaCalendarCheck, FaChartLine, FaCheckCircle,
  FaCreditCard, FaExclamationCircle, FaHourglassHalf, FaShieldAlt, FaStore,
  FaToggleOff, FaToggleOn, FaUsers,
} from "react-icons/fa";
import type { MasterOverviewDto } from "@/lib/masterOverviewMetrics";
import {
  fetchMasterOverview,
  formatMrrCents,
  masterOverviewErrorMessage,
  type MasterOverviewUser,
} from "@/lib/masterOverviewClient";

type MasterUser = {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  plan?: string | null;
};

type Props = {
  user: MasterOverviewUser;
  tenants: MasterUser[];
  onManageTenant: (uid: string) => void;
  onTogglePlan: (tenant: MasterUser) => Promise<void>;
};

type OverviewState =
  | { status: "loading"; data: null }
  | { status: "success"; data: MasterOverviewDto }
  | { status: "error"; data: null };

const navItems = [
  { href: "#master-overview", label: "Visão Geral", icon: FaChartLine },
  { href: "#master-tenants", label: "Tenants", icon: FaBuilding },
  { href: "#master-billing", label: "Billing", icon: FaCreditCard },
  { href: "#master-trials", label: "Trials", icon: FaHourglassHalf },
  { href: "#master-alerts", label: "Alertas", icon: FaBell },
];

function MetricCard({ label, value, icon, accent = "purple" }: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  accent?: "purple" | "pink" | "green" | "blue";
}) {
  const accents = {
    purple: "from-purple-500/20 text-purple-300 border-purple-400/20",
    pink: "from-pink-500/20 text-pink-300 border-pink-400/20",
    green: "from-emerald-500/20 text-emerald-300 border-emerald-400/20",
    blue: "from-sky-500/20 text-sky-300 border-sky-400/20",
  };
  return (
    <article className={`rounded-3xl border bg-linear-to-br ${accents[accent]} to-white/[0.025] p-5 shadow-xl shadow-black/10`}>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <span className="rounded-xl bg-white/5 p-2.5" aria-hidden="true">{icon}</span>
      </div>
      <p className="text-3xl font-black tracking-tight text-white sm:text-4xl">{value}</p>
    </article>
  );
}

function HealthCard({ label, value, tone, zeroLabel }: {
  label: string;
  value: number;
  tone: "trial" | "active" | "due" | "blocked";
  zeroLabel?: string;
}) {
  const styles = {
    trial: "border-amber-400/20 bg-amber-400/[0.07] text-amber-300",
    active: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
    due: value === 0 ? "border-slate-700 bg-slate-800/50 text-slate-300" : "border-orange-400/25 bg-orange-400/[0.08] text-orange-300",
    blocked: value === 0 ? "border-slate-700 bg-slate-800/50 text-slate-300" : "border-rose-400/25 bg-rose-400/[0.08] text-rose-300",
  };
  return (
    <article className={`rounded-2xl border p-5 ${styles[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-black text-white">{value}</p>
        </div>
        <span className="rounded-full border border-current/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider">
          {value === 0 && zeroLabel ? zeroLabel : tone === "active" ? "Ativas" : tone === "trial" ? "Em curso" : "Atenção"}
        </span>
      </div>
    </article>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-label="Carregando resumo da plataforma" role="status" className="space-y-8">
      <span className="sr-only">Carregando resumo da plataforma</span>
      <div className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-3xl border border-white/5 bg-white/[0.045]" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-white/5 bg-white/[0.035]" />)}
      </div>
      <div className="h-48 animate-pulse rounded-3xl border border-white/5 bg-white/[0.035]" />
    </div>
  );
}

function TenantAvatar({ tenant }: { tenant: MasterUser }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-xs font-black uppercase text-purple-300">{tenant.displayName?.charAt(0) || "?"}</span>;
}

function PlanBadge({ plan }: { plan?: string | null }) {
  const pro = plan === "pro";
  return <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-wider ${pro ? "border-purple-400/25 bg-purple-400/10 text-purple-300" : "border-slate-600 bg-slate-800 text-slate-400"}`}>{plan || "free"}</span>;
}

function TenantRow({ tenant, onManageTenant, onTogglePlan }: { tenant: MasterUser; onManageTenant: Props["onManageTenant"]; onTogglePlan: Props["onTogglePlan"] }) {
  return (
    <tr className="transition-colors hover:bg-purple-500/[0.045]">
      <td className="p-4"><div className="flex items-center gap-3"><TenantAvatar tenant={tenant} /><span className="font-bold text-slate-200">{tenant.displayName || "Sem Nome"}</span></div></td>
      <td className="p-4 text-slate-400">{tenant.email || "Email não informado"}</td>
      <td className="p-4"><PlanBadge plan={tenant.plan} /></td>
      <td className="p-4"><div className="flex justify-end gap-2">
        <button type="button" onClick={() => onManageTenant(tenant.uid)} className="rounded-xl bg-purple-600 p-3 text-white outline-none transition hover:bg-purple-500 focus-visible:ring-2 focus-visible:ring-pink-400" title="Gerenciar tenant" aria-label={`Gerenciar ${tenant.displayName || "tenant"}`}><FaStore size={14} /></button>
        <button type="button" onClick={() => void onTogglePlan(tenant)} className={`rounded-xl border p-3 outline-none transition focus-visible:ring-2 focus-visible:ring-pink-400 ${tenant.plan === "pro" ? "border-rose-400/25 bg-rose-400/10 text-rose-300" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"}`} title="Alterar plano" aria-label={`Alterar plano de ${tenant.displayName || "tenant"}`}>{tenant.plan === "pro" ? <FaToggleOff size={16} /> : <FaToggleOn size={16} />}</button>
      </div></td>
    </tr>
  );
}

function TenantDirectory({ tenants, onManageTenant, onTogglePlan }: Omit<Props, "user">) {
  return (
    <section id="master-tenants" aria-labelledby="master-tenants-title" className="scroll-mt-28 rounded-3xl border border-white/10 bg-[#151522] p-4 shadow-2xl sm:p-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-300">Diretório Master</p><h2 id="master-tenants-title" className="mt-2 text-xl font-black text-white">Tenants</h2></div>
        <span className="rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-xs font-bold text-purple-200">{tenants.length} carregados</span>
      </div>
      <div className="hidden overflow-hidden rounded-2xl border border-white/10 md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.035] text-[9px] font-black uppercase tracking-[0.18em] text-slate-500"><tr><th className="p-4">Salão</th><th className="p-4">Email</th><th className="p-4">Plano</th><th className="p-4 text-right">Ações</th></tr></thead>
          <tbody className="divide-y divide-white/[0.06]">{tenants.map((tenant) => <TenantRow key={tenant.uid} tenant={tenant} onManageTenant={onManageTenant} onTogglePlan={onTogglePlan} />)}</tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {tenants.map((tenant) => (
          <article key={tenant.uid} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex min-w-0 items-center gap-3"><TenantAvatar tenant={tenant} /><div className="min-w-0 flex-1"><p className="truncate font-bold text-white">{tenant.displayName || "Sem Nome"}</p><p className="truncate text-xs text-slate-400">{tenant.email || "Email não informado"}</p></div><PlanBadge plan={tenant.plan} /></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onManageTenant(tenant.uid)} className="rounded-xl bg-purple-600 px-3 py-3 text-xs font-black text-white outline-none transition hover:bg-purple-500 focus-visible:ring-2 focus-visible:ring-pink-400">Gerenciar</button>
              <button type="button" onClick={() => void onTogglePlan(tenant)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-200 outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-pink-400">Alterar plano</button>
            </div>
          </article>
        ))}
      </div>
      {tenants.length === 0 && <p className="py-10 text-center text-sm text-slate-400">Nenhum tenant disponível.</p>}
    </section>
  );
}

function OverviewContent({ data }: { data: MasterOverviewDto }) {
  const noAlerts = data.alerts.pastDue === 0 && data.alerts.blocked === 0 && data.alerts.trialsEndingSoon === 0;
  return (
    <div className="space-y-8">
      <section id="master-overview" aria-labelledby="master-overview-title" className="scroll-mt-28 space-y-4">
        <h2 id="master-overview-title" className="sr-only">Visão Geral</h2>
        <div className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Tenants" value={data.tenants.total} icon={<FaBuilding />} />
          <MetricCard label="Ativos" value={data.tenants.active} icon={<FaBolt />} accent="green" />
          <MetricCard label="Assinantes" value={data.billing.subscribers} icon={<FaUsers />} accent="pink" />
          <MetricCard label="MRR" value={formatMrrCents(data.billing.mrrCents)} icon={<FaCreditCard />} accent="blue" />
        </div>
      </section>
      <section id="master-billing" aria-labelledby="commercial-health-title" className="scroll-mt-28 space-y-4">
        <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-300">Pulso do negócio</p><h2 id="commercial-health-title" className="mt-1 text-xl font-black text-white">Saúde comercial</h2></div>
        <div className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 xl:grid-cols-4">
          <div id="master-trials" className="scroll-mt-28"><HealthCard label="Trials ativos" value={data.tenants.trial} tone="trial" zeroLabel="Nenhum" /></div>
          <HealthCard label="Assinaturas ativas" value={data.billing.activeSubscriptions} tone="active" zeroLabel="Nenhuma" />
          <HealthCard label="Past due" value={data.billing.pastDue} tone="due" zeroLabel="Em dia" />
          <HealthCard label="Bloqueados" value={data.tenants.blocked} tone="blocked" zeroLabel="Sem bloqueios" />
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="platform-activity-title" className="rounded-3xl border border-white/10 bg-[#151522] p-6">
          <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-purple-500/15 p-3 text-purple-300"><FaCalendarCheck /></span><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-300">Operação</p><h2 id="platform-activity-title" className="text-xl font-black text-white">Atividade da plataforma</h2></div></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[["Agendamentos hoje", data.appointments.today], ["Últimos 7 dias", data.appointments.last7Days], ["Mês atual", data.appointments.currentMonth]].map(([label, value]) => <article key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-3 text-3xl font-black text-white">{value}</p></article>)}
          </div>
        </section>
        <section aria-labelledby="growth-title" className="rounded-3xl border border-purple-400/15 bg-linear-to-br from-purple-500/10 to-pink-500/[0.04] p-6">
          <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-pink-500/15 p-3 text-pink-300"><FaChartLine /></span><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-pink-300">Expansão</p><h2 id="growth-title" className="text-xl font-black text-white">Crescimento</h2></div></div>
          <div className="grid grid-cols-2 gap-3"><article className="rounded-2xl bg-black/15 p-4"><p className="text-[9px] font-black uppercase leading-relaxed tracking-wider text-slate-400">Novos tenants — 7 dias</p><p className="mt-3 text-3xl font-black text-white">{data.growth.newTenants7Days}</p></article><article className="rounded-2xl bg-black/15 p-4"><p className="text-[9px] font-black uppercase leading-relaxed tracking-wider text-slate-400">Novos tenants — 30 dias</p><p className="mt-3 text-3xl font-black text-white">{data.growth.newTenants30Days}</p></article></div>
        </section>
      </div>
      <section id="master-alerts" aria-labelledby="sage-attention-title" className={`scroll-mt-28 rounded-3xl border p-6 ${noAlerts ? "border-emerald-400/20 bg-emerald-400/[0.055]" : "border-pink-400/20 bg-linear-to-r from-pink-500/10 to-purple-500/10"}`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4"><span className={`rounded-2xl p-4 ${noAlerts ? "bg-emerald-400/15 text-emerald-300" : "bg-pink-400/15 text-pink-300"}`}>{noAlerts ? <FaCheckCircle size={22} /> : <FaExclamationCircle size={22} />}</span><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-pink-300">Leitura executiva</p><h2 id="sage-attention-title" className="mt-1 text-2xl font-black text-white">Atenção do Sábio</h2>{noAlerts && <p className="mt-2 text-sm font-semibold text-emerald-200">Nenhum alerta crítico no momento.</p>}</div></div>
          {!noAlerts && <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-3">{[["Past due", data.alerts.pastDue], ["Bloqueados", data.alerts.blocked], ["Trials terminando em breve", data.alerts.trialsEndingSoon]].map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3"><p className="text-2xl font-black text-white">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p></article>)}</div>}
        </div>
      </section>
    </div>
  );
}

export function MasterDashboard(props: Props) {
  const [overview, setOverview] = useState<OverviewState>({ status: "loading", data: null });
  useEffect(() => {
    let active = true;
    setOverview({ status: "loading", data: null });
    fetchMasterOverview(props.user)
      .then((data) => { if (active) setOverview({ status: "success", data }); })
      .catch(() => { if (active) setOverview({ status: "error", data: null }); });
    return () => { active = false; };
  }, [props.user]);
  return (
    <section aria-labelledby="master-dashboard-title" className="relative overflow-hidden rounded-[2rem] border border-purple-400/15 bg-[#0c0c14] text-slate-100 shadow-2xl shadow-purple-950/20 sm:rounded-[2.5rem]">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-purple-600/15 blur-3xl" /><div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-pink-600/[0.07] blur-3xl" />
      <header className="relative border-b border-white/[0.07] px-5 py-7 sm:px-8 sm:py-9"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 flex items-center gap-2 text-purple-300"><FaShieldAlt aria-hidden="true" /><span className="text-[10px] font-black uppercase tracking-[0.22em]">Master / Super Admin</span></div><h1 id="master-dashboard-title" className="font-serif-luxury text-3xl font-bold italic tracking-tight text-white sm:text-4xl">Central do Sábio</h1><p className="mt-2 text-sm font-semibold text-slate-400">Gestão global do ecossistema BeautyPro</p></div><div className="flex items-center gap-2 self-start rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-purple-200"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Acesso global</div></div></header>
      <nav aria-label="Navegação Master" className="relative grid grid-cols-2 gap-2 border-b border-white/[0.07] p-3 min-[440px]:grid-cols-3 lg:hidden">{navItems.map(({ href, label, icon: Icon }) => <a key={href} href={href} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-400 outline-none transition hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-pink-400"><Icon aria-hidden="true" />{label}</a>)}</nav>
      <div className="relative grid lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/[0.07] p-4 lg:block"><nav aria-label="Navegação lateral Master" className="sticky top-28 space-y-1">{navItems.map(({ href, label, icon: Icon }, index) => <a key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-pink-400 ${index === 0 ? "bg-purple-500/15 text-purple-200" : "text-slate-500 hover:bg-white/5 hover:text-white"}`}><Icon aria-hidden="true" />{label}</a>)}</nav></aside>
        <div className="min-w-0 space-y-8 p-4 sm:p-6 lg:p-8">
          {overview.status === "loading" && <OverviewSkeleton />}
          {overview.status === "error" && <div role="alert" className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5 text-sm font-semibold text-slate-300"><span className="mr-2 text-slate-400" aria-hidden="true">●</span>{masterOverviewErrorMessage}</div>}
          {overview.status === "success" && <OverviewContent data={overview.data} />}
          <TenantDirectory tenants={props.tenants} onManageTenant={props.onManageTenant} onTogglePlan={props.onTogglePlan} />
        </div>
      </div>
    </section>
  );
}
