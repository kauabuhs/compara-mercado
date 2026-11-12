-- 0017 · Remove três índices criados sem consulta que os justifique
--
-- Regra do projeto: índice só entra com um padrão de consulta/escrita que o exija (ADR-0006,
-- docs/database/modelo-de-dados.md). Revisão dos índices das migrações 0013/0012:
--
--  inventory_below_min_idx  — o predicado usa `on_hand`, a coluna mais atualizada do sistema
--      (toda venda/entrada). Indexar o predicado de uma coluna que muda a cada operação impede
--      atualizações HOT na tabela mais quente e infla o índice, para atender um relatório de
--      reposição que roda raramente e varre poucas linhas por depósito. Volta quando houver
--      medição que o peça.
--  promotions_expiry_idx    — o job de expiração roda a cada 5 min sobre um conjunto pequeno de
--      promoções ativas/pausadas; `promotions_active_idx` já cobre o caso quente.
--  inventory_movements_transfer_idx — nenhuma consulta usa o transfer_id hoje; o razão é a
--      maior tabela de escrita do domínio e cada índice a encarece.
--
-- Nenhum dado é afetado. Recriar é um `create index` (use CONCURRENTLY em produção).

drop index if exists public.inventory_below_min_idx;
drop index if exists public.promotions_expiry_idx;
drop index if exists public.inventory_movements_transfer_idx;
