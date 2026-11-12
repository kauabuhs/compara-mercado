-- Teste da função compare_list: totais por mercado, melhor mercado único e melhor divisão.
-- Mesma situação do teste unitário de packages/domain (paridade SQL ↔ TypeScript).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-1000-4000-8000-000000000001', '9999992', 'Cidade Teste 2', 'RS', true);

-- A: perto (≈0 m do ponto de consulta). B: mais longe.
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-1000-4000-8000-0000000000a1', 'aaaaaaaa-1000-4000-8000-000000000001', 'Mercado A',
    extensions.st_makepoint(-51.1800, -29.1700)::extensions.geography, 'active'),
  ('aaaaaaaa-1000-4000-8000-0000000000a2', 'aaaaaaaa-1000-4000-8000-000000000001', 'Mercado B',
    extensions.st_makepoint(-51.1600, -29.1700)::extensions.geography, 'active');

insert into public.products (id, canonical_name, size_value, size_unit) values
  ('bbbbbbbb-1000-4000-8000-0000000000b1', 'Arroz Teste', 5, 'kg'),
  ('bbbbbbbb-1000-4000-8000-0000000000b2', 'Feijão Teste', 1, 'kg'),
  ('bbbbbbbb-1000-4000-8000-0000000000b3', 'Item Sem Preço', 1, 'kg');

-- A: arroz 2500, feijão 900 → lista (arroz×1, feijão×2) = 4300
-- B: arroz 2300, feijão 1100 → 4500 ; melhor divisão: arroz em B + feijão em A = 4100 (economiza 200)
insert into public.price_observations
  (store_id, product_id, price_cents, unit_price_cents, source, status, valid_to) values
  ('aaaaaaaa-1000-4000-8000-0000000000a1', 'bbbbbbbb-1000-4000-8000-0000000000b1', 2500, 1, 'manual', 'approved', null),
  ('aaaaaaaa-1000-4000-8000-0000000000a1', 'bbbbbbbb-1000-4000-8000-0000000000b2',  900, 1, 'manual', 'approved', null),
  ('aaaaaaaa-1000-4000-8000-0000000000a2', 'bbbbbbbb-1000-4000-8000-0000000000b1', 2300, 1, 'manual', 'approved', null),
  ('aaaaaaaa-1000-4000-8000-0000000000a2', 'bbbbbbbb-1000-4000-8000-0000000000b2', 1100, 1, 'manual', 'approved', null),
  -- promoção vencida (mais barata) não pode valer
  ('aaaaaaaa-1000-4000-8000-0000000000a2', 'bbbbbbbb-1000-4000-8000-0000000000b2',  100, 1, 'manual', 'approved',
    now() - interval '1 day');
refresh materialized view public.current_prices;

create temp table result as
select public.compare_list(
  '[{"product_id":"bbbbbbbb-1000-4000-8000-0000000000b1","quantity":1},
    {"product_id":"bbbbbbbb-1000-4000-8000-0000000000b2","quantity":2}]'::jsonb,
  -29.1700, -51.1800) as r;

select is((select r -> 'best_single' ->> 'store_id' from result), 'aaaaaaaa-1000-4000-8000-0000000000a1',
  'melhor mercado único é o A');
select is((select (r -> 'best_single' ->> 'total_cents')::int from result), 4300, 'total do A = 4300');
select is((select (r -> 'best_single' ->> 'complete')::boolean from result), true, 'A cobre toda a lista');
select is(
  (select (e ->> 'total_cents')::int from result, jsonb_array_elements(r -> 'stores') e
   where e ->> 'store_id' = 'aaaaaaaa-1000-4000-8000-0000000000a2'),
  4500, 'total do B = 4500 (promoção vencida ignorada)');
select is((select (r -> 'best_split' ->> 'total_cents')::int from result), 4100, 'melhor divisão custa 4100');
select is((select (r -> 'best_split' ->> 'savings_cents')::int from result), 200, 'economiza 200 vs melhor único');
select ok((select (r -> 'best_split' ->> 'extra_distance_meters')::int from result) > 1000,
  'distância extra é calculada a partir da localização informada');

select is(
  (select jsonb_array_length(public.compare_list('[]'::jsonb) -> 'stores') >= 0),
  true, 'lista vazia não quebra');
select throws_ok($$select public.compare_list('{"a":1}'::jsonb)$$, '22023', null,
  'entrada que não é array é rejeitada');

select * from finish();
rollback;
