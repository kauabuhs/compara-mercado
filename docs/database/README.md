# Banco de dados — visão geral

Postgres 17 (Supabase) com PostGIS, `pg_trgm`, `unaccent`, `vector` e `btree_gist`. Este diretório explica **o que existe, por quê, e como mexer** sem precisar ler todas as migrações.

| Documento                                              | Conteúdo                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **este arquivo**                                       | Arquitetura de persistência, ambiente, migrações, seeds, testes, performance     |
| [modelo-de-dados.md](modelo-de-dados.md)               | Diagrama ER, responsabilidade de cada tabela, constraints e índices (com motivo) |
| [precos-e-moedas.md](precos-e-moedas.md)               | Dinheiro, arredondamento, listas de preço, resolução de preço                    |
| [promocoes.md](promocoes.md)                           | Ciclo de vida, vigência, expiração automática, empilhamento, limites de uso      |
| [estoque.md](estoque.md)                               | Saldo, razão, reservas, concorrência, transferências, fornecedores               |
| [midias.md](midias.md)                                 | Imagens: Storage + CDN, renditions, o que as listagens leem                      |
| [importacao-de-catalogo.md](importacao-de-catalogo.md) | Como entram catálogos reais (e por que não por seed)                             |
| [ADR-0006](../adr/0006-persistencia-e-orm.md)          | Decisão Drizzle × Prisma e a fronteira de acesso a dados                         |

## Glossário (leia antes de tudo)

"Mercado" significa duas coisas no projeto. No banco elas têm nomes distintos:

| Termo no banco     | É…                                                                                             | Na interface       |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------ |
| `stores`           | Estabelecimento físico (Mercado Centro, Atacado Serra)                                         | "Mercados"         |
| `markets`          | Escopo comercial: país (+região), **moeda**, fuso e convenção fiscal. Toda loja pertence a um. | (não aparece)      |
| `products`         | **Variante** vendável: um GTIN, um tamanho, uma embalagem                                      | Produto            |
| `product_families` | **Identidade** do produto ("Refrigerante Cola X"), comum a todas as apresentações              | (agrupa variantes) |

## Duas camadas de preço (nunca se misturam)

```mermaid
flowchart LR
  subgraph evidencia[Evidência — comparador]
    PO[price_observations<br/>append-only, revisadas] --> CP[current_prices<br/>materializada]
  end
  subgraph publicado[Preço publicado — operação]
    PL[price_lists] --> PP[product_prices<br/>versionados no tempo]
    PR[promotions] --> RP
    PP --> RP{{resolve_prices}}
  end
  CP --> CMP[compare_list / busca]
  RP --> API[API / worker]
```

- **Observações** são o que se _viu_ em lojas de terceiros (encarte, etiqueta): evidência com confiança, revisão e auditoria.
- **Listas de preço** são o que a operação _publica_ por mercado/loja, com vigência. A conversão cambial **não** existe: cada mercado tem seu preço na sua moeda.

## Arquitetura de persistência

```text
ComparaMercado-Back/supabase/migrations/   DDL — ÚNICA autoridade do schema (SQL, revisável, com RLS e testes pgTAP)
ComparaMercado-Back/supabase/seeds/        dados fictícios de desenvolvimento (nunca em staging/produção)
ComparaMercado-Back/supabase/tests/        pgTAP: constraints, RLS, funções, histórico imutável
ComparaMercado-Back/src/
  database/supabase.ts         cliente supabase-js + RPC (identidade do usuário, RLS)        ← API
  database/database.types.ts   tipos GERADOS (pnpm db:types); a CI falha se estiverem velhos
  database/{client,schema}.ts  Drizzle sobre `pg` (servidor confiável)                       ← worker/importação
  modules/*/repository/        única camada que fala com tabelas/colunas
  jobs/                        jobs agendados: expiração de promoções e de reservas
```

Regra de acesso (ADR-0006):

| Quem                                             | Como                            | RLS?                              |
| ------------------------------------------------ | ------------------------------- | --------------------------------- |
| API em nome de um usuário                        | supabase-js + token + RPC       | **Sim** (a barreira final)        |
| Worker / importação / jobs, escopo do comparador | `src/database` (Drizzle + `pg`) | Não (conexão direta, só servidor) |

Nenhum código de interface faz consulta: o front fala só com a API (ADR-0005, `pnpm arch:check`).

## Ambiente

| Variável                                                | Onde                 | Para quê                                                          |
| ------------------------------------------------------- | -------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                                          | worker               | Conexão direta (pg-boss + Drizzle). **Nunca** no front (regra R7) |
| `DATABASE_URL_TEST`                                     | testes de integração | Banco **descartável** para `commerce.integration.test.ts`         |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | worker               | Pipeline de ingestão (supabase-js)                                |
| `SUPABASE_TEST_*`                                       | testes de integração | Ver `docs/runbooks/desenvolvimento-local.md`                      |

