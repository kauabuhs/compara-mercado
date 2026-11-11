# Estrutura do projeto

Gerada em 2026-11-11. Ignora `node_modules`, `.next`, `dist`, `.turbo`, `.git`, relatórios de teste e arquivos `.env` locais (não versionados).

77 pastas · 196 arquivos

```text
compara-mercado/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.yml
│   │   └── feature.yml
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── deploy.yml
│   │   └── security.yml
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   └── pull_request_template.md
├── .husky/
│   ├── commit-msg
│   └── pre-commit
├── .vscode/
│   ├── extensions.json
│   └── settings.json
├── backend/
│   ├── apps/
│   │   ├── api/
│   │   │   ├── src/
│   │   │   │   ├── http/
│   │   │   │   │   ├── auth.ts
│   │   │   │   │   ├── context.ts
│   │   │   │   │   ├── errors.ts
│   │   │   │   │   ├── rate-limit.ts
│   │   │   │   │   ├── response-cache.test.ts
│   │   │   │   │   └── response-cache.ts
│   │   │   │   ├── routes/
│   │   │   │   │   ├── account.ts
│   │   │   │   │   └── catalog.ts
│   │   │   │   ├── services/
│   │   │   │   │   ├── freshness.ts
│   │   │   │   │   ├── supabase-services.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── app.test.ts
│   │   │   │   ├── app.ts
│   │   │   │   ├── env.ts
│   │   │   │   ├── integration.test.ts
│   │   │   │   ├── logger.ts
│   │   │   │   ├── main.ts
│   │   │   │   └── unit.test.ts
│   │   │   ├── Dockerfile
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   └── worker/
│   │       ├── src/
│   │       │   ├── pipeline/
│   │       │   │   ├── ports.ts
│   │       │   │   ├── run.test.ts
│   │       │   │   ├── run.ts
│   │       │   │   └── supabase-repo.ts
│   │       │   ├── env.ts
│   │       │   ├── jobs.ts
│   │       │   ├── logger.ts
│   │       │   └── main.ts
│   │       ├── Dockerfile
│   │       ├── package.json
│   │       └── tsconfig.json
│   ├── packages/
│   │   ├── ai/
│   │   │   ├── src/
│   │   │   │   ├── ai.test.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   ├── cost.ts
│   │   │   │   ├── fake.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── parse.ts
│   │   │   │   ├── prompts.ts
│   │   │   │   ├── provider.ts
│   │   │   │   └── schemas.ts
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   ├── db/
│   │   │   ├── src/
│   │   │   │   ├── client.ts
│   │   │   │   ├── database.types.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── integration.test.ts
│   │   │   │   ├── queries.ts
│   │   │   │   └── schemas.ts
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   ├── domain/
│   │   │   ├── src/
│   │   │   │   ├── compare.ts
│   │   │   │   ├── domain.test.ts
│   │   │   │   ├── errors.ts
│   │   │   │   ├── freshness.ts
│   │   │   │   ├── gtin.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── money.ts
│   │   │   │   ├── normalize.ts
│   │   │   │   └── units.ts
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   └── ingest/
│   │       ├── src/
│   │       │   ├── golden.ts
│   │       │   ├── index.ts
│   │       │   ├── ingest.test.ts
│   │       │   ├── match.ts
│   │       │   ├── publish.ts
│   │       │   ├── trigram.ts
│   │       │   └── validate.ts
│   │       ├── package.json
│   │       └── tsconfig.json
│   ├── supabase/
│   │   ├── migrations/
│   │   │   ├── 20261109000001_extensions_and_enums.sql
│   │   │   ├── 20261109000002_core_tables.sql
│   │   │   ├── 20261109000003_functions_and_triggers.sql
│   │   │   ├── 20261109000004_rls_and_privileges.sql
│   │   │   └── 20261109000005_read_models_and_functions.sql
│   │   ├── snippets/
│   │   ├── tests/
│   │   │   └── database/
│   │   │       ├── 01_rls.test.sql
│   │   │       └── 02_compare_list.test.sql
│   │   ├── .gitignore
│   │   ├── config.toml
│   │   └── seed.sql
│   └── package.json
├── docs/
│   ├── adr/
│   │   ├── 0001-stack.md
│   │   ├── 0002-supply-chain.md
│   │   ├── 0003-seguranca-web.md
│   │   ├── 0004-fronteiras-e-contratos.md
│   │   └── 0005-separacao-frontend-backend.md
│   ├── runbooks/
│   │   ├── desenvolvimento-local.md
│   │   ├── migracoes.md
│   │   └── worker-fila-parada.md
│   ├── api.md
│   ├── architecture.md
│   └── roadmap.md
├── frontend/
│   ├── e2e/
│   │   ├── admin.spec.ts
│   │   └── fluxo-principal.spec.ts
│   ├── packages/
│   │   └── ui/
│   │       ├── src/
│   │       │   ├── button.tsx
│   │       │   ├── cn.ts
│   │       │   ├── format.test.ts
│   │       │   ├── format.ts
│   │       │   ├── index.ts
│   │       │   ├── price.tsx
│   │       │   ├── primitives.tsx
│   │       │   └── styles.css
│   │       ├── package.json
│   │       └── tsconfig.json
│   ├── public/
│   │   └── sw.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── admin/
│   │   │   │   ├── precos/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── revisao/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── auth/
│   │   │   │   └── callback/
│   │   │   │       └── route.ts
│   │   │   ├── busca/
│   │   │   │   └── page.tsx
│   │   │   ├── conta/
│   │   │   │   └── page.tsx
│   │   │   ├── contribuir/
│   │   │   │   └── page.tsx
│   │   │   ├── lista/
│   │   │   │   └── page.tsx
│   │   │   ├── mercados/
│   │   │   │   └── page.tsx
│   │   │   ├── ofertas/
│   │   │   │   └── page.tsx
│   │   │   ├── produto/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── error.tsx
│   │   │   ├── globals.css
│   │   │   ├── icon.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── manifest.ts
│   │   │   ├── not-found.tsx
│   │   │   └── page.tsx
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   │   ├── components/
│   │   │   │   │   └── price-form.tsx
│   │   │   │   └── actions.ts
│   │   │   ├── auth/
│   │   │   │   ├── components/
│   │   │   │   │   └── login-form.tsx
│   │   │   │   └── actions.ts
│   │   │   ├── catalog/
│   │   │   │   └── components/
│   │   │   │       ├── price-history.tsx
│   │   │   │       └── search-box.tsx
│   │   │   ├── offers/
│   │   │   │   └── components/
│   │   │   │       └── offer-card.tsx
│   │   │   ├── shopping-list/
│   │   │   │   ├── components/
│   │   │   │   │   ├── add-to-list.tsx
│   │   │   │   │   └── list-view.tsx
│   │   │   │   ├── actions.ts
│   │   │   │   └── list-store.ts
│   │   │   └── stores/
│   │   │       └── components/
│   │   │           ├── store-map.tsx
│   │   │           └── stores-view.tsx
│   │   └── shared/
│   │       ├── api/
│   │       │   ├── client.ts
│   │       │   └── endpoints.ts
│   │       ├── components/
│   │       │   ├── nav.tsx
│   │       │   ├── sw-register.tsx
│   │       │   └── theme-toggle.tsx
│   │       ├── lib/
│   │       │   ├── format.test.ts
│   │       │   ├── format.ts
│   │       │   ├── rate-limit.test.ts
│   │       │   └── rate-limit.ts
│   │       └── server/
│   │           ├── supabase/
│   │           │   └── auth-client.ts
│   │           ├── env.ts
│   │           ├── request.ts
│   │           └── session.ts
│   ├── next.config.ts
│   ├── package.json
│   ├── playwright.config.ts
│   ├── postcss.config.mjs
│   ├── tsconfig.json
│   └── vitest.config.ts
├── scripts/
│   ├── check-architecture.mjs
│   └── gen-db-types.mjs
├── shared/
│   ├── config/
│   │   ├── package.json
│   │   ├── tsconfig.base.json
│   │   ├── tsconfig.lib.json
│   │   ├── tsconfig.next.json
│   │   └── tsconfig.node.json
│   └── contracts/
│       ├── src/
│       │   ├── contracts.test.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── .dockerignore
├── .editorconfig
├── .env.example
├── .gitattributes
├── .gitignore
├── .nvmrc
├── biome.json
├── commitlint.config.mjs
├── CONTRIBUTING.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── README.md
├── SECURITY.md
└── turbo.json
```
