# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Compara Mercado: comparador de preços de supermercados ("em qual mercado da minha cidade a minha lista sai mais barata hoje?"). Texto de UI, commits e documentação em pt-BR. Monorepo pnpm + Turborepo com **duas aplicações independentes**, que só se falam por HTTP:

- `ComparaMercado-Back/` — pacote `comparamercado-back`: API HTTP (Hono) **e** worker de ingestão (pg-boss) no mesmo pacote, mais o projeto Supabase em `supabase/`.
- `ComparaMercado-Front/` — pacote `comparamercado-front`: PWA em Next.js 16 (Tailwind 4) com rotas `/admin`.

## Layout (ADR-0007) — mesmo padrão do ProAgendaV2

As duas aplicações foram reorganizadas de `backend/` + `frontend/` + `shared/` para `ComparaMercado-Back/` + `ComparaMercado-Front/` (decisão em `docs/adr/0007-layout-front-back-por-aplicacao.md`). Se encontrar `backend/apps/*`, `backend/packages/*`, `shared/contracts`, `frontend/packages/ui`, `features/` ou `shared/{ui,api,lib,server}` em algum documento, está desatualizado (`docs/adr/000[1-6]` são históricos). A verdade atual:

- Não há pacotes `@compara/*`: cada aplicação é um pacote só, com imports relativos (Back) ou alias `@/` (Front). Back em `ComparaMercado-Back/src/` (`lib/` = domínio puro, `modules/<x>/{controller,service,repository}`, `database/`, `middlewares/`, `contracts/`, `jobs/`, `config/`).
- Front em `ComparaMercado-Front/src/`: `app/` (rotas finas) · `modules/<x>/{components,actions.ts}` · `components/{ui,layout,shared}` · `lib/` (+ `__tests__/`) · `services/api/` · `stores/` · `server/` · `styles/`.
- Os contratos front↔back (schemas Zod) ficam em `ComparaMercado-Back/src/contracts/index.ts`. O front os importa pelo alias `@contracts` (ver `ComparaMercado-Front/tsconfig.json`); é a única travessia permitida entre as aplicações.
- Pontos de entrada do back: `src/index.ts` (API), `src/worker.ts` (worker). Raiz de composição da API: `src/services.ts` (`createSupabaseServices`); `createApp` em `src/app.ts` não lê ambiente nem abre porta.
- Variáveis de ambiente: `ComparaMercado-Back/.env` (API e worker, carregado com `--env-file-if-exists`) e `ComparaMercado-Front/.env.local`. Env da API: `src/config/env.ts`; do worker: `src/config/worker-env.ts`.
- Comandos de Supabase usam `--workdir ComparaMercado-Back` (já embutido nos scripts `db:*` da raiz).

## Comandos

Requisitos: Node ≥ 24.22.1 (`.nvmrc`), pnpm 12, Docker (para Supabase local).

```bash
pnpm install
pnpm db:start            # Supabase local: migrações + seed fictício (admin@local.test / admin123456)
pnpm dev:back            # API em http://127.0.0.1:4000       (um terminal por processo; suba o Back primeiro)
pnpm dev:front           # site em http://localhost:3000 (acesse por localhost, não 127.0.0.1: cookie PKCE é por host)
pnpm dev:worker          # worker (opcional; AI_PROVIDER=fake para não gastar)
pnpm dev:abas            # Windows Terminal com uma aba por processo (-- -Worker inclui o worker); no VS Code: tarefa "Iniciar Back + Front"

pnpm check               # lint + arch:check + typecheck + test (o que o CI roda)
pnpm lint / lint:fix     # Biome (format + lint + organizeImports)
pnpm arch:check          # fronteiras de arquitetura (scripts/check-architecture.mjs)
pnpm typecheck           # turbo: tsc no back; next typegen + tsc no front
pnpm test                # Vitest nos dois lados
pnpm test:e2e            # Playwright (precisa de Supabase local + build do front e do back)
pnpm build:front / build:back

pnpm db:reset            # recria o banco local (migrações do zero + seed)
pnpm db:test             # testes pgTAP em ComparaMercado-Back/supabase/tests/database
pnpm db:types            # regenera src/database/database.types.ts (commite o resultado; o CI confere)
```

Um teste isolado:

```bash
pnpm --filter comparamercado-back exec vitest run src/lib/__tests__/domain.test.ts
pnpm --filter comparamercado-back exec vitest run -t "nome do teste"
pnpm --filter comparamercado-front exec vitest run src/lib/__tests__/format.test.ts
pnpm --filter comparamercado-front exec playwright test --project=desktop   # e2e por projeto evita travar
```

Testes de integração (`src/__tests__/integration.test.ts`, `modules/catalog/__tests__/catalog.integration.test.ts`, `modules/ingest/__tests__/pipeline.integration.test.ts`) rodam contra o Supabase local e **são ignorados sem as variáveis** `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` (e `SUPABASE_TEST_ADMIN_EMAIL`/`_PASSWORD` para o trecho de admin; o do pipeline tem as suas, veja o cabeçalho do arquivo). Valores vêm de `pnpm exec supabase status -o env --workdir ComparaMercado-Back`.

Commits: Conventional Commits verificados por commitlint (hook `commit-msg`); escopos válidos em `commitlint.config.mjs`. O hook `pre-commit` roda `biome check --staged`.

