import assert from "node:assert/strict";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import type { BillingRecord, StripeBillingStatus } from "../src/lib/billingTypes.ts";
import {
  BEAUTYPRO_START_MONTHLY_PRICE_CENTS,
  CURRENT_SUBSCRIBER_STATUSES,
  appointmentQueryRangeFor,
  calculateMasterOverview,
  type AppointmentReference,
  type OverviewReferences,
} from "../src/lib/masterOverviewMetrics.ts";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const DAY = 86_400_000;
type Options = Readonly<{
  plan?: "free" | "pro";
  trialDeadline?: Date;
  userCreatedAt?: Date;
  pageCreatedAt?: Date;
  timezone?: string;
}>;

const tenant = (id: string, options: Options = {}) => {
  const pageSlug = `page-${id.replace(/[^a-z0-9-]/g, "-").slice(0, 80)}`;
  return {
    ownerId: id,
    pageSlug,
    user: {
      id,
      role: "owner",
      pageSlug,
      plan: options.plan ?? "free",
      trialDeadline: options.trialDeadline,
      createdAt: options.userCreatedAt,
    },
    page: {
      id: pageSlug,
      userId: id,
      slug: pageSlug,
      plan: options.plan ?? "free",
      trialDeadline: options.trialDeadline,
      createdAt: options.pageCreatedAt,
      timezone: options.timezone,
    },
  };
};

const bill = (
  entry: ReturnType<typeof tenant>,
  status: StripeBillingStatus,
  pastDueSince?: Date,
): BillingRecord => ({
  ownerId: entry.ownerId,
  pageSlug: entry.pageSlug,
  status,
  stripeSubscriptionId: `sub-${entry.ownerId}`,
  currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY),
  pastDueSince,
  createdAt: new Date(NOW.getTime() - 60 * DAY),
  updatedAt: NOW,
});

const refs = (
  tenants: readonly ReturnType<typeof tenant>[],
  billing: readonly BillingRecord[] = [],
): OverviewReferences => ({
  users: tenants.map(({ user }) => user),
  pages: tenants.map(({ page }) => page),
  billing,
});

test("KPIs reutilizam entitlements canônicos e excluem ADMIN_BYPASS", () => {
  const active = tenant("active-owner");
  const trialing = tenant("trialing-owner");
  const trial = tenant("trial-owner", {
    plan: "pro", trialDeadline: new Date(NOW.getTime() + 10 * DAY),
  });
  const pastDue = tenant("past-due-owner");
  const blocked = tenant("blocked-owner");
  const admin = tenant(OFFICIAL_SUPERADMIN_UID, { plan: "pro" });
  const result = calculateMasterOverview(refs(
    [active, trialing, trial, pastDue, blocked, admin],
    [
      bill(active, "active"),
      bill(trialing, "trialing"),
      bill(pastDue, "past_due", new Date(NOW.getTime() - DAY)),
      bill(blocked, "canceled"),
    ],
  ), [], NOW);

  assert.deepEqual(result.tenants, { total: 5, active: 4, trial: 1, blocked: 1 });
  assert.deepEqual(result.billing, {
    subscribers: 3,
    activeSubscriptions: 1,
    pastDue: 1,
    mrrCents: BEAUTYPRO_START_MONTHLY_PRICE_CENTS,
  });
  assert.deepEqual(result.alerts, { pastDue: 1, blocked: 1, trialsEndingSoon: 0 });
  assert.deepEqual(CURRENT_SUBSCRIBER_STATUSES, [
    "trialing", "active", "past_due", "unpaid", "incomplete", "paused",
  ]);
  assert.equal(CURRENT_SUBSCRIBER_STATUSES.includes("canceled" as never), false);
});

test("MRR em centavos cobre 0, 1 e 3 subscriptions active", () => {
  for (const [quantity, expected] of [[0, 0], [1, 2_990], [3, 8_970]] as const) {
    const tenants = Array.from({ length: quantity }, (_, index) => tenant(`mrr-${index}`));
    const result = calculateMasterOverview(
      refs(tenants, tenants.map((entry) => bill(entry, "active"))), [], NOW,
    );
    assert.equal(result.billing.activeSubscriptions, quantity);
    assert.equal(result.billing.mrrCents, expected);
  }
});

