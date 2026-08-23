import { resolveCommercialEntitlementForAccounts } from "./commercialAccessService.ts";
import type { BillingRecord, StripeBillingStatus } from "./billingTypes.ts";
import {
  addDaysToLocalDate,
  getZonedDateTimeParts,
  localDateTimeToUtc,
  resolveBusinessTimeZone,
} from "./timezone.ts";

const PAGE_SLUG_PATTERN = /^[a-z0-9-]{3,120}$/;
const MAX_OWNER_ID_LENGTH = 1_500;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const COUNTED_APPOINTMENT_STATUSES = new Set(["pending", "confirmed", "completed"]);

export const BEAUTYPRO_START_MONTHLY_PRICE_CENTS = 2_990;
export const TRIAL_ENDING_SOON_MS = 48 * 60 * 60 * 1_000;
export const CURRENT_SUBSCRIBER_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
] as const satisfies readonly StripeBillingStatus[];

const currentSubscriberStatuses = new Set<StripeBillingStatus>(CURRENT_SUBSCRIBER_STATUSES);

export type TenantUserReference = Readonly<{
  id: string;
  pageSlug: unknown;
  role: unknown;
  plan?: unknown;
  trialDeadline?: unknown;
  createdAt?: unknown;
}>;

export type TenantPageReference = Readonly<{
  id: string;
  userId: unknown;
  slug: unknown;
  plan?: unknown;
  trialDeadline?: unknown;
  createdAt?: unknown;
  timezone?: unknown;
}>;

export type OverviewReferences = Readonly<{
  users: readonly TenantUserReference[];
  pages: readonly TenantPageReference[];
  billing: readonly BillingRecord[];
}>;

export type AppointmentReference = Readonly<{
  pageSlug: unknown;
  startAt: unknown;
  status: unknown;
}>;

export type AppointmentQueryRange = Readonly<{ startAt: Date; endAt: Date }>;

export type MasterOverviewDto = Readonly<{
  tenants: Readonly<{ total: number; active: number; trial: number; blocked: number }>;
  billing: Readonly<{
    subscribers: number;
    activeSubscriptions: number;
    pastDue: number;
    mrrCents: number;
  }>;
  appointments: Readonly<{ today: number; last7Days: number; currentMonth: number }>;
  growth: Readonly<{ newTenants7Days: number; newTenants30Days: number }>;
  alerts: Readonly<{ pastDue: number; blocked: number; trialsEndingSoon: number }>;
  generatedAt: string;
}>;

type ValidTenant = Readonly<{
  ownerId: string;
  pageSlug: string;
  user: TenantUserReference;
  page: TenantPageReference;
  timeZone: string;
}>;

type TenantCalendar = Readonly<{
  today: string;
  last7Start: string;
  monthStart: string;
  nextMonthStart: string;
  timeZone: string;
}>;

const validOwnerId = (value: string): boolean => (
  value.length > 0 &&
  value.length <= MAX_OWNER_ID_LENGTH &&
  !value.includes("/") &&
  !CONTROL_CHARACTERS.test(value)
);

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (
    typeof value === "object" && value !== null &&
    "toDate" in value && typeof value.toDate === "function"
  ) {
    const result = value.toDate();
    return result instanceof Date && Number.isFinite(result.getTime()) ? result : null;
  }
  return null;
};

const nextMonthStartFor = (localDate: string): string => {
  const year = Number(localDate.slice(0, 4));
  const month = Number(localDate.slice(5, 7));
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
};

const validTenants = (references: OverviewReferences): ValidTenant[] => {
  if (
    !Array.isArray(references.users) || !Array.isArray(references.pages) ||
    !Array.isArray(references.billing)
  ) throw new TypeError("Referências do Overview inválidas.");

  const pagesBySlug = new Map<string, TenantPageReference>();
  for (const page of references.pages) {
    if (
      typeof page.id === "string" && PAGE_SLUG_PATTERN.test(page.id) &&
      page.slug === page.id && typeof page.userId === "string" && validOwnerId(page.userId)
    ) pagesBySlug.set(page.id, page);
  }

  const tenants: ValidTenant[] = [];
  const ownerIds = new Set<string>();
  for (const user of references.users) {
    if (
      typeof user.id !== "string" || !validOwnerId(user.id) || ownerIds.has(user.id) ||
      user.role !== "owner" || typeof user.pageSlug !== "string" ||
      !PAGE_SLUG_PATTERN.test(user.pageSlug)
    ) continue;
    const page = pagesBySlug.get(user.pageSlug);
    if (!page || page.userId !== user.id) continue;
    ownerIds.add(user.id);
    tenants.push({
      ownerId: user.id,
      pageSlug: user.pageSlug,
      user,
      page,
      timeZone: resolveBusinessTimeZone(page.timezone),
    });
  }
  return tenants;
};

const calendarFor = (tenant: ValidTenant, now: Date): TenantCalendar => {
  const today = getZonedDateTimeParts(now, tenant.timeZone).date;
  return {
    today,
    last7Start: addDaysToLocalDate(today, -6),
    monthStart: `${today.slice(0, 7)}-01`,
    nextMonthStart: nextMonthStartFor(today),
    timeZone: tenant.timeZone,
  };
};

const canonicalTenantCreatedAt = (tenant: ValidTenant): Date | null => {
  const userCreatedAt = dateValue(tenant.user.createdAt);
  const pageCreatedAt = dateValue(tenant.page.createdAt);
  if (!userCreatedAt || !pageCreatedAt) return null;
  return userCreatedAt > pageCreatedAt ? userCreatedAt : pageCreatedAt;
};

