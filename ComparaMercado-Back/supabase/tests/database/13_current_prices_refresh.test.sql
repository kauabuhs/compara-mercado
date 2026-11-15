-- Preço aprovado chega a `current_prices` na mesma transação, sem worker nem refresh manual.
-- Fixtures próprias; transação revertida.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-1300-4000-8000-000000000001', '9999913', 'Cidade Refresh', 'RS', true);
insert into public.stores (id, city_id, name, neighborhood, location, status) values
  ('aaaaaaaa-1300-4000-8000-0000000000a1', 'aaaaaaaa-1300-4000-8000-000000000001', 'Loja Refresh', 'Centro',
    extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active');
insert into public.products (id, canonical_name, size_value, size_unit, status) values
  ('bbbbbbbb-1300-4000-8000-0000000000b1', 'Produto Refresh Comunidade', 1, 'kg', 'active'),
  ('bbbbbbbb-1300-4000-8000-0000000000b2', 'Produto Refresh Admin', 1, 'kg', 'active'),
  ('bbbbbbbb-1300-4000-8000-0000000000b3', 'Produto Refresh Insercao', 1, 'kg', 'active');
insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-1300-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-autor@test.local'),
  ('cccccccc-1300-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-solido1@test.local'),
  ('cccccccc-1300-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-solido2@test.local'),
  ('cccccccc-1300-4000-8000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-confiavel@test.local');
update public.profiles set reputation = 60  where id in
  ('cccccccc-1300-4000-8000-0000000000c2', 'cccccccc-1300-4000-8000-0000000000c3');  -- Colaborador
update public.profiles set reputation = 250 where id = 'cccccccc-1300-4000-8000-0000000000c4';  -- Confiável

-- B1: publicação da comunidade, pendente. B2: pendente que o admin vai aprovar.
insert into public.price_observations
  (id, store_id, product_id, price_cents, unit_price_cents, source, status, created_by) values
  ('dddddddd-1300-4000-8000-0000000000d1', 'aaaaaaaa-1300-4000-8000-0000000000a1',
   'bbbbbbbb-1300-4000-8000-0000000000b1', 700, 1, 'label_photo', 'pending',
   'cccccccc-1300-4000-8000-0000000000c1'),
  ('dddddddd-1300-4000-8000-0000000000d2', 'aaaaaaaa-1300-4000-8000-0000000000a1',
   'bbbbbbbb-1300-4000-8000-0000000000b2', 800, 1, 'label_photo', 'pending',
   'cccccccc-1300-4000-8000-0000000000c1');

select is((select count(*)::int from public.current_prices
           where product_id = 'bbbbbbbb-1300-4000-8000-0000000000b1'), 0,
  'preço pendente não está em current_prices');

-- 1) Corroboração: duas pessoas de reputação ≥ 50 confirmam e o preço vira aprovado.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1300-4000-8000-0000000000c2","role":"authenticated"}', true);
select lives_ok($$select * from public.confirm_observation('dddddddd-1300-4000-8000-0000000000d1', 'confirm')$$,
  'primeira confirmação');
select is((select count(*)::int from public.current_prices
           where product_id = 'bbbbbbbb-1300-4000-8000-0000000000b1'), 0,
  'com uma confirmação o preço ainda não aparece');
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1300-4000-8000-0000000000c3","role":"authenticated"}', true);
select lives_ok($$select * from public.confirm_observation('dddddddd-1300-4000-8000-0000000000d1', 'confirm')$$,
  'segunda confirmação');
reset role;
select is((select price_cents from public.current_prices
           where product_id = 'bbbbbbbb-1300-4000-8000-0000000000b1'
             and store_id = 'aaaaaaaa-1300-4000-8000-0000000000a1'), 700,
  'aprovado por corroboração aparece em current_prices sem refresh manual');

-- 2) Decisão do admin: pendente → aprovado atualiza a visão.
update public.price_observations set status = 'approved'
 where id = 'dddddddd-1300-4000-8000-0000000000d2';
select is((select price_cents from public.current_prices
           where product_id = 'bbbbbbbb-1300-4000-8000-0000000000b2'), 800,
  'aprovação direta (admin) aparece em current_prices');

-- 3) Autor de confiança: a aprovação roda dentro do gatilho de INSERT e também atualiza a visão.
insert into public.price_observations
  (store_id, product_id, price_cents, unit_price_cents, source, status, created_by)
values ('aaaaaaaa-1300-4000-8000-0000000000a1', 'bbbbbbbb-1300-4000-8000-0000000000b3', 900, 1,
        'label_photo', 'pending', 'cccccccc-1300-4000-8000-0000000000c4');
select is((select price_cents from public.current_prices
           where product_id = 'bbbbbbbb-1300-4000-8000-0000000000b3'), 900,
  'preço de autor de confiança (aprovado no INSERT) aparece em current_prices');

select * from finish();
rollback;
