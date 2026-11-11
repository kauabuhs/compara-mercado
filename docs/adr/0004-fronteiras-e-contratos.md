# ADR-0004 — Fronteiras, contratos e ausência de servidor de API dedicado

- **Status:** Parcialmente substituído pelo [ADR-0005](0005-separacao-frontend-backend.md) (a decisão de **não** criar uma API foi revertida; o restante — contratos, `arch:check`, front por funcionalidade — segue valendo)
- **Data:** 2026-11-10
- **Decisor:** Kauã Buhs
- **Complementa:** [ADR-0001](0001-stack.md)

## Contexto

Pediu-se uma arquitetura de monólito modular com Clean Architecture/DDD onde fizer sentido, front-end por funcionalidade, back-end em aplicação independente e contratos de API explícitos. A auditoria do código real (2026-11-10) mostrou:

- O grafo de dependências já era um DAG: **0 ciclos, 0 imports profundos** entre pacotes.
- `apps/web` e `apps/worker` já são deployáveis independentes e nunca se importam.
- `@compara/db` já devolvia modelos de leitura em camelCase validados por Zod, mas os **componentes importavam esses tipos do pacote de persistência**: o contrato com o front era implícito e acoplado ao banco.
- O front estava organizado por tipo (`components/`, `lib/`, `actions/`), o que espalha cada funcionalidade por 3 pastas.
- Nada **impedia** uma regressão: as boas fronteiras eram só convenção.
- O projeto não tem tenants, pagamentos, agendamentos nem ORM: esses módulos do modelo de referência não existem aqui e não foram inventados.

## Decisão

1. **Manter o monólito modular sobre a stack atual** (Next.js + Supabase + worker). Não introduzir NestJS/Prisma nem microsserviços.
2. **Criar `@compara/contracts`**: modelos de leitura (`PriceOffer`, `Store`, `ListComparison`…), a entrada validada `CompareListRequest`, o envelope `ApiResult<T>` e `CONTRACT_VERSION`. Sem dependência de banco ou de `domain`. Os mapeadores de `@compara/db` passam a devolver exatamente esses tipos (o compilador barra divergência), e **nomes de coluna não saem do `db`**.
3. **Reorganizar o front por funcionalidade** (`features/`, `shared/`, `app/` fino) e proibir acoplamento entre features.
4. **Tornar as fronteiras executáveis**: `scripts/check-architecture.mjs` (`pnpm arch:check`, na CI) com 7 regras. Escolhido em vez de `dependency-cruiser`/ESLint boundaries para não acrescentar dependência a uma árvore já endurecida pela política de cadeia de suprimentos (ADR-0002); cabe em ~200 linhas e foi testado contra violações injetadas.
5. **Worker em estilo hexagonal enxuto** (portas → caso de uso → adaptador), já existente; agora com a regra R7 impedindo que a infraestrutura vaze para o pipeline.

## Por que não há um servidor de API separado

A "API" pública de leitura é o Postgres atrás de RLS e RPCs, com `GRANT` mínimo, testado com 47 asserções pgTAP. Um servidor no meio:

- adiciona um salto de rede e um deploy (custo e latência para um app de leitura pesada, uso móvel);
- cria um segundo lugar onde esquecer uma regra de autorização, já aplicada no banco;
- não resolve nenhum problema atual de escala (o risco do projeto é qualidade de dado, ver ADR-0001).

**Gatilhos para criar `apps/api`** (reavaliar quando algum ocorrer): (a) endpoint que precise de `service_role` acionado por usuário (upload de encarte, ver abaixo); (b) integração com terceiros que exija segredo e webhooks; (c) cliente que não seja o Next.js (app nativo, parceiros) e precise de um contrato HTTP versionado; (d) regra de negócio que não caiba em RLS/RPC. Nesse caso `@compara/contracts` já é o ponto de partida (gerar OpenAPI a partir dos schemas Zod) e a extração é mecânica porque o `db` e o `domain` não dependem do front.

## Decisão em aberto: upload na Fase 2

O diagrama original mostrava o `web` subindo arquivos com `service_role`. Isso contradiz a regra "`service_role` só no worker" e está agora **bloqueado pela regra R6**. Opções, a decidir antes da Fase 2:

1. URL de upload assinada gerada por uma rota privilegiada **no worker** (que já detém a chave), com validação de tipo/tamanho e remoção de EXIF no processamento;
2. política de Storage que permita `INSERT` a usuários autenticados num prefixo próprio (sem `service_role`), validando no worker;
3. este seria o primeiro gatilho (a) para criar `apps/api`.

Recomendação provisória: opção 2 + validação no worker, por não exigir nova superfície privilegiada.

## Alternativas descartadas

- **NestJS + Prisma como back-end**: troca de stack sem problema que a justifique; duplicaria RLS/autorização e a geração de tipos.
- **Separar um pacote por camada (domain/application/infrastructure) em cada app**: camadas vazias; o worker tem um só caso de uso e o front não tem regra de negócio.
- **OpenAPI agora**: não há API HTTP própria a documentar; os contratos reais são Zod. Gerar OpenAPI fica para o gatilho (c).
- **Pastas `infrastructure/` e `docs/decisions/` do modelo de referência**: o único Dockerfile fica junto do worker e os ADRs já estão em `docs/adr`; mover só para igualar o desenho geraria churn sem ganho.

## Consequências

- (+) Mudar uma coluna só toca `db` (+ contrato se o formato mudar); o front não recompila por causa disso.
- (+) PR que quebre uma fronteira falha na CI com a regra e o arquivo.
- (−) Uma mudança de formato exige tocar `contracts` e o mapeador; é intencional (o contrato muda de propósito).
- (−) Os tipos de `contracts` e os schemas Zod do `db` são mantidos em par; o compilador garante a igualdade, mas não gera um a partir do outro.
