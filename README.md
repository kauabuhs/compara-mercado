# Compara Mercado

> **Em qual mercado da minha cidade a minha lista de compras sai mais barata hoje?**
> Tudo que não ajuda a responder isso fica fora do MVP. Piloto: Serra Gaúcha (nome provisório).

Monorepo TypeScript (pnpm + Turborepo) com **duas aplicações independentes** — Front (PWA em Next.js) e Back (API HTTP + worker de ingestão com IA sobre Postgres/Supabase com RLS, PostGIS e pg_trgm) — que só compartilham o contrato HTTP. Plano completo: [`docs/roadmap.md`](docs/roadmap.md).

## Estrutura

Duas aplicações independentes na raiz, no mesmo padrão do ProAgendaV2 (`*-Back` / `*-Front`):

```text
ComparaMercado-Front/       PWA do consumidor + rotas /admin    (Next.js 16, Tailwind 4)
  src/app/                  rotas finas (App Router): buscam dados e compõem módulos
  src/modules/<x>/          uma pasta por funcionalidade: components/ e actions.ts
  src/components/           ui/ (primitivos) · layout/ (casca) · shared/ (compostos reutilizáveis)
  src/lib/                  formatação, busca, rate limit (puro, com __tests__/)
  src/services/api/         cliente tipado da API — só servidor
  src/stores/               estado de cliente (lista de compras)
  src/server/               env, sessão, IP do cliente, Supabase Auth — só servidor
  src/styles/               tokens de design e CSS global
ComparaMercado-Back/        API HTTP (Hono) + worker de ingestão (pg-boss) num pacote só
  src/index.ts, worker.ts   pontos de entrada da API e do worker
  src/modules/<x>/          controller → service → repository (catalog, ingest, ai, auth, …)
  src/{lib,database,middlewares,contracts,jobs,config}
  supabase/                 migrações SQL, seed fictício, testes pgTAP
docs/                       ADRs, roadmap, arquitetura, contratos da API, runbooks
scripts/                    verificador de arquitetura, gerador de tipos do banco, abas de dev
.github/                    CI, segurança, deploy, templates
```

Front e Back **não se importam** (verificado por `pnpm arch:check`); falam só por HTTP. A única ponte é o contrato (schemas Zod e tipos puros) em `ComparaMercado-Back/src/contracts`, que o Front lê pelo alias `@contracts`. Detalhes em [`docs/architecture.md`](docs/architecture.md) e [ADR-0007](docs/adr/0007-layout-front-back-por-aplicacao.md).

## Começando

Pré-requisitos: **Node ≥ 24.22.1** (ver `.nvmrc`), **pnpm 12**, **Docker** em execução.

```bash
pnpm install
pnpm db:start                 # Supabase local: aplica migrações + seed fictício
# Crie ComparaMercado-Back/.env e ComparaMercado-Front/.env.local a partir de .env.example,
# com os valores de `pnpm exec supabase status --workdir ComparaMercado-Back`.
```

Cada aplicação sobe **sozinha, em seu próprio terminal** (o Front precisa da API no ar):

```bash
pnpm dev:back                 # aba 1 — API em http://127.0.0.1:4000
pnpm dev:front                # aba 2 — site em http://localhost:3000
pnpm dev:worker               # aba 3 (opcional) — ingestão; AI_PROVIDER=fake não gasta
```

Atalhos: `pnpm dev:abas` abre o Windows Terminal com uma aba por processo (`-- -Worker` inclui o worker); no VS Code, **Terminal → Executar tarefa → "Iniciar Back + Front"** abre um painel dedicado para cada um; `pnpm dev` roda os dois num único terminal (Turborepo).

Login de admin local (só desenvolvimento): `admin@local.test` / `admin123456`. Os e-mails de login caem no Mailpit em http://127.0.0.1:54324. Acesse sempre por `localhost`, não `127.0.0.1` (o cookie do PKCE é por host).

> Se o Studio do Supabase falhar o healthcheck, suba sem os serviços opcionais:
> `pnpm exec supabase start --workdir ComparaMercado-Back -x studio,imgproxy,edge-runtime,logflare,vector,supavisor`

## Comandos

| Comando                                      | O que faz                                                      |
| -------------------------------------------- | -------------------------------------------------------------- |
| `pnpm check`                                 | lint + arquitetura + tipos + testes (o que o CI roda primeiro) |
| `pnpm lint` / `pnpm lint:fix`                | Biome                                                          |
| `pnpm arch:check`                            | verifica as fronteiras entre Front, Back, módulos e camadas    |
| `pnpm typecheck`                             | TypeScript estrito no Back e no Front                          |
| `pnpm test`                                  | testes unitários (Vitest)                                      |
| `pnpm test:e2e`                              | Playwright (precisa do Supabase local e do build)              |
| `pnpm db:reset`                              | recria o banco local: migrações do zero + seed                 |
| `pnpm db:test`                               | testes pgTAP (RLS e regras do banco)                           |
| `pnpm db:types`                              | regenera `ComparaMercado-Back/src/database/database.types.ts`  |
| `pnpm dev:back` / `dev:front` / `dev:worker` | cada aplicação em modo watch, em terminais separados           |
| `pnpm dev:abas`                              | abre uma aba do Windows Terminal para cada processo            |
| `pnpm build:front` / `build:back`            | compila só uma das aplicações                                  |

Testes de integração contra o Supabase local (paridade SQL ↔ TypeScript da comparação de lista, rotas reais, contratos, login de admin e pipeline):

```bash
eval "$(pnpm exec supabase status -o env --workdir ComparaMercado-Back | sed 's/^/export /')"
SUPABASE_TEST_URL="$API_URL" SUPABASE_TEST_ANON_KEY="$ANON_KEY" \
  SUPABASE_TEST_ADMIN_EMAIL=admin@local.test SUPABASE_TEST_ADMIN_PASSWORD=admin123456 \
  pnpm --filter comparamercado-back test
```

## Princípios (resumo)

- **Negar por padrão.** RLS em todas as tabelas, privilégios mínimos, papéis checados no banco. Segredos só em variáveis de ambiente; `service_role` apenas no servidor/worker.
- **Observação de preço é imutável.** O preço exibido sempre deriva de observações aprovadas e vigentes (`current_prices`).
- **Fronteiras verificadas por máquina** (`pnpm arch:check`, também na CI): sem ciclos, Front e Back isolados, módulos do Front isolados entre si, banco só no servidor.
- **Regra de negócio em `ComparaMercado-Back/src/lib` e nos `service/` puros**, funções testáveis. Zod em toda fronteira (API, worker, saída da IA).
- **A IA nunca publica sozinha sem confiança alta** (limiar inicial 0,9) e tudo é rastreável até o arquivo de origem.
- **Mudança estrutural vira ADR** em `docs/adr/`. Detalhes em [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Documentação

[Roadmap e status das fases](docs/roadmap.md) · [Arquitetura](docs/architecture.md) · [API e contratos](docs/api.md) · [ADRs](docs/adr) · [Runbooks](docs/runbooks) · [Segurança](SECURITY.md)
