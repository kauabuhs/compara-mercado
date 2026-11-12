# ADR-0006 — Persistência: autoridade do schema e escolha do ORM (Drizzle × Prisma)

- **Status:** Aceito
- **Data:** 2026-11-11
- **Decisor:** Kauã Buhs
- **Relacionados:** [ADR-0001](0001-stack.md) (stack), [ADR-0005](0005-separacao-frontend-backend.md) (API sem `service_role`; RLS como barreira final)

## Contexto

O projeto vai de um comparador de preços de uma cidade para a base de uma plataforma de supermercado multi-país (catálogo com variantes, preços por mercado/loja/moeda, promoções com vigência, estoque, mídias). A pergunta "Prisma ou Drizzle?" só faz sentido depois de olhar o que **já existe**:

| Fato do repositório (auditado em 2026-11-11)                                                                                                              | Consequência para a decisão                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Schema vive em `backend/supabase/migrations/*.sql` (Supabase CLI), com RLS, `GRANT` mínimo, triggers, colunas geradas, índices GiST/GIN/parciais, PostGIS | Quem gera DDL **não pode** ser um segundo sistema de migrations                                                      |
| Segurança por camadas testada em **pgTAP** (`backend/supabase/tests/database`)                                                                            | Policies/triggers precisam continuar sendo SQL revisável                                                             |
| A API age **com o token do usuário** via PostgREST (supabase-js); a RLS decide. `service_role` só no worker (R7 do `arch:check`)                          | Um ORM sobre conexão direta **ignora a RLS** (conecta como dono/role de serviço) ⇒ não pode entrar no caminho da API |
| Tipos do banco gerados por `supabase gen types`; regras em RPCs SQL (`compare_list`, `search_products`)                                                   | Já existe geração de tipos e leitura por RPC                                                                         |
| Worker usa `pg-boss` (driver `pg` já no lockfile) e `service_role`                                                                                        | Existe um caminho de servidor confiável com conexão direta, onde um query builder agrega valor                       |

Os padrões de acesso esperados não são CRUD de entidades isoladas: são **(a)** resolução de preço (lista da loja × lista do mercado × promoções vigentes, com agregações), **(b)** operações transacionais de estoque sob concorrência, **(c)** importações em lote de catálogo (milhares de linhas por job) e **(d)** leituras paginadas por cursor. Tudo isso é SQL específico de PostgreSQL.

## Opções avaliadas

**A. Prisma ORM** (estável: `@prisma/client` 7.10.1)
**B. Drizzle ORM** (estável: `drizzle-orm` 0.45.4; a 1.0 ainda está em beta)
**C. Sem ORM** (status quo: supabase-js + RPCs SQL)

### Critérios

