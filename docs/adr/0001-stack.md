# ADR-0001 — Stack e arquitetura

- **Status:** Proposto (aprovar junto com o plano do MVP)
- **Data:** 2026-11-09
- **Decisor:** Kauã Buhs

## Contexto

Um desenvolvedor, uma cidade piloto, prazo de 8 a 10 semanas. O risco do projeto está na **qualidade dos dados** e na **adesão dos mercados**, não em escala. A stack deve ter poucas peças, todas conhecidas, e dar segurança desde o dia 1.

## Decisão

| Camada        | Escolha                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces + Turborepo; pacotes internos "just-in-time" (exportam `.ts`) |
| Linguagem     | TypeScript estrito de ponta a ponta                                           |
| Web/PWA       | Next.js (App Router), Tailwind v4, Radix/shadcn-style, Lucide                 |
| API           | Route Handlers e Server Actions com Zod; sem microserviços                    |
| Banco         | Postgres (Supabase) com PostGIS, pg_trgm, unaccent, pgvector                  |
| Auth/Arquivos | Supabase Auth (link mágico) e Storage em buckets privados                     |
| Fila/jobs     | **pg-boss** no próprio Postgres + cron; sem Redis                             |
| Worker        | Node/TS em container (jobs de IA são longos demais para serverless)           |
| IA            | Interface própria (`@compara/ai`); saída validada com Zod; adaptador Claude   |
| Mapas         | MapLibre + OpenStreetMap                                                      |
| Testes        | Vitest, Playwright, pgTAP (RLS)                                               |
| Qualidade     | Biome, commitlint, Husky                                                      |
| CI/CD         | GitHub Actions; previews da Vercel; produção por tag com aprovação            |

### Decisões de implementação tomadas na fundação

1. **Um monorepo**, não repositórios separados de front e back: schema, regra e tela viajam no mesmo PR (plano, seção 8).
2. **A comparação de lista vive em SQL** (`compare_list`), como no plano, e tem **gêmeo em TypeScript** (`backend/packages/domain/src/compare.ts`). Um teste de integração garante paridade nos dados do seed. Empates podem desempatar diferente.
3. **Lista de compras no aparelho** (localStorage), sem login — exigido por "nenhum cadastro para consultar". Sincronizar com `shopping_lists` fica pós-MVP.
4. **Preço por unidade base calculado no banco** (trigger), nunca confiado ao cliente. A mesma fórmula existe em `domain/units.ts`.
5. **Público não lê `price_observations`**: lê `current_prices` / `price_board` / `price_history()`, que só expõem preços aprovados e nunca o autor.
6. **Uploads só pelo servidor** (service_role): valida tipo/tamanho e remove EXIF antes de gravar. Buckets sem política de cliente.
7. **IA via JSON validado** (não tool use forçado): modelos atuais rejeitam `tool_choice` forçado; o Zod é a barreira de qualidade e há uma retentativa informando o erro.

## Decisões em aberto

| Decisão                     | Opções                                                                           | Como decidir                                                               |
| --------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Nome e domínio              | —                                                                                | antes do beta                                                              |
| Cidade piloto e 6 mercados  | Caxias do Sul (seed)                                                             | conversa com mercados                                                      |
| Provedor/modelo de extração | Claude (Opus 5.5 é o padrão do adaptador; Sonnet 5.5/Haiku 5.5 são mais baratos) | rodar o **golden set** com cada um e comparar precisão × custo por encarte |
| Hospedagem do worker        | Railway ou Fly.io                                                                | custo, região (latência até o Supabase), facilidade de deploy              |
| NFC-e                       | seguir ou descartar                                                              | spike técnico + jurídico (Fase 3), registrado em novo ADR                  |
| Política de contribuição    | pontos, reputação, moderadores                                                   | após o teste de abuso                                                      |

## Consequências

- ➕ Poucas peças para operar; segurança concentrada no banco; regras testáveis sem infraestrutura.
- ➖ Rate limit em memória é por instância (ver ADR-0003). pg-boss divide o Postgres com os dados: monitorar carga.
- Entram por novo ADR quando um limite real aparecer: Redis, Elasticsearch, microserviços, GraphQL, app nativo.
