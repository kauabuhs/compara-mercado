# Estrutura do projeto

Gerada em 2026-11-12. Lista os arquivos versionáveis (rastreados ou não ignorados pelo `.gitignore`): sem `node_modules`, `.next`, `dist`, `.turbo`, `.git`, relatórios de teste e arquivos `.env` locais.

100 pastas · 238 arquivos

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
│   ├── settings.json
│   └── tasks.json
├── ComparaMercado-Back/
│   ├── scripts/
│   │   └── gen-db-schema.mjs
│   ├── src/
│   │   ├── __tests__/
│   │   │   ├── app.test.ts
│   │   │   ├── commerce.integration.test.ts
│   │   │   ├── integration.test.ts
│   │   │   └── unit.test.ts
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   └── worker-env.ts
│   │   ├── contracts/
│   │   │   ├── __tests__/
│   │   │   │   └── contracts.test.ts
│   │   │   └── index.ts
│   │   ├── database/
│   │   │   ├── __tests__/
│   │   │   │   ├── schema.integration.test.ts
│   │   │   │   └── supabase-timeout.test.ts
│   │   │   ├── client.ts
│   │   │   ├── database.types.ts
│   │   │   ├── errors.ts
│   │   │   ├── schema.ts
│   │   │   └── supabase.ts
│   │   ├── jobs/
│   │   │   ├── index.ts
│   │   │   └── job-runs.ts
│   │   ├── lib/
│   │   │   ├── __tests__/
│   │   │   │   └── domain.test.ts
│   │   │   ├── domain-error.ts
│   │   │   ├── freshness.ts
│   │   │   ├── gtin.ts
│   │   │   ├── logger.ts
│   │   │   ├── money.ts
│   │   │   ├── normalize.ts
│   │   │   └── units.ts
│   │   ├── middlewares/
│   │   │   ├── __tests__/
│   │   │   │   └── response-cache.test.ts
│   │   │   ├── auth.ts
│   │   │   ├── context.ts
│   │   │   ├── errors.ts
│   │   │   ├── rate-limit.ts
│   │   │   └── response-cache.ts
│   │   ├── modules/
│   │   │   ├── admin/
│   │   │   │   ├── controller/
│   │   │   │   │   └── admin.controller.ts
│   │   │   │   ├── service/
│   │   │   │   │   └── admin.service.ts
│   │   │   │   └── admin.types.ts
│   │   │   ├── ai/
│   │   │   │   ├── __tests__/
│   │   │   │   │   └── ai.test.ts
│   │   │   │   └── service/
│   │   │   │       ├── anthropic.ts
│   │   │   │       ├── cost.ts
│   │   │   │       ├── fake.ts
│   │   │   │       ├── parse.ts
│   │   │   │       ├── prompts.ts
│   │   │   │       ├── provider.ts
│   │   │   │       └── schemas.ts
│   │   │   ├── auth/
│   │   │   │   ├── __tests__/
│   │   │   │   │   └── cached-authenticator.test.ts
│   │   │   │   ├── controller/
│   │   │   │   │   └── auth.controller.ts
│   │   │   │   ├── service/
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   └── cached-authenticator.ts
│   │   │   │   └── auth.types.ts
│   │   │   ├── catalog/
│   │   │   │   ├── __tests__/
│   │   │   │   │   └── catalog.integration.test.ts
│   │   │   │   ├── controller/
│   │   │   │   │   └── catalog.controller.ts
│   │   │   │   ├── repository/
│   │   │   │   │   ├── catalog-import.repository.ts
│   │   │   │   │   ├── catalog.repository.ts
│   │   │   │   │   └── catalog.schemas.ts
│   │   │   │   ├── service/
│   │   │   │   │   ├── catalog.freshness.ts
│   │   │   │   │   ├── catalog.service.ts
│   │   │   │   │   └── compare.ts
│   │   │   │   └── catalog.types.ts
│   │   │   ├── ingest/
│   │   │   │   ├── __tests__/
│   │   │   │   │   ├── ingest.test.ts
│   │   │   │   │   ├── pipeline.integration.test.ts
│   │   │   │   │   └── pipeline.test.ts
│   │   │   │   ├── repository/
│   │   │   │   │   └── pipeline.repository.ts
│   │   │   │   ├── service/
│   │   │   │   │   ├── golden.ts
│   │   │   │   │   ├── match.ts
│   │   │   │   │   ├── pipeline.service.ts
│   │   │   │   │   ├── publish.ts
│   │   │   │   │   ├── trigram.ts
│   │   │   │   │   └── validate.ts
│   │   │   │   └── pipeline.types.ts
│   │   │   ├── pricing/
│   │   │   │   └── repository/
│   │   │   │       └── pricing.repository.ts
│   │   │   ├── promotions/
│   │   │   │   └── repository/
│   │   │   │       └── promotion.repository.ts
│   │   │   └── stock/
│   │   │       └── repository/
│   │   │           └── stock.repository.ts
│   │   ├── app.ts
│   │   ├── index.ts
│   │   ├── services.ts
│   │   └── worker.ts
│   ├── supabase/
│   │   ├── migrations/
│   │   │   ├── 20261109000001_extensions_and_enums.sql
│   │   │   ├── 20261109000002_core_tables.sql
│   │   │   ├── 20261109000003_functions_and_triggers.sql
│   │   │   ├── 20261109000004_rls_and_privileges.sql
│   │   │   ├── 20261109000005_read_models_and_functions.sql
│   │   │   ├── 20261111000006_search_word_similarity.sql
│   │   │   ├── 20261111000007_review_resolution_and_audit.sql
│   │   │   ├── 20261111000008_record_status_draft.sql
│   │   │   ├── 20261111000009_markets_currencies_regions.sql
│   │   │   ├── 20261111000010_catalog_model.sql
│   │   │   ├── 20261111000011_pricing.sql
│   │   │   ├── 20261111000012_promotions.sql
│   │   │   ├── 20261111000013_inventory_suppliers.sql
│   │   │   ├── 20261111000014_media.sql
│   │   │   ├── 20261111000015_price_resolution_and_jobs.sql
│   │   │   ├── 20261111000016_catalog_listing_index.sql
│   │   │   ├── 20261111000017_drop_speculative_indexes.sql
│   │   │   └── 20261111000018_comparator_active_cities.sql
│   │   ├── seeds/
│   │   │   └── commerce.sql
│   │   ├── tests/
│   │   │   └── database/
│   │   │       ├── 01_rls.test.sql
│   │   │       ├── 02_compare_list.test.sql
│   │   │       ├── 03_search.test.sql
│   │   │       ├── 04_review_resolution.test.sql
│   │   │       ├── 05_catalog_markets.test.sql
│   │   │       ├── 06_pricing_promotions.test.sql
│   │   │       ├── 07_inventory_media_jobs.test.sql
│   │   │       └── 08_comparator_scope.test.sql
│   │   ├── .gitignore
│   │   ├── config.toml
│   │   └── seed.sql
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   ├── package.json
│   └── tsconfig.json
├── ComparaMercado-Front/
│   ├── e2e/
│   │   ├── admin.spec.ts
│   │   ├── fluxo-principal.spec.ts
│   │   ├── listagens.spec.ts
│   │   └── recursos-do-navegador.spec.ts
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
│   │   │   ├── icon.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── manifest.ts
│   │   │   ├── not-found.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   └── nav.tsx
│   │   │   ├── shared/
│   │   │   │   ├── confirm-submit.tsx
│   │   │   │   ├── price.tsx
│   │   │   │   └── sw-register.tsx
│   │   │   └── ui/
│   │   │       ├── button.tsx
│   │   │       ├── controls.tsx
│   │   │       ├── dialog.tsx
│   │   │       └── primitives.tsx
│   │   ├── lib/
│   │   │   ├── __tests__/
│   │   │   │   ├── client-ip.test.ts
│   │   │   │   ├── format.test.ts
│   │   │   │   ├── rate-limit.test.ts
│   │   │   │   └── search.test.ts
│   │   │   ├── client-ip.ts
│   │   │   ├── format.ts
│   │   │   ├── rate-limit.ts
│   │   │   ├── search.ts
│   │   │   └── utils.ts
│   │   ├── modules/
│   │   │   ├── account/
│   │   │   │   └── components/
│   │   │   │       ├── install-app-row.tsx
│   │   │   │       ├── saved-list-rows.tsx
│   │   │   │       └── theme-selector.tsx
│   │   │   ├── admin/
│   │   │   │   ├── components/
│   │   │   │   │   ├── admin-nav.tsx
│   │   │   │   │   └── price-form.tsx
│   │   │   │   └── actions.ts
│   │   │   ├── auth/
│   │   │   │   ├── components/
│   │   │   │   │   └── login-form.tsx
│   │   │   │   └── actions.ts
│   │   │   ├── catalog/
│   │   │   │   ├── components/
│   │   │   │   │   ├── price-history.tsx
│   │   │   │   │   ├── search-box.tsx
│   │   │   │   │   └── search-results.tsx
│   │   │   │   └── actions.ts
│   │   │   ├── offers/
│   │   │   │   └── components/
│   │   │   │       ├── offer-card.tsx
│   │   │   │       └── offers-explorer.tsx
│   │   │   ├── shopping-list/
│   │   │   │   ├── components/
│   │   │   │   │   ├── add-to-list.tsx
│   │   │   │   │   └── list-view.tsx
│   │   │   │   └── actions.ts
│   │   │   └── stores/
│   │   │       └── components/
│   │   │           ├── store-map.tsx
│   │   │           └── stores-view.tsx
│   │   ├── server/
│   │   │   ├── supabase/
│   │   │   │   └── auth-client.ts
│   │   │   ├── env.ts
│   │   │   ├── request.ts
│   │   │   └── session.ts
│   │   ├── services/
│   │   │   └── api/
│   │   │       ├── client.ts
│   │   │       └── endpoints.ts
│   │   ├── stores/
│   │   │   └── shopping-list.store.ts
│   │   └── styles/
│   │       ├── globals.css
│   │       └── tokens.css
│   ├── AGENTS.md
│   ├── next.config.ts
│   ├── package.json
│   ├── playwright.config.ts
│   ├── postcss.config.mjs
│   ├── tsconfig.json
│   └── vitest.config.ts
├── docs/
│   ├── adr/
│   │   ├── 0001-stack.md
│   │   ├── 0002-supply-chain.md
│   │   ├── 0003-seguranca-web.md
│   │   ├── 0004-fronteiras-e-contratos.md
│   │   ├── 0005-separacao-frontend-backend.md
│   │   ├── 0006-persistencia-e-orm.md
│   │   └── 0007-layout-front-back-por-aplicacao.md
│   ├── database/
│   │   ├── estoque.md
│   │   ├── importacao-de-catalogo.md
│   │   ├── midias.md
│   │   ├── modelo-de-dados.md
│   │   ├── precos-e-moedas.md
│   │   ├── promocoes.md
│   │   └── README.md
│   ├── runbooks/
│   │   ├── desenvolvimento-local.md
│   │   ├── migracoes.md
│   │   └── worker-fila-parada.md
│   ├── api.md
│   ├── architecture.md
│   └── roadmap.md
├── scripts/
│   ├── check-architecture.mjs
│   ├── dev-abas.ps1
│   └── gen-db-types.mjs
├── .dockerignore
├── .editorconfig
├── .env.example
├── .gitattributes
├── .gitignore
├── .nvmrc
├── biome.json
├── CLAUDE.md
├── commitlint.config.mjs
├── CONTRIBUTING.md
├── ESTRUTURA.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── README.md
├── SECURITY.md
└── turbo.json
```
