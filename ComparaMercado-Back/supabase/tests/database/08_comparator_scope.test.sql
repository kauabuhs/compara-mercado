-- O comparador só considera lojas de cidades ATIVAS (cities.active), mesmo havendo lojas de
-- outros países/mercados cadastradas e ativas.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.cities (id, ibge_code, name, uf, active) values
  ('aaaaaaaa-8000-4000-8000-000000000001', '9999998', 'Cidade Ativa', 'RS', true),
  ('aaaaaaaa-8000-4000-8000-000000000002', '9999999', 'Cidade Inativa', 'RS', false);
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-8000-4000-8000-0000000000a1', 'aaaaaaaa-8000-4000-8000-000000000001', 'Loja em cidade ativa',
    extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active'),
  ('aaaaaaaa-8000-4000-8000-0000000000a2', 'aaaaaaaa-8000-4000-8000-000000000002', 'Loja em cidade inativa',
    extensions.st_makepoint(-51.19, -29.18)::extensions.geography, 'active');
insert into public.products (id, canonical_name, size_value, size_unit)
values ('bbbbbbbb-8000-4000-8000-0000000000b1', 'Produto Escopo', 1, 'kg');
insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status) values
  ('aaaaaaaa-8000-4000-8000-0000000000a1', 'bbbbbbbb-8000-4000-8000-0000000000b1', 500, 1, 'manual', 'approved'),
  ('aaaaaaaa-8000-4000-8000-0000000000a2', 'bbbbbbbb-8000-4000-8000-0000000000b1', 100, 1, 'manual', 'approved');
refresh materialized view public.current_prices;

create temp table r on commit drop as
select public.compare_list('[{"product_id":"bbbbbbbb-8000-4000-8000-0000000000b1","quantity":1}]'::jsonb) as j;

select ok((select j -> 'stores' @> '[{"store_id":"aaaaaaaa-8000-4000-8000-0000000000a1"}]'::jsonb from r),
  'loja de cidade ativa participa da comparação');
select ok(not (select j -> 'stores' @> '[{"store_id":"aaaaaaaa-8000-4000-8000-0000000000a2"}]'::jsonb from r),
  'loja de cidade inativa não participa, mesmo ativa e mais barata');
select is((select j -> 'best_single' ->> 'store_id' from r), 'aaaaaaaa-8000-4000-8000-0000000000a1',
  'o melhor mercado nunca vem de cidade desabilitada');

set local role anon;
select is((select count(*)::int from public.cities where id = 'aaaaaaaa-8000-4000-8000-000000000002'), 0,
  'público não vê a cidade inativa (RLS)');
reset role;

select * from finish();
rollback;
