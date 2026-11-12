-- 0016 · Índice da listagem paginada do catálogo
--
-- Evidência (200 mil produtos, sintético, plano medido com EXPLAIN ANALYZE):
--   sem índice: Seq Scan + top-N sort de ~100 mil linhas  → 48,5 ms por página
--   com índice: Index Only Scan, 25 linhas lidas          →  0,44 ms por página
-- Casa exatamente com `ORDER BY canonical_name, id` + `WHERE status = 'active'` + comparação de
-- linha `(canonical_name, id) > (cursor)` usada por listProductsPage (paginação por cursor).
--
-- Em um catálogo grande já em produção, crie com `CREATE INDEX CONCURRENTLY` em arquivo próprio
-- (runbook de migrações). Aqui a tabela ainda é pequena, então o CREATE simples é seguro.

create index if not exists products_listing_idx
  on public.products (canonical_name, id)
  where status = 'active';