export const countValidTenants = (references: OverviewReferences): number =>
  validTenants(references).length;

export const appointmentQueryRangeFor = (
  references: OverviewReferences,
  now: Date,
): AppointmentQueryRange | null => {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("Instante do Overview inválido.");
  }
  const tenants = validTenants(references);
  if (tenants.length === 0) return null;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const tenant of tenants) {
    const calendar = calendarFor(tenant, now);
    const tomorrow = addDaysToLocalDate(calendar.today, 1);
    const startDate = calendar.last7Start < calendar.monthStart
      ? calendar.last7Start : calendar.monthStart;
    const endDate = tomorrow > calendar.nextMonthStart ? tomorrow : calendar.nextMonthStart;
    minimum = Math.min(
      minimum,
      localDateTimeToUtc(startDate, "00:00", tenant.timeZone).getTime(),
    );
    maximum = Math.max(
      maximum,
      localDateTimeToUtc(endDate, "00:00", tenant.timeZone).getTime(),
    );
  }
  return { startAt: new Date(minimum), endAt: new Date(maximum) };
};

export const calculateMasterOverview = (
  references: OverviewReferences,
  appointments: readonly AppointmentReference[],
  now: Date,
): MasterOverviewDto => {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !Array.isArray(appointments)) {
    throw new TypeError("Dados do Overview inválidos.");
  }
  const tenants = validTenants(references);
  const tenantByPageSlug = new Map(tenants.map((tenant) => [tenant.pageSlug, tenant]));
  const billingByOwner = new Map<string, BillingRecord>();
  for (const billing of references.billing) {
    const tenant = tenantByPageSlug.get(billing.pageSlug);
    if (tenant?.ownerId === billing.ownerId && !billingByOwner.has(billing.ownerId)) {
      billingByOwner.set(billing.ownerId, billing);
    }
  }

  const tenantsMetric = { total: 0, active: 0, trial: 0, blocked: 0 };
  const billingMetric = { subscribers: 0, activeSubscriptions: 0, pastDue: 0, mrrCents: 0 };
  const growth = { newTenants7Days: 0, newTenants30Days: 0 };
  let trialsEndingSoon = 0;

  for (const tenant of tenants) {
    const billing = billingByOwner.get(tenant.ownerId) ?? null;
    const entitlement = resolveCommercialEntitlementForAccounts(
      tenant.ownerId, tenant.user, tenant.page, billing, now,
    );
    if (entitlement.state === "ADMIN_BYPASS") continue;

    tenantsMetric.total += 1;
    const createdAt = canonicalTenantCreatedAt(tenant);
    if (createdAt && createdAt <= now) {
      const age = now.getTime() - createdAt.getTime();
      if (age <= 7 * 24 * 60 * 60 * 1_000) growth.newTenants7Days += 1;
      if (age <= 30 * 24 * 60 * 60 * 1_000) growth.newTenants30Days += 1;
    }

    if (
      billing?.stripeSubscriptionId && billing.status &&
      currentSubscriberStatuses.has(billing.status)
    ) billingMetric.subscribers += 1;
    if (billing?.status === "active") {
      billingMetric.activeSubscriptions += 1;
      billingMetric.mrrCents += BEAUTYPRO_START_MONTHLY_PRICE_CENTS;
    }
    if (billing?.status === "past_due") billingMetric.pastDue += 1;

    if (["ACTIVE", "TRIAL_ACTIVE", "PAST_DUE_GRACE"].includes(entitlement.state)) {
      tenantsMetric.active += 1;
    }
    if (entitlement.state === "TRIAL_ACTIVE") {
      tenantsMetric.trial += 1;
      const remaining = entitlement.accessUntil
        ? entitlement.accessUntil.getTime() - now.getTime()
        : Number.POSITIVE_INFINITY;
      if (
        entitlement.source === "promotional_trial" && remaining > 0 &&
        remaining <= TRIAL_ENDING_SOON_MS
      ) trialsEndingSoon += 1;
    }
    if (entitlement.state === "BLOCKED") tenantsMetric.blocked += 1;
  }

  const appointmentsMetric = { today: 0, last7Days: 0, currentMonth: 0 };
  const calendars = new Map(
    tenants.map((tenant) => [tenant.pageSlug, calendarFor(tenant, now)]),
  );
  for (const appointment of appointments) {
    if (
      typeof appointment.pageSlug !== "string" ||
      !COUNTED_APPOINTMENT_STATUSES.has(String(appointment.status))
    ) continue;
    const calendar = calendars.get(appointment.pageSlug);
    const startAt = dateValue(appointment.startAt);
    if (!calendar || !startAt) continue;
    const localDate = getZonedDateTimeParts(startAt, calendar.timeZone).date;
    if (localDate === calendar.today) appointmentsMetric.today += 1;
    if (localDate >= calendar.last7Start && localDate <= calendar.today) {
      appointmentsMetric.last7Days += 1;
    }
    if (localDate >= calendar.monthStart && localDate < calendar.nextMonthStart) {
      appointmentsMetric.currentMonth += 1;
    }
  }

  return {
    tenants: tenantsMetric,
    billing: billingMetric,
    appointments: appointmentsMetric,
    growth,
    alerts: {
      pastDue: billingMetric.pastDue,
      blocked: tenantsMetric.blocked,
      trialsEndingSoon,
    },
    generatedAt: now.toISOString(),
  };
};