Pool do worker (`createPool`): `max=4` conexões, `statement_timeout=30 s`, `idle_in_transaction_session_timeout=30 s`, `application_name=compara-worker-commerce` (aparece em `pg_stat_activity`/`pg_stat_statements`, que identifica consulta lenta por origem). Some o `max` de todos os processos e confira contra o limite de conexões do plano.

## Migrações

Versionadas em `ComparaMercado-Back/supabase/migrations`, **nunca editadas depois de aplicadas** (corrige-se com migração nova — foi o que a `0017` fez). Do zero: `pnpm db:reset` (**só local**). Regras de processo: [runbook](../runbooks/migracoes.md).

| #         | Arquivo                      | O que faz                                                                                                                                  |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0001–0007 | (base do comparador)         | Tabelas, RLS, funções, `current_prices`, busca, revisão                                                                                    |
| 0008      | `record_status_draft`        | Valor `draft` (rascunho) em `record_status`                                                                                                |
| 0009      | `markets_currencies_regions` | Moedas (ISO 4217), países (ISO 3166), 27 UFs, `markets`; `cities`/`stores` ficam multi-país                                                |
| 0010      | `catalog_model`              | Marcas, **famílias × variantes**, identificadores, atributos, alergênicos, nutrição + backfill                                             |
| 0011      | `pricing`                    | Listas de preço, preços versionados com exclusão de sobreposição, `set_product_price`                                                      |
| 0012      | `promotions`                 | Promoções, escopo, regras, resgates, expiração, `redeem_promotion`, conflitos                                                              |
| 0013      | `inventory_suppliers`        | Depósitos, saldo, razão, reservas, funções atômicas, fornecedores                                                                          |
| 0014      | `media`                      | Metadados de imagem, renditions, vínculos, bucket público `catalog`                                                                        |
| 0015      | `price_resolution_and_jobs`  | `resolve_prices`, `list_live_promotions`, `job_runs`                                                                                       |
| 0016      | `catalog_listing_index`      | Índice da paginação por cursor (**medido**: 48,5 ms → 0,44 ms em 200 mil produtos)                                                         |
| 0017      | `drop_speculative_indexes`   | Remove 3 índices sem consulta que os justifique                                                                                            |
| 0018      | `comparator_active_cities`   | `compare_list` e `listStores` só consideram lojas de **cidades ativas** (`cities.active`): lojas de outros países não entram no comparador |

**Compatibilidade.** As migrações 0008–0017 são aditivas, exceto por relaxamentos (`cities.ibge_code`/`uf` deixam de ser `NOT NULL`). Nada foi removido ou renomeado; `products` continua sendo a variante e todas as views/funções/RLS anteriores seguem válidas. Os 48 produtos existentes receberam família e marca por backfill (verificado: 0 produtos sem família). Backup pré-migração da base local: `%TEMP%\compara-mercado-pre-commerce-*.dump`.

**Reprodutibilidade.** Foi validado (a) em banco vazio, aplicando 0001→0018 + seeds, e (b) sobre dados existentes (baseline 0001–0007 + seed antigo, depois 0008+). Ambos passam nos 256 testes pgTAP.

## Seeds