test("trial ending soon inclui 47h59 e 48h, mas exclui >48h, expirado, Stripe e legacy", () => {
  const trialAt = (id: string, remaining: number) => tenant(id, {
    plan: "pro", trialDeadline: new Date(NOW.getTime() + remaining),
  });
  const within = trialAt("trial-within", 47 * 3_600_000 + 59 * 60_000);
  const exact = trialAt("trial-exact", 48 * 3_600_000);
  const beyond = trialAt("trial-beyond", 48 * 3_600_000 + 1);
  const expired = trialAt("trial-expired", -1);
  const stripe = trialAt("trial-stripe", 3_600_000);
  const legacy = tenant("legacy-owner", { plan: "pro" });
  const result = calculateMasterOverview(
    refs([within, exact, beyond, expired, stripe, legacy], [bill(stripe, "active")]), [], NOW,
  );
  assert.equal(result.tenants.trial, 3);
  assert.equal(result.alerts.trialsEndingSoon, 2);
  assert.equal(result.tenants.blocked, 1);
});

const appointmentsFor = (pageSlug: string): readonly AppointmentReference[] => [
  { pageSlug, startAt: new Date("2026-08-23T19:00:00Z"), status: "confirmed" },
  { pageSlug, startAt: new Date("2026-08-22T19:00:00Z"), status: "pending" },
  { pageSlug, startAt: new Date("2026-08-17T03:00:00Z"), status: "completed" },
  { pageSlug, startAt: new Date("2026-08-16T19:00:00Z"), status: "confirmed" },
  { pageSlug, startAt: new Date("2026-07-31T19:00:00Z"), status: "confirmed" },
  { pageSlug, startAt: new Date("2026-08-23T20:00:00Z"), status: "canceled" },
];

test("appointments usam o calendário do tenant, invariável entre runtime UTC e Auckland", () => {
  const owner = tenant("appointments-owner", { plan: "pro", timezone: "America/Bahia" });
  const originalTimezone = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const utc = calculateMasterOverview(refs([owner]), appointmentsFor(owner.pageSlug), NOW);
    process.env.TZ = "Pacific/Auckland";
    const auckland = calculateMasterOverview(refs([owner]), appointmentsFor(owner.pageSlug), NOW);
    assert.deepEqual(utc.appointments, { today: 1, last7Days: 3, currentMonth: 4 });
    assert.deepEqual(auckland.appointments, utc.appointments);
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("timezone ausente preserva fallback America/Bahia e uma query global cobre o período", () => {
  const explicit = tenant("explicit-tz", { plan: "pro", timezone: "America/Bahia" });
  const fallback = tenant("fallback-tz", { plan: "pro" });
  const a = calculateMasterOverview(refs([explicit]), appointmentsFor(explicit.pageSlug), NOW);
  const b = calculateMasterOverview(refs([fallback]), appointmentsFor(fallback.pageSlug), NOW);
  assert.deepEqual(b.appointments, a.appointments);
  const range = appointmentQueryRangeFor(refs([explicit, fallback]), NOW);
  assert.ok(range);
  assert.ok(range.startAt <= new Date("2026-08-01T03:00:00Z"));
  assert.ok(range.endAt >= new Date("2026-09-01T03:00:00Z"));
});

test("crescimento usa a data mais recente de user e page e fronteiras inclusivas", () => {
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
  const tenants = [
    tenant("growth-7", { plan: "pro", userCreatedAt: ago(7), pageCreatedAt: ago(7) }),
    tenant("growth-divergent", { plan: "pro", userCreatedAt: ago(40), pageCreatedAt: ago(20) }),
    tenant("growth-30", { plan: "pro", userCreatedAt: ago(30), pageCreatedAt: ago(30) }),
    tenant("growth-out", { plan: "pro", userCreatedAt: ago(31), pageCreatedAt: ago(31) }),
    tenant("growth-missing", { plan: "pro", userCreatedAt: ago(1) }),
    tenant("growth-future", {
      plan: "pro",
      userCreatedAt: new Date(NOW.getTime() + 1),
      pageCreatedAt: new Date(NOW.getTime() + 1),
    }),
  ];
  assert.deepEqual(
    calculateMasterOverview(refs(tenants), [], NOW).growth,
    { newTenants7Days: 1, newTenants30Days: 3 },
  );
});

test("DTO é sanitizado e não propaga PII", () => {
  const owner = tenant("pii-owner", { plan: "pro" });
  const input = {
    users: [{ ...owner.user, email: "secret@example.test", phone: "555" }],
    pages: [{ ...owner.page, customerName: "Secret Person", notes: "hidden" }],
    billing: [],
  } as unknown as OverviewReferences;
  const result = calculateMasterOverview(input, [{
    pageSlug: owner.pageSlug,
    startAt: NOW,
    status: "confirmed",
    customerEmail: "customer@example.test",
  } as unknown as AppointmentReference], NOW);
  assert.deepEqual(Object.keys(result).sort(), [
    "alerts", "appointments", "billing", "generatedAt", "growth", "tenants",
  ]);
  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["secret", "email", "phone", "customer", "notes", owner.ownerId]) {
    assert.equal(serialized.includes(forbidden.toLowerCase()), false, forbidden);
  }
});
