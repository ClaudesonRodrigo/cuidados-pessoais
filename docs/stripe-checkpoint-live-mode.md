# BeautyPro — Stripe Checkpoint
## Estado pós-Test Mode / pré-Live Mode

Data: 20/08/2026

## Base publicada atual

`acb8dda1d1910ea779a4931c4648152f4edca128`

## Status

- Stripe Test Mode: **VALIDADO**
- Stripe 1–4E: **CONCLUÍDO**
- Stripe 5 — Live Mode: **ADIADO INTENCIONALMENTE**

Motivo: aguardar:

- domínio oficial;
- configuração final de produção;
- cartão real para cobrança controlada.

## Base comercial

### BeautyPro Start

R$ 29,90/mês.

### Trial

7 dias grátis sem cartão no onboarding.

Durante o onboarding, não criar Stripe Customer ou Subscription apenas pelo início do trial.

Quando o Owner inicia a assinatura, o Checkout Stripe é criado server-side.

### Inadimplência

`past_due` → grace de 72 horas.

Durante a grace:

- dashboard permanece acessível;
- mutations comerciais Owner permitidas;
- novos bookings permitidos;
- aviso de regularização;
- Customer Portal disponível.

Após 72 horas: → `BLOCKED`.

Em `BLOCKED`:

- página pública continua visível;
- dados não são apagados;
- histórico preservado;
- configuração preservada;
- novos agendamentos bloqueados;
- mutations comerciais protegidas negadas;
- Customer Portal continua disponível para recuperação.

## Entitlement canônico

Precedência:

1. `superadmin` → `ADMIN_BYPASS`
2. Stripe `active`/`trialing` → `ACTIVE`
3. Stripe `past_due` dentro da grace → `PAST_DUE_GRACE`
4. legacy grant válido → `ACTIVE`
5. promotional trial válido → `TRIAL_ACTIVE`
6. demais casos → `BLOCKED`

Estados de booking público permitidos **exclusivamente**:

- `ACTIVE`
- `TRIAL_ACTIVE`
- `PAST_DUE_GRACE`

Qualquer outro estado: `DENY` / fail-closed.

`ADMIN_BYPASS` não permite booking público.

## Arquitetura

Fluxo principal:

```text
Owner
→ Checkout
→ Stripe
→ Webhook
→ billing/{ownerId}
→ Commercial Entitlement
→ Billing Status
→ Dashboard / APIs administrativas / Booking
```

Customer Portal:

```text
Owner autenticado
→ /api/billing/portal
→ Stripe Customer validado
→ Portal
```

Booking:

```text
cliente autenticado
→ /api/book
→ pageSlug
→ page.userId
→ user/billing
→ Commercial Entitlement
→ locks
→ appointment
```

Nenhuma autoridade comercial deve vir do browser.

## Stripe authority

Stripe é a autoridade financeira para Subscription ativa.

`billing/{ownerId}` é a projeção server-side do estado Stripe.

O browser **não** envia:

- `ownerId`
- `plan`
- `trialDeadline`
- `billingStatus`
- `entitlement`
- Stripe Customer ID
- Stripe Subscription ID
- Stripe Price ID

Esses valores são resolvidos server-side.

## Webhook

Eventos atualmente suportados:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Para a projeção financeira, sempre recuperar a Subscription canônica atual na Stripe antes de projetar `billing` quando aplicável.

Invoice sem subscription é ignorado.

Idempotência e ordenação:

- evento repetido → `DUPLICATE`
- evento antigo → `STALE`

`pastDueSince`:

- entrada inicial em `past_due` → criar;
- continua `past_due` → preservar original;
- sai de `past_due` → remover.

## Commercial access

`requireCommercialAccess()` permite:

- `ACTIVE`
- `TRIAL_ACTIVE`
- `PAST_DUE_GRACE`
- `ADMIN_BYPASS`

`requireCommercialAccess()` nega:

- `BLOCKED`

`ADMIN_BYPASS` é administrativo e não deve virar bypass de booking público.

Master cross-tenant:

`requireSuperadminTenantContext(targetOwnerId)`

`targetOwnerId` é somente um identificador. O tenant real é derivado server-side.

## Domínios migrados para server-side

Concluídos:

- Owner Services
- Owner Profile
- Owner Appointments
- Owner Transactions
- Master Profile
- Master Services
- Master Appointments
- Master Transactions
- Master Plan Authority

As mutations administrativas desses domínios são server-side via Firebase Admin.

Web SDK não é autoridade para essas mutations.

## Master Plan

Endpoint:

`PATCH /api/master/users/plan`

Authority:

`requireSuperadminTenantContext(targetOwnerId)`

Body:

- `targetOwnerId`
- `plan = free | pro`

Transaction atômica:

```text
users/{targetOwnerId}
+
pages/{pageSlug}
```

`plan` e `trialDeadline` são atualizados juntos.

Legacy plan é override administrativo e não representa Stripe Subscription.

## Booking commercial block

