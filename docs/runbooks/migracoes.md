# Runbook — migrações do banco

**Regra de ouro:** nada de alteração manual em produção. Tudo é migração versionada, revisada e aplicada pelo CI (`deploy.yml`).

## Criar uma migração

1. `pnpm exec supabase migration new descricao_curta --workdir backend` e edite o arquivo gerado.
2. Tabela nova → RLS + políticas + `GRANT` mínimo + teste pgTAP (veja `CONTRIBUTING.md`).
3. `pnpm db:reset && pnpm db:test && pnpm db:types`.
4. PR com plano de rollback se for destrutiva (drop/rename/alteração de tipo).

## Migração perigosa (tabela grande)

- Adicionar coluna: com `default` constante é barato; sem reescrever a tabela.
- Índice: `create index concurrently` (fora de transação — um arquivo só para ele).
- Renomear/remover coluna: duas etapas em deploys diferentes (compatível → remove).

## Rollback

O Supabase CLI não desfaz migrações. Escreva uma migração nova que reverta o efeito. Em desastre: restaurar backup (produção terá PITR no plano pago) e **testar a restauração** periodicamente.

## Antes da primeira produção

- [ ] Backups diários ligados e restauração testada em staging
- [ ] Projeto de produção com chaves e `site_url`/redirects de Auth próprios
- [ ] `supabase db push --workdir backend --dry-run` revisado
