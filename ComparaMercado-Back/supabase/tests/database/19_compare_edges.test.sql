-- Bordas do comparador (QA B-06): quantidade somada, itens inválidos, preço antigo, produto
-- arquivado (QA-006) e estouro de `total_cents` (QA-007).
--
-- As asserções que dependem de correção ficam em `todo_start`/`todo_end`: documentam o esperado
-- sem derrubar a suíte. Ao corrigir, retire o bloco TODO e o teste passa a proteger a regressão.
-- Fixtures próprias; transação revertida.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-1900-4000-8000-000000000001', '9999901', 'Cidade Comparador', 'RS', true);
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-1900-4000-8000-0000000000a1', 'aaaaaaaa-1900-4000-8000-000000000001', 'Loja Ativa',
   extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active'),
  ('aaaaaaaa-1900-4000-8000-0000000000a2', 'aaaaaaaa-1900-4000-8000-000000000001', 'Loja Inativa',
   extensions.st_makepoint(-51.19, -29.18)::extensions.geography, 'active');
insert into public.products (id, canonical_name, size_value, size_unit, status) values
  ('bbbbbbbb-1900-4000-8000-0000000000b1', 'Produto Antigo', 1, 'kg', 'active'),
  ('bbbbbbbb-1900-4000-8000-0000000000b2', 'Produto Arquivado', 1, 'kg', 'active'),
  ('bbbbbbbb-1900-4000-8000-0000000000b3', 'Produto Muito Caro', 1, 'kg', 'active');
insert into public.price_observations
  (store_id, product_id, price_cents, unit_price_cents, source, status, observed_at) values
  -- preço de 40 dias atrás (a comparação só marca como antigo, não exclui)
  ('aaaaaaaa-1900-4000-8000-0000000000a1', 'bbbbbbbb-1900-4000-8000-0000000000b1', 1000, 1, 'manual', 'approved', now() - interval '40 days'),
  ('aaaaaaaa-1900-4000-8000-0000000000a1', 'bbbbbbbb-1900-4000-8000-0000000000b2', 500, 1, 'manual', 'approved', now()),
  -- teto do banco: R$ 100.000,00
  ('aaaaaaaa-1900-4000-8000-0000000000a1', 'bbbbbbbb-1900-4000-8000-0000000000b3', 10000000, 1, 'manual', 'approved', now()),
  -- mais barato, mas em loja que será inativada
  ('aaaaaaaa-1900-4000-8000-0000000000a2', 'bbbbbbbb-1900-4000-8000-0000000000b1', 1, 1, 'manual', 'approved', now());
update public.stores set status = 'inactive' where id = 'aaaaaaaa-1900-4000-8000-0000000000a2';
update public.products set status = 'archived' where id = 'bbbbbbbb-1900-4000-8000-0000000000b2';
refresh materialized view public.current_prices;

-- ── Quantidade ──────────────────────────────────────────────────────────────
select is(
  (public.compare_list('[
     {"product_id":"bbbbbbbb-1900-4000-8000-0000000000b1","quantity":99},
     {"product_id":"bbbbbbbb-1900-4000-8000-0000000000b1","quantity":99},
     {"product_id":"bbbbbbbb-1900-4000-8000-0000000000b1","quantity":99}]'::jsonb)
   -> 'best_single' ->> 'total_cents')::int,
  297000,
  'o mesmo produto repetido soma as quantidades, sem teto de 99 no SQL (297 × R$ 10,00)');
select is(
  public.compare_list('[{"product_id":"bbbbbbbb-1900-4000-8000-0000000000b1","quantity":0},
                        {"product_id":"bbbbbbbb-1900-4000-8000-0000000000b1","quantity":-3}]'::jsonb) -> 'stores',
  '[]'::jsonb, 'quantidade 0 ou negativa é ignorada (lista fica vazia)');
select throws_ok(
  $$select public.compare_list('[{"product_id":"bbbbbbbb-1900-4000-8000-0000000000b1","quantity":"muitos"}]'::jsonb)$$,
  '22P02', null, 'quantidade que não é número é recusada (a API barra antes pelo contrato)');

-- ── Entrada inválida ────────────────────────────────────────────────────────
select throws_ok($$select public.compare_list('{"a":1}'::jsonb)$$, '22023', null,
  'p_items que não é array é recusado');
select throws_ok(
  $$select public.compare_list((select jsonb_agg(jsonb_build_object(
      'product_id', 'bbbbbbbb-1900-4000-8000-0000000000b1', 'quantity', 1)) from generate_series(1, 101)))$$,
  '22023', 'lista excede 100 itens', 'mais de 100 itens é recusado');
select throws_ok(
  $$select public.compare_list('[]'::jsonb, 91, 0)$$, '22023', 'coordenadas inválidas',
  'latitude fora de −90..90 é recusada');
select throws_ok(
  $$select public.compare_list('[]'::jsonb, 0, 181)$$, '22023', 'coordenadas inválidas',
  'longitude fora de −180..180 é recusada');
select is(public.compare_list('[]'::jsonb) -> 'best_single', 'null'::jsonb,
  'lista vazia não tem melhor mercado');

-- ── Quem participa ──────────────────────────────────────────────────────────
select ok(not (public.compare_list(
    '[{"product_id":"bbbbbbbb-1900-4000-8000-0000000000b1","quantity":1}]'::jsonb) -> 'stores'
  @> '[{"store_id":"aaaaaaaa-1900-4000-8000-0000000000a2"}]'::jsonb),
  'loja inativa não entra, mesmo com o preço mais barato');
select is(
  (public.compare_list('[{"product_id":"bbbbbbbb-1900-4000-8000-0000000000b1","quantity":1}]'::jsonb)
   -> 'best_single' ->> 'total_cents')::int, 1000,
  'preço de 40 dias ainda entra na comparação (decisão atual: só é marcado como antigo)');

-- ── Produto arquivado (QA-006) ──────────────────────────────────────────────
select todo_start('QA-006: produto arquivado ainda é comparado');
select is(
  (public.compare_list('[{"product_id":"bbbbbbbb-1900-4000-8000-0000000000b2","quantity":1}]'::jsonb)
   -> 'best_single' ->> 'total_cents'),
  null,
  'produto arquivado não entra na comparação (o diálogo do admin promete isso)');
select todo_end();

-- ── Estouro de total_cents (QA-007) ─────────────────────────────────────────
select todo_start('QA-007: total_cents é cast para integer e estoura (22003)');
select lives_ok(
  $$select public.compare_list('[
      {"product_id":"bbbbbbbb-1900-4000-8000-0000000000b3","quantity":99},
      {"product_id":"bbbbbbbb-1900-4000-8000-0000000000b3","quantity":99},
      {"product_id":"bbbbbbbb-1900-4000-8000-0000000000b3","quantity":99}]'::jsonb)$$,
  'um total acima de 2.147.483.647 centavos é devolvido sem estourar');
select todo_end();
select throws_ok(
  $$select public.compare_list('[
      {"product_id":"bbbbbbbb-1900-4000-8000-0000000000b3","quantity":99},
      {"product_id":"bbbbbbbb-1900-4000-8000-0000000000b3","quantity":99},
      {"product_id":"bbbbbbbb-1900-4000-8000-0000000000b3","quantity":99}]'::jsonb)$$,
  '22003', null, 'estado atual: o estouro vira erro 22003 (a API responde falha, não um total errado)');

select * from finish();
rollback;