Endpoint:

`POST /api/book`

Ordem relevante:

```text
page
→ binding
→ retry idempotente
→ entitlement
→ serviço/agenda
→ conflitos/locks
→ writes
```

O retry idempotente ocorre antes do bloqueio comercial.

Whitelist:

- `ACTIVE`
- `TRIAL_ACTIVE`
- `PAST_DUE_GRACE`

Qualquer outro estado: `403 COMMERCIAL_BOOKING_BLOCKED`.

A mensagem pública não expõe Stripe, billing ou `past_due`.

Em `BLOCKED`:

- zero appointment novo;
- zero bookingLock novo;
- zero partial write.

## Testes e evidências

### Marcos finais

- Stripe 4C-E: 879 testes na verificação final.
- Stripe 4D:
  - Booking: 55/55
  - runner amplo: 757/757
  - TypeScript: PASS
  - Build: PASS

### Stripe 4E

Teste dedicado:

`tests/commercialRecovery.e2e.test.mts`

Cadeia comprovada:

```text
ACTIVE
→ PAST_DUE_GRACE
→ BLOCKED
→ ACTIVE
```

Resultados automatizados:

- 2/2 cenários 4E
- 264/264 regressões direcionadas
- 55/55 booking
- 759/759 runner amplo
- Availability: PASS
- TypeScript: PASS
- Build: PASS

Fail-closed:

```text
pastDueSince ausente
pastDueSince inválido
pastDueSince futuro
→ BLOCKED
```

Recovery:

```text
active
→ pastDueSince removido
→ booking restabelecido
```

## E2E manual

Validação manual realizada:

- ambiente zerado;
- tenant novo criado do zero;
- onboarding PASS;
- trial de 7 dias criado;
- Checkout real Test Mode PASS;
- Stripe Customer criado;
- Stripe Subscription criada;
- `billing` projetado;
- status `trialing`;
- `trialing` tratado como `ACTIVE`;
- Dashboard PASS;
- página pública visível;
- Booking PASS.

Forma de pagamento de teste de falha configurada para futura renovação.

Validação natural de renovação pendente apenas como confirmação operacional posterior.

Data prevista do fim do trial testado: 27/08/2026.

Essa confirmação posterior **não** bloqueia o fechamento técnico do 4E.

## Commits principais

| Commit | Escopo |
|---|---|
| `2c9ebcf` | commercial access foundation |
| `68aad9f` | services owner |
| `b1e3dd1` | profile owner |
| `9647df8` | lunch interval UI |
| `d933f8f` | owner appointments |
| `7a754d7` | master appointments |
| `91c39be` | appointment Rules close |
| `c305d6c` | loyalty award disabled |
| `846d314` | transactions authority |
| `fa32ec3` | master profile |
| `b61ecd4` | master services |
| `1cb072a` | master plan authority |
| `51b6f67` | commercial booking access |
| `acb8dda` | commercial recovery e2e coverage |

## Decisões importantes

`firebase-admin` permanece **EXATAMENTE** na versão `13.10.0`.

Não atualizar sem validação específica de:

- Next.js
- Vercel
- jwks-rsa
- jose
- onboarding
- Preview real

Stripe permanece em **TEST MODE** até Stripe 5.

Loyalty está temporariamente desabilitado no fluxo operacional. Os dados existentes estão preservados. A reimplementação futura fica fora desta fase.

## Stripe 5 — Live Mode

### Pré-requisitos

- [ ] domínio oficial disponível
- [ ] domínio configurado na Vercel
- [ ] `APP_URL` de produção confirmado
- [ ] conta Stripe habilitada para Live
- [ ] dados bancários/identidade aprovados
- [ ] cartão real disponível para teste controlado

### Ativação

- [ ] criar Product/Price Live BeautyPro Start R$ 29,90/mês
- [ ] configurar `STRIPE_SECRET_KEY` Live
- [ ] configurar `STRIPE_PRICE_ID` Live
- [ ] criar webhook Live
- [ ] configurar `STRIPE_WEBHOOK_SECRET` Live
- [ ] confirmar endpoint webhook de produção
- [ ] conferir Customer Portal Live
- [ ] validar redirects Checkout/Portal
- [ ] realizar primeira assinatura real controlada
- [ ] confirmar cobrança real
- [ ] confirmar `billing/{ownerId}`
- [ ] confirmar entitlement `ACTIVE`
- [ ] confirmar Dashboard
- [ ] confirmar booking
- [ ] confirmar Portal
- [ ] validar logs Vercel/Stripe
- [ ] somente depois liberar clientes reais

Não registrar chaves ou secrets neste documento.

## Estado final

**STATUS TÉCNICO STRIPE:**
CONCLUÍDO ATÉ 4E

**TEST MODE:**
VALIDADO

**LIVE MODE:**
PENDENTE / ADIADO INTENCIONALMENTE

**PRÓXIMO GATILHO:**
DOMÍNIO OFICIAL + CARTÃO REAL
