import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveBookingServices } from "../src/lib/bookingService.ts";
import { updateServiceAtIndex } from "../src/lib/serviceLinks.ts";

const originalLinks = [
  {
    id: "service-stable-id",
    title: "Corte",
    type: "service",
    order: 1,
    clicks: 7,
    price: "50,00",
    durationMinutes: 60,
    description: "Descrição original",
    imageUrl: "https://example.com/original.jpg",
    category: "Cabelo",
    active: true,
    futureField: "preservado",
  },
  { title: "Barba", type: "service", order: 2, price: "30,00", durationMinutes: 30 },
];

test("edição atualiza nome, preço e duração no item existente", () => {
  const updated = updateServiceAtIndex(originalLinks, 0, {
    title: "Corte Premium",
    price: "75,00",
    durationMinutes: 90,
    description: "Nova descrição",
    imageUrl: "https://example.com/nova.jpg",
    category: "Premium",
  });

  assert.equal(updated.length, originalLinks.length);
  assert.equal(updated[0].title, "Corte Premium");
  assert.equal(updated[0].price, "75,00");
  assert.equal(updated[0].durationMinutes, 90);
  assert.equal(updated[1], originalLinks[1]);
});

test("edição preserva identidade, ordem, status e campos desconhecidos", () => {
  const updated = updateServiceAtIndex(originalLinks, 0, {
    title: "Corte Atualizado",
    price: "55,00",
    durationMinutes: 45,
    description: "Atualizada",
    imageUrl: "https://example.com/atualizada.jpg",
    category: "Cabelo",
  });

  assert.equal(updated[0].id, originalLinks[0].id);
  assert.equal(updated[0].order, originalLinks[0].order);
  assert.equal(updated[0].clicks, originalLinks[0].clicks);
  assert.equal(updated[0].active, originalLinks[0].active);
  assert.equal(updated[0].futureField, originalLinks[0].futureField);
  assert.equal(originalLinks[0].title, "Corte");
});

test("edição não duplica serviço e rejeita seleção inválida", () => {
  const updated = updateServiceAtIndex(originalLinks, 1, {
    title: "Barba Premium",
    price: "40,00",
    durationMinutes: 45,
  });
  assert.equal(updated.length, 2);
  assert.equal(updated.filter((link) => link.title === "Barba Premium").length, 1);
  assert.throws(() => updateServiceAtIndex(originalLinks, 2, {
    title: "Inválido",
    price: "1,00",
    durationMinutes: 30,
  }));
});

test("booking deriva nome, preço e duração do serviço atualizado", () => {
  const links = updateServiceAtIndex(originalLinks, 0, {
    title: "Corte Premium",
    price: "75,00",
    durationMinutes: 90,
  });
  assert.deepEqual(resolveBookingServices({ links }, ["Corte Premium"]), {
    serviceName: "Corte Premium",
    totalDuration: 90,
    totalValue: 75,
  });
});

test("cliente final não consulta nem renderiza fidelidade", async () => {
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");
  for (const forbidden of ["getCustomerLoyalty", "LoyaltyData", "LoyaltyCard", "loyaltyData"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} não deve permanecer na página do cliente`);
  }
});

test("backend e Rules de loyalty permanecem preservados", async () => {
  const [service, rules] = await Promise.all([
    readFile("src/lib/pageService.ts", "utf8"),
    readFile("firestore.rules", "utf8"),
  ]);
  assert.equal(service.includes("getCustomerLoyalty"), true);
  assert.equal(service.includes("addLoyaltyPoint"), true);
  assert.equal(rules.includes("match /loyalty/{loyaltyId}"), true);
});

test("card público preserva o fluxo comercial e expande serviços selecionados", async () => {
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");

  for (const expected of [
    "const serviceDescription = item.description?.trim()",
    "isInCart ? 'flex-col gap-4",
    "isInCart ? 'w-full h-44 sm:h-52",
    ": 'w-20 h-20 rounded-2xl",
    "isInCart && serviceDescription",
    "{item.price &&",
    "{item.durationMinutes || 30} MIN",
    ">Valor Total</p>",
    "onClick={handleProceedToDate}",
  ]) {
    assert.equal(source.includes(expected), true, expected);
  }
  assert.equal(source.includes("setCart(cart.filter(i => i.title !== item.title))"), true);
  assert.equal(source.includes("setCart([...cart, item])"), true);
});