| Critério                       | Prisma                                                                                                                                                                                                                                                                    | Drizzle                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Representa o schema atual?** | Parcialmente. PostGIS (`geography`) e `vector` só como `Unsupported`: o campo vira `any` e o model **perde** `create/update`. Triggers, views, índices parciais ficam fora do schema Prisma. CHECK/RLS aparecem apenas numa superfície nova ainda sem paridade comprovada | Sim: colunas geradas (`generatedAlwaysAs`), índices parciais (`.where`), CHECK, `pgPolicy`, `customType` para `geography`, `pgEnum`, `vector` |
| **Migrations**                 | Prisma Migrate é um sistema próprio: conflita com a autoridade do Supabase CLI. Usar só `db pull` perde o que não representa                                                                                                                                              | `drizzle-kit` também geraria DDL, mas **não precisamos instalá-lo**: o schema TS é um espelho tipado; DDL continua em SQL                     |
| **SQL gerado / controle**      | Cliente tipado de alto nível; consultas complexas (agregações, `FOR UPDATE`, `ON CONFLICT` parcial, CTE) acabam em `$queryRaw` sem tipos                                                                                                                                  | Query builder fiel ao SQL: `.for('update')`, `onConflictDoUpdate`, CTE, `sql`\`\` tipado, `insert … values` em lote                           |
| **Overhead / runtime**         | Prisma 7 não usa mais o motor Rust (driver adapters); overhead menor que nas versões anteriores, ainda maior que um builder fino                                                                                                                                          | Camada fina, sem geração de código nem binário                                                                                                |
| **Type safety**                | Excelente nos models gerados                                                                                                                                                                                                                                              | Excelente, inferida do schema TS; tipos de linha e de insert derivados                                                                        |
| **Transações / concorrência**  | `$transaction` interativa; `FOR UPDATE` só por SQL cru                                                                                                                                                                                                                    | `db.transaction` + `.for('update')`/`skipLocked`                                                                                              |
| **Maturidade / ecossistema**   | Muito maduro, grande base de usuários                                                                                                                                                                                                                                     | Ecossistema menor e **versão 0.x** (mudanças de API possíveis até a 1.0)                                                                      |
| **Onboarding**                 | Mais conhecido                                                                                                                                                                                                                                                            | Exige saber SQL (o que este projeto já exige: RLS, pgTAP)                                                                                     |

Fontes consultadas para as lacunas acima (acessadas em 2026-11-11): documentação do Prisma sobre [recursos de banco não suportados](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/unsupported-database-features) e o guia de PostGIS (`Unsupported` ⇒ sem escrita); documentação do Drizzle sobre [colunas geradas](https://orm.drizzle.team/docs/generated-columns). **Não fizemos benchmark**: nenhum número de microbenchmark genérico sustenta esta decisão. O argumento é de adequação ao padrão de acesso e ao modelo de segurança, não de velocidade bruta.

### Por que não C (sem ORM) como decisão final

Para a **API** (identidade do usuário + RLS) a opção C é a correta e permanece. Mas para o **servidor confiável** ela deixa de servir: PostgREST não faz transação de várias instruções nem `INSERT` em lote de dezenas de milhares de linhas com `ON CONFLICT` por job, e o worker precisa de conexão direta de qualquer forma (pg-boss). Sem um query builder, esse código vira SQL em string sem tipos.

## Decisão

1. **O DDL tem uma única autoridade: as migrations SQL do Supabase CLI.** Nenhum ORM gera, aplica ou reescreve migrations. `prisma migrate` e `drizzle-kit generate/push` não são usados.
2. **Drizzle ORM é o ORM do projeto**, com **escopo estreito**: caminhos de **servidor confiável** (worker, importações, jobs, operações transacionais de estoque) por conexão direta `pg`. Fica em `backend/packages/db/src/commerce/`.
3. **A API continua sem ORM**: leituras por supabase-js com o token do usuário (RLS) e por RPCs SQL (`resolve_prices`, `list_live_promotions`). Isso preserva a decisão do ADR-0005 e a regra R8.
4. **Prisma não é adotado.** Mantê-lo "para experimentar" junto com o Drizzle está proibido por este ADR: uma estratégia só.
5. **O schema Drizzle é um espelho tipado, mantido à mão e verificado**: um teste de integração (`commerce.integration.test.ts`) consulta, para cada tabela espelhada, todas as colunas declaradas. Coluna renomeada/removida no SQL sem atualizar o espelho **quebra a CI**. O espelho cobre só as tabelas que o código TypeScript realmente usa (não é um segundo catálogo completo do banco).
6. **Invariantes críticas ficam no banco, não no ORM**: saldo nunca negativo (CHECK), preços sem sobreposição (exclusão GiST), uso de promoção atômico (UPDATE condicional), histórico imutável (triggers). O ORM só chama funções SQL (`reserve_stock`, `set_product_price`…) ou faz leituras e cargas em lote.

### Fronteiras (alinhadas ao `arch:check`)

| Caminho                                | Identidade                                | Acesso                        | Onde                         |
| -------------------------------------- | ----------------------------------------- | ----------------------------- | ---------------------------- |
| Leitura pública / do usuário (via API) | Token do usuário (`anon`/`authenticated`) | supabase-js + RPC, RLS decide | `packages/db/src/queries.ts` |
| Worker, importação, jobs, estoque      | Conexão direta (`DATABASE_URL`)           | Drizzle sobre `pg`            | `packages/db/src/commerce/`  |

`DATABASE_URL` nunca vai ao front (regra R7 existente). Recomendação de endurecimento (pendente, ver relatório): trocar o usuário `postgres` por um papel dedicado `app_worker` com `GRANT` mínimo.

## Consequências

- ➕ Uma só fonte de verdade para o DDL; RLS/triggers/pgTAP intactos.
- ➕ Código de servidor confiável tipado, com `FOR UPDATE`, `ON CONFLICT` e lotes expressos em SQL claro.
- ➕ Nenhuma dependência nova de driver (`pg` já está no lockfile); `drizzle-kit` **não** é instalado.
- ➖ Duas formas de acesso (supabase-js e Drizzle), separadas pela fronteira de confiança que já existia. Mitigação: regra clara na tabela acima.
- ➖ Três representações do schema: SQL (autoridade), `database.types.ts` (gerado) e o espelho Drizzle (à mão). Mitigação: teste de colunas na CI; o espelho cobre só o usado.
- ➖ `drizzle-orm` é 0.x. Mitigação: versão fixada, uso confinado a **um pacote**, camada fina; trocar de ORM custaria reescrever só `commerce/`.

## Quando revisitar

- Drizzle 1.0 estável: avaliar migração de versão.
- Se a API passar a precisar de conexão direta (ex.: relatórios pesados): usar **transação com `SET LOCAL ROLE authenticated` e `request.jwt.claims`** para manter a RLS, em novo ADR.
- Se o espelho Drizzle passar de ~20 tabelas ou começar a divergir: gerar o espelho por introspecção (`drizzle-kit pull`) na CI.
