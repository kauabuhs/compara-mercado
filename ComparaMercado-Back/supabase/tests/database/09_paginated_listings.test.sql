-- Listagens paginadas: ofertas (list_offers_page) e busca (search_products_page).
-- O seed também tem promoções: as asserções de ordem/filtro ficam restritas aos mercados do teste.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.cities (id, ibge_code, name, uf, active) values
  ('aaaaaaaa-9000-4000-8000-000000000001', '9999990', 'Cidade Paginação', 'RS', true);
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-9000-4000-8000-0000000000a1', 'aaaaaaaa-9000-4000-8000-000000000001', 'Mercado Alfa',
    extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active'),
  ('aaaaaaaa-9000-4000-8000-0000000000a2', 'aaaaaaaa-9000-4000-8000-000000000001', 'Mercado Beta',
    extensions.st_makepoint(-51.19, -29.18)::extensions.geography, 'active');
insert into public.products (id, canonical_name, brand, size_value, size_unit, status) values
  ('bbbbbbbb-9000-4000-8000-0000000000b1', 'Café torrado', 'Marca X', 500, 'g', 'active'),
  ('bbbbbbbb-9000-4000-8000-0000000000b2', 'Açúcar refinado', null, 1, 'kg', 'active'),
  ('bbbbbbbb-9000-4000-8000-0000000000b3', 'Biscoitozinho recheado', null, 140, 'g', 'active'),
  ('bbbbbbbb-9000-4000-8000-0000000000b4', 'Biscoitozinho sem preço', null, 100, 'g', 'active');

-- 5 ofertas (3 no Alfa, 2 no Beta) + 1 preço normal (sem promoção), que nunca é "oferta".
insert into public.price_observations
  (store_id, product_id, price_cents, unit_price_cents, promo, valid_to, source, status) values
  ('aaaaaaaa-9000-4000-8000-0000000000a1', 'bbbbbbbb-9000-4000-8000-0000000000b1', 1500, 3000, true,  now() + interval '2 days',  'manual', 'approved'),
  ('aaaaaaaa-9000-4000-8000-0000000000a1', 'bbbbbbbb-9000-4000-8000-0000000000b2',  500,  500, true,  now() + interval '10 days', 'manual', 'approved'),
  ('aaaaaaaa-9000-4000-8000-0000000000a1', 'bbbbbbbb-9000-4000-8000-0000000000b3',  300, 2143, true,  now() + interval '5 days',  'manual', 'approved'),
  ('aaaaaaaa-9000-4000-8000-0000000000a2', 'bbbbbbbb-9000-4000-8000-0000000000b1', 1400, 2800, true,  now() + interval '1 day',   'manual', 'approved'),
  ('aaaaaaaa-9000-4000-8000-0000000000a2', 'bbbbbbbb-9000-4000-8000-0000000000b2',  450,  450, true,  now() + interval '20 days', 'manual', 'approved'),
  ('aaaaaaaa-9000-4000-8000-0000000000a2', 'bbbbbbbb-9000-4000-8000-0000000000b3',  350, 2500, false, null,                        'manual', 'approved');
refresh materialized view public.current_prices;

set local role anon;

-- Ofertas: total, página, ordenação e filtros
select is((select max(total_count)::int from public.list_offers_page('aaaaaaaa-9000-4000-8000-0000000000a1')), 3,
  'total_count conta só as ofertas do mercado');
select is((select count(*)::int from public.list_offers_page(null, null, false, 'featured', 2, 0)), 2,
  'p_limit limita a página');
select is((select count(*)::int from (
    select product_id, store_id from public.list_offers_page(null, null, false, 'price', 2, 0)
    intersect
    select product_id, store_id from public.list_offers_page(null, null, false, 'price', 2, 2)
  ) overlap), 0, 'páginas consecutivas não repetem itens');
select is((select unit_price_cents from public.list_offers_page('aaaaaaaa-9000-4000-8000-0000000000a2', null, false, 'price', 1, 0)), 450,
  'ordenar por preço traz o menor preço por unidade primeiro');
select is((select product_id from public.list_offers_page('aaaaaaaa-9000-4000-8000-0000000000a2', null, false, 'validity', 1, 0)),
  'bbbbbbbb-9000-4000-8000-0000000000b1'::uuid,
  'ordenar por validade traz a que vence primeiro (Beta, 1 dia)');
select is((select count(*)::int from public.list_offers_page('aaaaaaaa-9000-4000-8000-0000000000a1', null, true, 'featured', 50, 0)), 1,
  '"vence em breve" só traz as que vencem em até 3 dias');
select is((select count(*)::int from public.list_offers_page('aaaaaaaa-9000-4000-8000-0000000000a2', 'acucar', false, 'featured', 50, 0)), 1,
  'busca de ofertas ignora acento');
select is((select count(*)::int from public.list_offers_page(null, 'mercado alfa', false, 'featured', 50, 0)
  where store_id = 'aaaaaaaa-9000-4000-8000-0000000000a1'), 3,
  'busca de ofertas também casa o nome do mercado');
select is((select count(*)::int from public.list_offers_page(null, null, false, 'featured', 10, 1000000)), 0,
  'página além do fim volta vazia');

-- Busca de produtos
select is((select max(total_count)::int from public.search_products_page('biscoitozinho', 1, 0)), 2,
  'busca paginada informa o total, mesmo com limite menor');
select is((select count(*)::int from public.search_products_page('biscoitozinho', 1, 1)), 1,
  'segunda página da busca devolve o item restante');
select is((select count(*)::int from public.search_products_page('biscoitozinho', 10, 0, true)), 1,
  '"com preço" esconde produto sem preço vigente');

reset role;
select ok(not has_function_privilege('public', 'public.list_offers_page(uuid,text,boolean,text,integer,integer)', 'execute'),
  'list_offers_page não é executável por PUBLIC (só anon/authenticated)');

select * from finish();
rollback;
