import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  fetchMasterOverview,
  formatMrrCents,
  isMasterOverviewDto,
} from "../src/lib/masterOverviewClient.ts";

const OVERVIEW = {
  tenants: { total: 12, active: 8, trial: 2, blocked: 1 },
  billing: { subscribers: 6, activeSubscriptions: 5, pastDue: 1, mrrCents: 8_970 },
  appointments: { today: 4, last7Days: 21, currentMonth: 67 },
  growth: { newTenants7Days: 2, newTenants30Days: 7 },
  alerts: { pastDue: 1, blocked: 1, trialsEndingSoon: 2 },
  generatedAt: "2026-08-23T12:00:00.000Z",
};

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

test("Overview envia GET com Authorization Bearer e nenhuma autoridade no browser", async () => {
  let tokenCalls = 0;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const result = await fetchMasterOverview({
    async getIdToken() { tokenCalls += 1; return "secure-token"; },
  }, async (input, init) => {
    calls.push({ input, init });
    return response(200, OVERVIEW);
  });

  assert.equal(tokenCalls, 1);
  assert.equal(calls[0].input, "/api/master/overview");
  assert.equal(calls[0].init?.method, "GET");
  assert.equal(calls[0].init?.cache, "no-store");
  assert.deepEqual(calls[0].init?.headers, { Authorization: "Bearer secure-token" });
  const serialized = JSON.stringify(calls[0]);
  for (const forbidden of ["email", "role", "isSuperAdmin", "uid", "query"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(result, OVERVIEW);
});

test("cliente recusa erro HTTP e DTO incompleto com mensagem administrativa", async () => {
  const user = { getIdToken: async () => "token" };
  for (const apiResponse of [
    response(503, { error: { code: "MASTER_OVERVIEW_UNAVAILABLE", detail: "secret" } }),
    response(200, { ...OVERVIEW, alerts: {} }),
  ]) {
    await assert.rejects(
      () => fetchMasterOverview(user, async () => apiResponse),
      /Não foi possível carregar o resumo da plataforma\./,
    );
  }
});

test("validação cobre todo o DTO e rejeita contagens inválidas", () => {
  assert.equal(isMasterOverviewDto(OVERVIEW), true);
  assert.equal(isMasterOverviewDto({ ...OVERVIEW, billing: { ...OVERVIEW.billing, mrrCents: -1 } }), false);
  assert.equal(isMasterOverviewDto({ ...OVERVIEW, appointments: { ...OVERVIEW.appointments, today: 1.5 } }), false);
  assert.equal(isMasterOverviewDto({ ...OVERVIEW, generatedAt: "invalid" }), false);
});

test("MRR em centavos é somente formatado em BRL", () => {
  assert.equal(formatMrrCents(2_990).replace(/\s/g, " "), "R$ 29,90");
  assert.equal(formatMrrCents(8_970).replace(/\s/g, " "), "R$ 89,70");
});

test("UI cobre loading, sucesso, erro, todos os blocos e zero alerts", async () => {
  const source = await readFile("src/components/master/MasterDashboard.tsx", "utf8");
  for (const expected of [
    'status: "loading"', 'status: "success"', 'status: "error"',
    "Carregando resumo da plataforma", "masterOverviewErrorMessage",
    "data.tenants.total", "data.tenants.active", "data.billing.subscribers",
    "data.billing.mrrCents", "data.tenants.trial", "data.billing.activeSubscriptions",
    "data.billing.pastDue", "data.tenants.blocked", "data.appointments.today",
    "data.appointments.last7Days", "data.appointments.currentMonth",
    "data.growth.newTenants7Days", "data.growth.newTenants30Days",
    "data.alerts.pastDue", "data.alerts.blocked", "data.alerts.trialsEndingSoon",
    "Nenhum alerta crítico no momento.", "Saúde comercial", "Atividade da plataforma",
    "Crescimento", "Atenção do Sábio",
  ]) assert.equal(source.includes(expected), true, expected);
});

test("sidebar, responsividade, acessibilidade e tabela Master permanecem disponíveis", async () => {
  const [component, dashboard] = await Promise.all([
    readFile("src/components/master/MasterDashboard.tsx", "utf8"),
    readFile("src/app/admin/dashboard/page.tsx", "utf8"),
  ]);
  for (const item of ["Visão Geral", "Tenants", "Billing", "Trials", "Alertas"]) {
    assert.equal(component.includes(item), true, item);
  }
  assert.match(component, /<table/);
  assert.match(component, /md:hidden/);
  assert.match(component, /lg:grid-cols-/);
  assert.match(component, /aria-labelledby=/);
  assert.match(component, /focus-visible:ring-2/);
  assert.match(component, /onManageTenant\(tenant\.uid\)/);
  assert.match(component, /onTogglePlan\(tenant\)/);
  assert.match(dashboard, /setAdminViewId\(uid\); setActiveTab\('agenda'\)/);
  assert.match(dashboard, /updateMasterPlan\(u\.uid,/);
  assert.match(dashboard, /<MasterDashboard/);
});
