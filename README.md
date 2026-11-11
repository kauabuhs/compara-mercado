# Compara Mercado

> **Em qual mercado da minha cidade a minha lista de compras sai mais barata hoje?**
> Tudo que não ajuda a responder isso fica fora do MVP. Piloto: Serra Gaúcha (nome provisório).

Monorepo TypeScript (pnpm + Turborepo) com **duas aplicações independentes** — front-end (PWA em Next.js) e back-end (API HTTP + worker de ingestão com IA sobre Postgres/Supabase com RLS, PostGIS e pg_trgm) — que só compartilham contratos. Plano completo: [`docs/roadmap.md`](docs/roadmap.md).

## Estrutura

```text
frontend/              PWA do consumidor + rotas /admin        (Next.js 16, Tailwind 4)
  src/{app,features,shared}   rotas finas · uma pasta por funcionalidade · casca e clientes
  packages/ui/                design system: tokens, componentes acessíveis, formatação de preço
backend/
  apps/api/            API HTTP v1 (Hono): leitura pública, comparação de lista, administração
  apps/worker/         ingestão e jobs agendados             (Node + pg-boss + pino)
  packages/domain/     regras puras: preço unitário, normalização, frescor, comparação de lista
  packages/ingest/     casamento de produtos, validação de sanidade, decisão de publicação
  packages/ai/         interface do provedor de IA, schemas Zod, prompts versionados, custo
  packages/db/         tipos gerados do banco e consultas tipadas (única camada que conhece colunas)
  supabase/            migrações SQL, seed fictício, testes pgTAP
shared/
  contracts/           contrato front ↔ back: rotas, schemas Zod e tipos da API (versionado)
  config/              tsconfig compartilhados
docs/                  ADRs, roadmap, arquitetura, contratos da API, runbooks
scripts/               verificador de arquitetura, gerador de tipos do banco
.github/               CI, segurança, deploy, templates
```

O front-end **não importa nada do back-end** e vice-versa (verificado por `pnpm arch:check`); eles se falam só por HTTP, no formato de `shared/contracts`. Detalhes em [`docs/architecture.md`](docs/architecture.md).

## Começando

Pré-requisitos: **Node ≥ 24.22.1** (ver `.nvmrc`), **pnpm 12**, **Docker** em execução.

```bash
pnpm install
pnpm db:start                 # Supabase local: aplica migrações + seed fictício
# Crie frontend/.env.local e backend/apps/api/.env a partir de .env.example,
# com os valores de `pnpm exec supabase status --workdir backend`.
pnpm dev:api                  # API em http://127.0.0.1:4000
pnpm dev:frontend             # site em http://localhost:3000
```

Login de admin local (só desenvolvimento): `admin@local.test` / `admin123456`. Os e-mails de login caem no Mailpit em http://127.0.0.1:54324.

> Se o Studio do Supabase falhar o healthcheck, suba sem os serviços opcionais:
> `pnpm exec supabase start --workdir backend -x studio,imgproxy,edge-runtime,logflare,vector,supavisor`

## Comandos

| Comando                                        | O que faz                                                      |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `pnpm check`                                   | lint + arquitetura + tipos + testes (o que o CI roda primeiro) |
| `pnpm lint` / `pnpm lint:fix`                  | Biome                                                          |
| `pnpm arch:check`                              | verifica as fronteiras entre pacotes, features e camadas       |
| `pnpm typecheck`                               | TypeScript estrito em todos os pacotes                         |
| `pnpm test`                                    | testes unitários (Vitest)                                      |
| `pnpm test:e2e`                                | Playwright (precisa do Supabase local e do build)              |
| `pnpm db:reset`                                | recria o banco local: migrações do zero + seed                 |
| `pnpm db:test`                                 | testes pgTAP (RLS e regras do banco)                           |
| `pnpm db:types`                                | regenera `backend/packages/db/src/database.types.ts`           |
| `pnpm dev:api` / `dev:frontend` / `dev:worker` | cada aplicação em modo watch (variáveis em `.env.example`)     |
| `pnpm build:frontend` / `build:backend`        | compila só um lado (e o que ele consome)                       |

Testes de integração contra o Supabase local (`db`: paridade SQL ↔ TypeScript da comparação de lista; `api`: rotas reais, contratos e login de admin):

```bash
eval "$(pnpm exec supabase status -o env --workdir backend | sed 's/^/export /')"
SUPABASE_TEST_URL="$API_URL" SUPABASE_TEST_ANON_KEY="$ANON_KEY" \
  SUPABASE_TEST_ADMIN_EMAIL=admin@local.test SUPABASE_TEST_ADMIN_PASSWORD=admin123456 \
  pnpm --filter @compara/db --filter @compara/api test
```

## Princípios (resumo)

- **Negar por padrão.** RLS em todas as tabelas, privilégios mínimos, papéis checados no banco. Segredos só em variáveis de ambiente; `service_role` apenas no servidor/worker.
- **Observação de preço é imutável.** O preço exibido sempre deriva de observações aprovadas e vigentes (`current_prices`).
- **Fronteiras verificadas por máquina** (`pnpm arch:check`, também na CI): sem ciclos, dependências só na direção permitida, features isoladas, banco só no servidor.
- **Regra de negócio em `backend/packages/domain`**, funções puras e testáveis. Zod em toda fronteira (API, worker, saída da IA).
- **A IA nunca publica sozinha sem confiança alta** (limiar inicial 0,9) e tudo é rastreável até o arquivo de origem.
- **Mudança estrutural vira ADR** em `docs/adr/`. Detalhes em [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Documentação

[Roadmap e status das fases](docs/roadmap.md) · [Arquitetura](docs/architecture.md) · [API e contratos](docs/api.md) · [ADRs](docs/adr) · [Runbooks](docs/runbooks) · [Segurança](SECURITY.md)
