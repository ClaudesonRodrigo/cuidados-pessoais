import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) => readFile(path, "utf8");

test("Stripe fica centralizada e exclusivamente server-side", async () => {
  const source = await readSource("src/lib/stripeServer.ts");
  assert.equal(source.includes('import "server-only"'), true);
  assert.equal(source.includes('process.env.STRIPE_SECRET_KEY'), true);
  assert.equal(source.includes("NEXT_PUBLIC_STRIPE_SECRET_KEY"), false);
  assert.equal(source.includes('from "stripe"'), true);
});

test("BillingRecord não modela dados financeiros sensíveis", async () => {
  const source = await readSource("src/lib/billingTypes.ts");
  for (const forbidden of ["cardNumber", "cvc", "paymentMethod:", "secretKey"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} não deve integrar o modelo`);
  }
  for (const required of [
    "ownerId",
    "pageSlug",
    "stripeCustomerId",
    "stripeSubscriptionId",
    "createdAt",
    "updatedAt",
  ]) {
    assert.equal(source.includes(required), true, `${required} deve integrar o modelo`);
  }
});

test("billingService indexa por ownerId e usa somente Firebase Admin", async () => {
  const source = await readSource("src/lib/billingService.ts");
  assert.equal(source.includes('import "server-only"'), true);
  assert.equal(source.includes('BILLING_COLLECTION = "billing"'), true);
  assert.equal(source.includes(".doc(ownerId)"), true);
  assert.equal(source.includes("getAdminFirestore"), true);
  assert.equal(source.includes("firebase-admin/firestore"), true);
  assert.equal(source.includes("firebase/firestore"), false);
});

test("fundação não implementa Checkout, Portal ou webhook", async () => {
  const sources = await Promise.all([
    readSource("src/lib/stripeServer.ts"),
    readSource("src/lib/billingService.ts"),
    readSource("src/lib/commercialEntitlement.ts"),
  ]);
  const combined = sources.join("\n");
  for (const forbidden of ["checkout.sessions", "billingPortal.sessions", "webhooks.constructEvent"]) {
    assert.equal(combined.includes(forbidden), false);
  }
});
