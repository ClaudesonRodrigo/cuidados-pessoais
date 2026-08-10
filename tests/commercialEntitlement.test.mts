import assert from "node:assert/strict";
import test from "node:test";

import { OFFICIAL_SUPERADMIN_UID } from "../src/lib/adminIdentity.ts";
import {
  PAST_DUE_GRACE_MS,
  resolveCommercialEntitlement,
} from "../src/lib/commercialEntitlement.ts";
import type {
  BillingRecord,
  LegacyCommercialGrant,
  PromotionalTrial,
  StripeBillingStatus,
} from "../src/lib/billingTypes.ts";

const NOW = new Date("2099-01-10T12:00:00.000Z");
const OWNER_ID = "owner-a";

const billing = (
  status: StripeBillingStatus,
  overrides: Partial<BillingRecord> = {},
): BillingRecord => ({
  ownerId: OWNER_ID,
  pageSlug: "salao-a",
  status,
  createdAt: new Date("2099-01-01T00:00:00.000Z"),
  updatedAt: NOW,
  ...overrides,
});

const legacyGrant: LegacyCommercialGrant = {
  ownerId: OWNER_ID,
  active: true,
  source: "legacy_grant",
};

const promotionalTrial = (endsAt: Date): PromotionalTrial => ({
  ownerId: OWNER_ID,
  endsAt,
});

const resolve = (overrides: Partial<Parameters<typeof resolveCommercialEntitlement>[0]> = {}) =>
  resolveCommercialEntitlement({
    identity: { uid: OWNER_ID },
    now: NOW,
    ...overrides,
  });

test("superadmin recebe ADMIN_BYPASS", () => {
  const result = resolve({ identity: { uid: OFFICIAL_SUPERADMIN_UID } });
  assert.equal(result.state, "ADMIN_BYPASS");
  assert.equal(result.source, "superadmin");
});

for (const status of ["active", "trialing"] as const) {
  test(`Stripe ${status} recebe ACTIVE`, () => {
    const result = resolve({ billing: billing(status) });
    assert.equal(result.state, "ACTIVE");
    assert.equal(result.source, "stripe");
    assert.equal(result.billingStatus, status);
  });
}

test("past_due dentro de três dias recebe PAST_DUE_GRACE", () => {
  const pastDueSince = new Date(NOW.getTime() - PAST_DUE_GRACE_MS + 1);
  const result = resolve({ billing: billing("past_due", { pastDueSince }) });
  assert.equal(result.state, "PAST_DUE_GRACE");
  assert.equal(result.requiresPaymentAction, true);
  assert.equal(result.accessUntil?.getTime(), pastDueSince.getTime() + PAST_DUE_GRACE_MS);
});

test("past_due futuro fica BLOCKED", () => {
  const pastDueSince = new Date(NOW.getTime() + 1);
  assert.equal(resolve({ billing: billing("past_due", { pastDueSince }) }).state, "BLOCKED");
});

test("past_due iniciado exatamente agora recebe PAST_DUE_GRACE", () => {
  assert.equal(
    resolve({ billing: billing("past_due", { pastDueSince: NOW }) }).state,
    "PAST_DUE_GRACE",
  );
});

test("past_due com 71h59m59s recebe PAST_DUE_GRACE", () => {
  const elapsed = PAST_DUE_GRACE_MS - 1_000;
  assert.equal(
    resolve({ billing: billing("past_due", { pastDueSince: new Date(NOW.getTime() - elapsed) }) }).state,
    "PAST_DUE_GRACE",
  );
});

test("past_due ao completar três dias fica BLOCKED", () => {
  const pastDueSince = new Date(NOW.getTime() - PAST_DUE_GRACE_MS);
  assert.equal(resolve({ billing: billing("past_due", { pastDueSince }) }).state, "BLOCKED");
});

test("past_due acima de três dias fica BLOCKED", () => {
  const pastDueSince = new Date(NOW.getTime() - PAST_DUE_GRACE_MS - 1);
  assert.equal(resolve({ billing: billing("past_due", { pastDueSince }) }).state, "BLOCKED");
});

test("past_due sem marco server-side fica BLOCKED", () => {
  assert.equal(resolve({ billing: billing("past_due") }).state, "BLOCKED");
});

