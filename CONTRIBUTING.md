# Contribuindo

Mesmo trabalhando sozinho, o fluxo é o mesmo de um time: o CI faz o papel de revisor.

## Git

- **Trunk-based.** `main` protegida; branches curtas: `feat/…`, `fix/…`, `chore/…`.
- **Pull request obrigatório**, merge por _squash_. Use o template de PR.
- **Conventional Commits**, verificados por commitlint (hook `commit-msg`):
  `feat(web): lista com total por mercado`. Escopos: `web, worker, domain, ingest, ai, db, ui, config, supabase, docs, ci, deps, repo`.
- Release por tag `vX.Y.Z` (produção, com aprovação manual). Staging deploya a cada merge na `main`.

### Configuração recomendada do repositório no GitHub

Settings → Branches → regra para `main`: exigir PR, exigir os checks **quality**, **database**, **e2e**, **secrets**, **dependencies**, **sast**, exigir branch atualizada, bloquear force-push. Habilitar _secret scanning_ e _push protection_. Environments `staging` e `production` (este com _Required reviewers_).

## Padrões de código

- TypeScript estrito, **sem `any`** (Biome barra). Sem `!` (non-null assertion).
- Regras de negócio em `backend/packages/domain`: puras, sem banco/rede, com testes.
- Zod em toda entrada externa: formulários, rotas da API (`shared/contracts`), RPCs, saída da IA. Mudou o formato de uma resposta ou requisição? Atualize `shared/contracts` e `CONTRACT_VERSION`.
- Dinheiro em **centavos inteiros**; datas em UTC (`timestamptz`); texto de UI em pt-BR.
- Erros tipados; logs estruturados (pino) com `correlationId`; **nunca** logar dado pessoal, chave ou arquivo bruto.
- UI: a partir de 360 px, alvos ≥ 44 px, estados vazio/erro/carregamento, WCAG AA, claro e escuro.

## Banco de dados

1. Crie migração em `backend/supabase/migrations/<timestamp>_descricao.sql` (nunca edite migração já aplicada em staging/produção).
2. **Toda tabela nova: `enable row level security` + políticas explícitas + `grant` mínimo + teste pgTAP.**
3. `pnpm db:reset && pnpm db:test && pnpm db:types`.
4. Migração destrutiva ou lenta? Descreva o plano de rollback no PR. Nada de alteração manual em produção.

## Definition of done

- [ ] Testes novos ou ajustados passando no CI
- [ ] Migração revisada e, se necessário, reversível ou com plano de rollback
- [ ] Nenhum segredo ou dado pessoal no código ou nos logs
- [ ] Documentação e ADR atualizados
- [ ] Mudança arriscada atrás de feature flag

## Dependências

`pnpm-workspace.yaml` só instala versões publicadas há ≥ 7 dias, bloqueia dependências transitivas "exóticas" (git/tarball) e impede rebaixar garantias de publicação. Scripts de instalação ficam desligados por padrão: aprove explicitamente com `pnpm approve-builds` só o necessário. Ver [ADR-0002](docs/adr/0002-supply-chain.md).
