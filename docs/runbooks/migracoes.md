# Runbook — migrações do banco

**Regra de ouro:** nada de alteração manual em produção. Tudo é migração versionada, revisada e aplicada pelo CI (`deploy.yml`).

## Criar uma migração

1. `pnpm exec supabase migration new descricao_curta --workdir ComparaMercado-Back` e edite o arquivo gerado.
2. Tabela nova → RLS + políticas + `GRANT` mínimo + teste pgTAP (veja `CONTRIBUTING.md`).
3. `pnpm db:reset && pnpm db:test && pnpm db:types`.
4. PR com plano de rollback se for destrutiva (drop/rename/alteração de tipo).

## Validar do zero sem perder dados locais

`pnpm db:reset` apaga os dados de desenvolvimento. Para provar que as migrações recriam o schema sem tocar na base local, aplique-as em um banco descartável dentro do mesmo container (`create database cleanroom`, stubs mínimos de `auth`/`storage`, migrações em ordem, seeds) e rode os testes pgTAP ali. Para atualizar a base local sem apagá-la: `pnpm exec supabase migration up --workdir ComparaMercado-Back` (só aplica as pendentes). Antes, faça `pg_dump -Fc` do container `supabase_db_compara-mercado`.

## Migração perigosa (tabela grande)

- Adicionar coluna: com `default` constante é barato; sem reescrever a tabela.
- Índice: `create index concurrently` (fora de transação — um arquivo só para ele). A `0016` usa `create index` simples porque a tabela ainda é pequena; em catálogo grande, use `concurrently`.
- Backfill em tabela grande (como a `0010`, que cria famílias): faça em lotes fora da migração, ou em janela de baixa carga.
- Renomear/remover coluna: duas etapas em deploys diferentes (compatível → remove).

## Rollback

O Supabase CLI não desfaz migrações. Escreva uma migração nova que reverta o efeito. Em desastre: restaurar backup (produção terá PITR no plano pago) e **testar a restauração** periodicamente.

## Antes da primeira produção

- [ ] Backups diários ligados e restauração testada em staging
- [ ] Projeto de produção com chaves e `site_url`/redirects de Auth próprios
- [ ] `supabase db push --workdir ComparaMercado-Back --dry-run` revisado