for (const status of [
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const) {
  test(`Stripe ${status} fica BLOCKED`, () => {
    const result = resolve({ billing: billing(status) });
    assert.equal(result.state, "BLOCKED");
    assert.equal(result.billingStatus, status);
  });
}

test("legacy grant ativo recebe ACTIVE e fonte distinguível", () => {
  const result = resolve({ legacyGrant });
  assert.equal(result.state, "ACTIVE");
  assert.equal(result.source, "legacy_grant");
  assert.equal(result.billingStatus, undefined);
});

test("trial promocional válido recebe TRIAL_ACTIVE", () => {
  const trial = promotionalTrial(new Date(NOW.getTime() + 1));
  const result = resolve({ promotionalTrial: trial });
  assert.equal(result.state, "TRIAL_ACTIVE");
  assert.equal(result.source, "promotional_trial");
});

test("trial promocional expirado fica BLOCKED", () => {
  const trial = promotionalTrial(new Date(NOW.getTime()));
  assert.equal(resolve({ promotionalTrial: trial }).state, "BLOCKED");
});

test("ausência de billing, grant e trial fica BLOCKED", () => {
  assert.deepEqual(resolve(), {
    state: "BLOCKED",
    source: "none",
    billingStatus: undefined,
    requiresPaymentAction: false,
  });
});

test("superadmin prevalece sobre billing bloqueado", () => {
  const result = resolve({
    identity: { uid: OFFICIAL_SUPERADMIN_UID },
    billing: billing("unpaid", { ownerId: OFFICIAL_SUPERADMIN_UID }),
  });
  assert.equal(result.state, "ADMIN_BYPASS");
});

test("Stripe active prevalece sobre trial promocional", () => {
  const result = resolve({
    billing: billing("active"),
    promotionalTrial: promotionalTrial(new Date(NOW.getTime() + 86_400_000)),
  });
  assert.equal(result.state, "ACTIVE");
  assert.equal(result.source, "stripe");
});

test("Stripe active prevalece sobre legacy grant", () => {
  const result = resolve({ billing: billing("active"), legacyGrant });
  assert.equal(result.source, "stripe");
});

test("legacy grant prevalece sobre trial promocional", () => {
  const result = resolve({
    legacyGrant,
    promotionalTrial: promotionalTrial(new Date(NOW.getTime() + 86_400_000)),
  });
  assert.equal(result.source, "legacy_grant");
});

test("past_due bloqueado permite legacy grant ativo pela precedência", () => {
  const result = resolve({ billing: billing("past_due"), legacyGrant });
  assert.equal(result.state, "ACTIVE");
  assert.equal(result.source, "legacy_grant");
});

test("past_due bloqueado permite trial promocional válido pela precedência", () => {
  const result = resolve({
    billing: billing("past_due"),
    promotionalTrial: promotionalTrial(new Date(NOW.getTime() + 1)),
  });
  assert.equal(result.state, "TRIAL_ACTIVE");
});

test("legacy grant inativo não libera", () => {
  assert.equal(resolve({ legacyGrant: { ...legacyGrant, active: false } }).state, "BLOCKED");
});

test("superadmin prevalece quando todas as fontes estão bloqueadas", () => {
  const result = resolve({
    identity: { uid: OFFICIAL_SUPERADMIN_UID },
    billing: billing("unpaid", { ownerId: OFFICIAL_SUPERADMIN_UID }),
    legacyGrant: { ...legacyGrant, ownerId: OFFICIAL_SUPERADMIN_UID, active: false },
    promotionalTrial: {
      ownerId: OFFICIAL_SUPERADMIN_UID,
      endsAt: new Date(NOW.getTime() - 1),
    },
  });
  assert.equal(result.state, "ADMIN_BYPASS");
});

test("Stripe active prevalece simultaneamente sobre legacy e trial", () => {
  const result = resolve({
    billing: billing("active"),
    legacyGrant,
    promotionalTrial: promotionalTrial(new Date(NOW.getTime() + 1)),
  });
  assert.equal(result.state, "ACTIVE");
  assert.equal(result.source, "stripe");
});

test("projeções de outro owner nunca concedem acesso", () => {
  const result = resolve({
    billing: billing("active", { ownerId: "owner-b" }),
    legacyGrant: { ...legacyGrant, ownerId: "owner-b" },
    promotionalTrial: { ...promotionalTrial(new Date(NOW.getTime() + 1)), ownerId: "owner-b" },
  });
  assert.equal(result.state, "BLOCKED");
});