| Arquivo              | Conteúdo                                                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seed.sql`           | Cidade piloto, 6 lojas, ~48 produtos, observações de preço, admin local                                                                                                                                                                        |
| `seeds/commerce.sql` | Mercados US/PT, variantes do refrigerante (350 ml, 600 ml, 2 L, pack 6), listas de preço (BR, loja, US, PT), 6 promoções (vigente, vencida-ainda-`active`, futura, de loja, acumulável, EUA), depósitos/estoque/reservas, fornecedores, mídias |

**Todos os dados são fictícios** (identificados com "(demo)") e só rodam em `db reset`. Os valores nutricionais são ilustrativos. As chaves de imagem (`demo/…`) não apontam para arquivos reais. Catálogo real entra por importação ([guia](importacao-de-catalogo.md)).

## Testes

| Camada      | Onde                                                             | Cobre                                                                                                             |
| ----------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| pgTAP (256) | `ComparaMercado-Back/supabase/tests/database/01…08`              | Constraints, RLS/privilégios, histórico imutável, vigência, expiração, estoque, mídia, jobs, escopo do comparador |
| Vitest      | `ComparaMercado-Back/src/__tests__/commerce.integration.test.ts` | **Concorrência real** (conexões paralelas), importação em lote, paginação, jobs, espelho Drizzle × banco          |

Mapa do que o enunciado pede → onde está testado:

| Requisito                           | Teste                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Criação de produtos / variantes     | `05` (família compartilhada por 3 apresentações), integração (importação em lote)                     |
| Atualização de preços, por mercado  | `06` (versões, agendamento, loja > mercado, moeda por mercado), integração (`setProductPrice`)        |
| Promoções válidas / expiradas       | `06` (vigência nas bordas, expirada-ainda-`active` ignorada, futura), integração (`expirePromotions`) |
| Início e término                    | `06` — no instante exato do início vale; do término já não vale (`[início, fim)`)                     |
| Integridade dos relacionamentos     | `05`/`06`/`07` — FKs compostas (moeda do mercado, loja do mercado), imutabilidade, sem DELETE         |
| Estoque simultâneo                  | integração: 25 reservas/10 em estoque → exatamente 10; saídas; transferências cruzadas sem deadlock   |
| Exclusão e preservação de histórico | `05`/`06`/`07` — `42501` ao tentar apagar produto, família, preço, promoção, razão, asset             |
| Referências de imagens              | `07` — `ready` exige miniatura; asset em uso não regride; vínculo para asset inexistente falha        |

Rodar: `pnpm db:reset && pnpm db:test` (pgTAP) e
`DATABASE_URL_TEST=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter comparamercado-back test`. **Use banco descartável** para o Vitest: ele cria histórico imutável que não dá para limpar.

## Segurança

- **Negar por padrão.** Toda tabela tem RLS ligada (um teste pgTAP falha se alguma não tiver) e `GRANT` mínimo; tabelas novas nascem sem acesso para `anon`/`authenticated`.
- **Público lê pouco e só pelo que é seguro**: catálogo ativo, alergênicos/nutrição, assets `ready`, e _resultados_ via `resolve_prices` / `list_live_promotions` (funções `SECURITY DEFINER` com `search_path` vazio). Tabelas de preço, promoção, estoque, fornecedor e jobs são **admin/`service_role`**.
- **Sem `DELETE`** em entidades com histórico, para qualquer papel: gatilhos `forbid_delete`/`append_only` lançam `42501` até para o dono do banco.
- **Parametrizado sempre**: o Drizzle e o `pg` enviam parâmetros; arrays entram por `sql.param` (um array solto no template do Drizzle vira lista `($2, $3…)`; isso foi um bug real pego pelos testes).
- **Logs** sem payload: `job_runs.error` é truncado em 500 caracteres; o pool não loga SQL.
- **Isolamento entre organizações:** hoje há um único operador (papel `admin`). Se surgirem operadores independentes, o caminho é `store_members(user_id, store_id, role)` + políticas por `store_id` nas tabelas operacionais (estoque, preços de loja, promoções de loja) — a RLS no banco, nunca filtro no front. Não foi criado antes da necessidade.
- **Endurecimento pendente:** o worker conecta como `postgres` (dono). O ideal é um papel `app_worker` com `GRANT` restrito às funções e tabelas do domínio comercial.

## Performance e crescimento

Medido (200 mil produtos / 400 mil versões de preço, sintético, EXPLAIN ANALYZE): listagem por cursor **0,44 ms/página** com `products_listing_idx`; preço vigente **~0,05 ms/produto** pelo índice GiST da própria constraint de exclusão; `resolve_prices` **~0,8 ms/produto** (40 ms para 50 produtos).

| Tema                | Estado hoje                                                                                         | Gatilho para evoluir                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Paginação           | Cursor (keyset) em `(canonical_name, id)`; sem OFFSET                                               | —                                                                         |
| N+1                 | Miniatura vem no mesmo SELECT (LEFT JOIN na view); saldos de N produtos em 1 consulta               | —                                                                         |
| Escritas em lote    | `importCatalog`: insert/update em lotes de 1000, uma transação; `unnest` para updates               | Importações > ~100 mil linhas: usar `COPY` para tabela de staging         |
| Concorrência        | UPDATE condicional + CHECK (estoque), UPDATE condicional (uso de promoção), advisory lock (preço)   | —                                                                         |
| Cache de leitura    | Na API (60 s em memória, por instância)                                                             | Várias instâncias da API ⇒ Redis (novo ADR)                               |
| Réplicas de leitura | Não                                                                                                 | CPU do primário > ~60% sustentada por leituras                            |
| Particionamento     | Não. `inventory_movements`, `price_observations` e `audit_log` são os candidatos naturais (por mês) | Tabela > ~50–100 milhões de linhas ou VACUUM/retenção custoso             |
| Busca               | `pg_trgm` + `unaccent` (word_similarity)                                                            | Catálogo > ~1–2 milhões de produtos ou facetas complexas ⇒ motor dedicado |
| Observabilidade     | `application_name` por origem; `pg_stat_statements` disponível no Postgres local                    | Ligar `log_min_duration_statement` e dashboard de lentas em produção      |

Dívida conhecida de escrita: `audit_log` recebe um registro por alteração de produto/família/marca/preço-lista/promoção. Em importações grandes isso dobra o custo de escrita; se virar problema, auditar por lote (um registro por importação) em vez de por linha.
