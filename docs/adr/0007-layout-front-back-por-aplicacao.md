# ADR-0007 — Uma pasta por aplicação (`ComparaMercado-Front` / `ComparaMercado-Back`) no padrão do ProAgendaV2

- **Status:** Aceito
- **Data:** 2026-11-11
- **Decisor:** Kauã Buhs
- **Substitui:** o layout físico (`frontend/`, `backend/`, `shared/`) do [ADR-0005](0005-separacao-frontend-backend.md); a separação lógica (API HTTP própria, front sem acesso a dados) **continua valendo**
- **Relacionados:** [ADR-0004](0004-fronteiras-e-contratos.md) (contratos e `arch:check`), [ADR-0006](0006-persistencia-e-orm.md)

## Contexto

O ADR-0005 separou Front e Back, mas o Back ficou fragmentado em seis pacotes de workspace (`api`, `worker`, `domain`, `db`, `ingest`, `ai`) e o Front carregava um pacote de UI próprio (`frontend/packages/ui`) mais um pacote de contratos. Na prática: dezenas de `package.json`/`tsconfig.json` e reexports em `index.ts` para um time de uma pessoa; nenhuma das partes é publicada nem versionada separadamente.

O ProAgendaV2 (projeto do mesmo autor, em produção) resolve o mesmo problema com **duas aplicações autocontidas** — `*-Back` e `*-Front` — cada uma com uma árvore `src/` por camada (`modules/`, `lib/`, `components/`, `services/`, `stores/`…). Esse padrão já é conhecido, testado e documentado, e reduz o custo de navegar e de onboarding.

## Decisão

1. **Duas aplicações na raiz**, cada uma um pacote pnpm: `ComparaMercado-Back` (`comparamercado-back`) e `ComparaMercado-Front` (`comparamercado-front`). Sem pacotes internos `@compara/*`; dentro de cada aplicação, imports relativos ou o alias `@/` (Front).
2. **Back** (`ComparaMercado-Back/src`): `index.ts` (API) e `worker.ts` (worker) no mesmo pacote; `lib/` (regras puras), `modules/<x>/{controller,service,repository}`, `database/`, `middlewares/`, `contracts/`, `jobs/`, `config/`. Projeto Supabase em `ComparaMercado-Back/supabase/`.
3. **Front** (`ComparaMercado-Front/src`): `app/` (rotas finas do Next), `modules/<x>/` (substitui `features/`), `components/{ui,layout,shared}` (substitui `shared/components` e `packages/ui`), `lib/` (substitui `shared/lib`), `services/api/` (substitui `shared/api`), `stores/`, `server/` (substitui `shared/server`) e `styles/`. Os testes ficam em `__tests__/` ao lado do código, como no Back.
4. **Contrato**: continua em um único lugar — `ComparaMercado-Back/src/contracts` —, e o Front o importa pelo alias `@contracts` (`tsconfig.json`). É a **única** travessia permitida entre as aplicações (regra R3 do `arch:check`); o conteúdo é só Zod e tipos puros, sem Node, banco nem framework (R4).
5. **Dependências entre módulos do Front**: um módulo não importa outro. O que dois módulos precisam sobe de camada (ex.: a lista de compras, usada por `account` e `shopping-list`, virou `stores/shopping-list.store.ts`). `components/`, `lib/`, `services/`, `stores/` e `server/` não conhecem `modules/` nem `app/` (R5).
6. **Desenvolvimento**: scripts `dev:back`, `dev:front` e `dev:worker` na raiz, um processo por terminal; `dev:abas` e as tarefas do VS Code abrem cada um em sua própria aba.

## Consequências

- ➕ Muito menos `package.json`/`tsconfig.json` para manter, build e deploy por aplicação sem `workspace:*`, mesma navegação do ProAgendaV2.
- ➕ `arch:check` continua barrando acoplamento: as regras passaram de "dependência entre pacotes" para "dependência entre pastas" (R2 agora proíbe `@compara/*`; R5 cobre módulos/camadas).
- ➖ A pureza do domínio deixa de ser imposta por fronteira de pacote e passa a depender só do `arch:check` (R4) — por isso a lista de arquivos puros é explícita no script.
- ➖ O Front lê um arquivo que mora no Back (`@contracts`). Alternativa descartada: duplicar os tipos (como o ProAgendaV2 faz em `types/`), que permitiria o Front divergir da API sem o compilador avisar. Se o Front for hospedado em repositório separado, o contrato passa a ser publicado como pacote.
- ➖ Imports que antes eram `@compara/ui` viram caminhos diretos (`@/components/ui/button`); não há barrel `index.ts`.

## Alternativas descartadas

- **Manter `frontend/` + `backend/` + `shared/`** (ADR-0005): separa bem, mas o custo de manutenção dos pacotes internos não paga para um time de uma pessoa.
- **Contrato em `shared/contracts` como pacote**: reintroduz um workspace só para um arquivo; o ganho (isolamento de versão) não se aplica enquanto os dois lados vivem no mesmo repositório.
- **Renomear arquivos do Front para `PascalCase.tsx`** (convenção do ProAgendaV2): adiado — o Next e o resto do repositório usam `kebab-case`, e a convenção de pastas é o que traz o benefício de navegação.
