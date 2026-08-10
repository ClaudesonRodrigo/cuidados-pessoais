# BeautyPro — Checkpoint Firebase Admin / Vercel

Data: 2026-08-10

## 1. Problema observado

Em ambiente local, o sistema funcionava normalmente.

Na Vercel Preview e Production, o login Google chegava ao frontend, mas a requisição `POST /api/onboarding` retornava HTTP 500.

O erro observado no Runtime Log da Vercel era `ERR_REQUIRE_ESM`, na seguinte cadeia:

```text
firebase-admin/auth
→ jwks-rsa
→ jose
```

O `jwks-rsa` carregava `jose` via `require()`, enquanto a versão instalada de `jose` era ESM. O erro era semelhante a:

```text
require() of ES Module .../jose/dist/webapi/index.js
from .../jwks-rsa/src/utils.js not supported
```

Foi confirmado explicitamente que:

- não era erro de índice do Firestore;
- não era ausência das variáveis `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`;
- não era falha da lógica de roles;
- não era falha do fluxo do superadmin.

## 2. Diagnóstico

O estado anterior relevante utilizava `firebase-admin` na versão `14.2.0`, com a seguinte árvore problemática observada:

```text
firebase-admin 14.2.0
→ jwks-rsa 4.x
→ jose 6.x
```

O ambiente local utilizava Node `24.14.0` e funcionava. Na Vercel, a Function `/api/onboarding` falhava ao carregar `firebase-admin/auth`.

Uma primeira tentativa apenas declarando runtime Node compatível não eliminou o problema no Preview.

## 3. Solução final adotada

A solução final adotada foi:

- Firebase Admin fixado em `13.10.0`;
- runtime Node declarado como `24.x`;
- `package-lock.json` atualizado pela instalação da dependência;
- `tsconfig.json` ajustado para remover `baseUrl` e `ignoreDeprecations: "6.0"`;
- alias `@/*` preservado usando `paths`;
- `.vercel` e `.env*` adicionados ao `.gitignore`.

Não foram adotados:

- override manual de `jose`;
- edição de `node_modules`;
- alteração de Firestore Rules;
- alteração da lógica de onboarding;
- alteração do modelo de autorização;
- alteração da regra do superadmin.

## 4. Validações

As evidências confirmadas foram:

- `npm run build`: passou;
- TypeScript: passou após ajuste do `tsconfig.json`;
- `npm run test:onboarding`: 65/65 aprovados;
- `git diff --check`: passou;
- Vercel Preview: login Google e onboarding funcionando;
- o erro `ERR_REQUIRE_ESM` não ocorreu no Preview após a correção;
- branch corretiva: `fix/vercel-firebase-admin-runtime`;
- commit principal da estabilização: `08a60de` — `fix(vercel): stabilize Firebase Admin runtime`;
- merge na `main`: `4886416dc4c31059b7274f5592ce3b904df7aff0` — `merge: corrigir runtime do Firebase Admin na Vercel`;
- `origin/main...HEAD` após push: `0 0`.

## 5. Decisão arquitetural

Firebase Admin permanece exclusivamente server-side.

O fluxo permanece:

```text
Firebase Authentication
→ ID Token
→ /api/onboarding
→ Firebase Admin
→ Firestore
```

Superadmin continua sendo uma identidade administrativa da plataforma.

Superadmin não possui loja própria implicitamente.

Owner continua sendo a identidade responsável pelo tenant/estabelecimento.

Cliente continua sendo consumidor do fluxo público.

Nenhuma dessas regras foi alterada pela correção de runtime.

## 6. Regra para futuras atualizações

> **Alerta:** antes de atualizar `firebase-admin` acima de `13.10.0`, validar obrigatoriamente:

- compatibilidade com Next.js/Vercel;
- árvore `firebase-admin → jwks-rsa → jose`;
- build;
- testes de onboarding;
- Preview real da Vercel;
- Runtime Logs de `/api/onboarding`.

Não atualizar `firebase-admin` diretamente em produção sem Preview validado.

## 7. Estado final do ciclo

**STATUS:** CONCLUÍDO

**RESULTADO:** ONBOARDING FUNCIONAL NA VERCEL PREVIEW E CORREÇÃO INTEGRADA À MAIN.

**RISCO RESIDUAL:** Atualizações futuras do Firebase Admin podem reintroduzir incompatibilidade CommonJS/ESM e devem seguir a regra de validação acima.