## Arquitetura

**Fluxo:** navegador → servidor Next (Server Components/Actions) → API Hono (Bearer = token do usuário, guardado em cookie `httpOnly`) → Supabase Postgres sob RLS. O navegador nunca fala com a API nem com o banco. Exceção deliberada: login/logout/`auth/callback` ficam no Next (PKCE exige que o mesmo servidor que iniciou o login troque o código) e usam só a chave pública.

**A API não usa `service_role`.** Valida o JWT (`auth.getUser`), lê o papel em `profiles` e executa operações admin com um cliente que age como o usuário (`createUserClient`): a RLS é a barreira final. `service_role` é exclusivo do worker. Cache das leituras públicas (60 s; mercados 5 min) e rate limit (comparação: 30/min) são **em memória, por instância**, na API (`x-cache: HIT/MISS`); o login tem outro limitador no Next.

**Back-end em camadas por módulo** (`src/modules/<modulo>/`): `controller` (rotas Hono, só HTTP) → `service` (regra/caso de uso) → `repository` (única camada que conhece tabelas/colunas). Cada módulo expõe suas portas em `<modulo>.types.ts`; os testes montam um `Services` em memória em vez de passar por `services.ts`. Regras puras ficam em `src/lib/` (dinheiro em **centavos inteiros**, preço unitário, GTIN, normalização, frescor) e em arquivos puros de `service/` (`catalog/service/compare.ts`, `ingest/service/{golden,match,publish,trigram,validate}.ts`).

**Pipeline de ingestão** (`modules/ingest`, `jobs/`, `worker.ts`): fila pg-boss no próprio Postgres → `pipeline.service.ts` (caso de uso que só conhece as portas de `pipeline.types.ts`) → IA (`modules/ai`: provedor `fake`/`anthropic`, schemas Zod, prompts versionados, custo com teto mensal `AI_MONTHLY_BUDGET_CENTS`) → casamento de produto, validação de sanidade e decisão de publicação. A IA só publica sozinha com confiança ≥ `PUBLISH_CONFIDENCE_THRESHOLD` (0,9); o resto vira tarefa de revisão no `/admin/revisao`. Observações de preço são **imutáveis**; o preço exibido deriva de `current_prices` (observações aprovadas e vigentes).

**Banco** (`ComparaMercado-Back/supabase/`): migrações em `migrations/<timestamp>_*.sql` (nunca edite uma já aplicada em staging/produção), seed fictício, testes pgTAP. Toda tabela nova exige `enable row level security` + políticas explícitas + `grant` mínimo + teste pgTAP. Regras de leitura pesadas vivem em RPCs SQL (`compare_list`, `search_products`…), com paridade SQL ↔ TypeScript testada na integração.

**Front-end** (`ComparaMercado-Front/src`): `app/` (rotas finas) · `modules/<x>/` (uma pasta por funcionalidade, isoladas entre si) · `components/{ui,layout,shared}` · `lib/` · `services/api/` (cliente da API, só servidor) · `stores/` · `server/` (sessão e Supabase Auth, só servidor) · `styles/`. Sem regra de negócio nem acesso a dados: apresentação (formatação de preço/idade) fica no front; a API já devolve `freshness`/`ageDays` prontos. `ComparaMercado-Front/AGENTS.md` avisa que este Next 16 tem mudanças incompatíveis: consulte `node_modules/next/dist/docs/` antes de escrever código de Next.

**Contratos:** schemas Zod em `src/contracts/index.ts` validados pelo back (entrada) e pelo front (leitura). Mudou o formato de uma resposta/requisição? Atualize o contrato e `CONTRACT_VERSION`. Ordem segura de mudança: banco → API → front.

### Fronteiras verificadas por `pnpm arch:check`

Falham no CI; leia `scripts/check-architecture.mjs` para os detalhes. Resumo: R1 sem ciclos de import · R2 nenhum pacote `@compara/*` (cada aplicação é autocontida) · R3 front e back nunca se importam (só via `@contracts`) · R4 arquivos de regra pura sem framework/banco/rede/`node:*` · R5 módulos do front não importam uns aos outros e `components/lib/services/stores/server` não dependem de `modules/` nem `app/` · R6 código de navegador não toca servidor; `@supabase/*` no front só para sessão · R7 `service_role` e segredos do back nunca no front · R8 controller/middlewares/app não tocam persistência (só o service fala com o repository) · R9 repository/service não dependem de controller, e `pipeline.service.ts` não conhece infraestrutura.

## Convenções

- TypeScript estrito, **sem `any`** e **sem `!`** (Biome barra como erro); `import type` obrigatório (`verbatimModuleSyntax`); `noUncheckedIndexedAccess` e `noPropertyAccessFromIndexSignature` ligados (use `process.env["X"]`). Aspas duplas, ponto e vírgula, largura 100.
- Logs estruturados (pino) com `correlationId`/`requestId`; `console.*` só `error`/`warn`; nunca logar dado pessoal, chave ou arquivo bruto.
- Zod em toda entrada externa (formulários, rotas, RPCs, saída da IA). Datas em UTC.
- Mudança estrutural vira ADR em `docs/adr/`.
- `pnpm-workspace.yaml` só instala versões publicadas há ≥ 7 dias e desliga scripts de instalação (aprove com `pnpm approve-builds`); veja `docs/adr/0002-supply-chain.md`.
