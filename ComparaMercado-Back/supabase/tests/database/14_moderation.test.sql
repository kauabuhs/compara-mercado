-- Moderação (Fase 3): retirar preço aprovado, fechar tarefas de revisão e motivo da rejeição.
-- Fixtures próprias; transação revertida.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-1400-4000-8000-000000000001', '9999914', 'Cidade Moderacao', 'RS', true);
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-1400-4000-8000-0000000000a1', 'aaaaaaaa-1400-4000-8000-000000000001', 'Loja Moderacao',
   extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active');
insert into public.products (id, canonical_name, size_value, size_unit, status) values
  ('bbbbbbbb-1400-4000-8000-0000000000b1', 'Produto Moderacao A', 1, 'kg', 'active'),
  ('bbbbbbbb-1400-4000-8000-0000000000b2', 'Produto Moderacao B', 1, 'kg', 'active');
insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-1400-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mod-autor@test.local'),
  ('cccccccc-1400-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mod-admin@test.local'),
  ('cccccccc-1400-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mod-comum@test.local');
update public.profiles set role = 'admin' where id = 'cccccccc-1400-4000-8000-0000000000c2';
-- a reputação tem piso em zero: o autor começa com pontos para a perda aparecer
update public.profiles set reputation = 100 where id = 'cccccccc-1400-4000-8000-0000000000c1';

-- O1: aprovada pela comunidade e denunciada (a tarefa de revisão fica aberta); O2: aprovada sem tarefa.
insert into public.price_observations
  (id, store_id, product_id, price_cents, unit_price_cents, source, status, approved_via, created_by) values
  ('dddddddd-1400-4000-8000-0000000000d1', 'aaaaaaaa-1400-4000-8000-0000000000a1',
   'bbbbbbbb-1400-4000-8000-0000000000b1', 700, 1, 'label_photo', 'approved', 'community',
   'cccccccc-1400-4000-8000-0000000000c1'),
  ('dddddddd-1400-4000-8000-0000000000d2', 'aaaaaaaa-1400-4000-8000-0000000000a1',
   'bbbbbbbb-1400-4000-8000-0000000000b2', 800, 1, 'label_photo', 'approved', 'community',
   'cccccccc-1400-4000-8000-0000000000c1');
insert into public.review_tasks (target_type, target_id, reason, payload)
values ('price_observation', 'dddddddd-1400-4000-8000-0000000000d1', 'Denunciada pela comunidade',
        '{"reports": 3}');
refresh materialized view public.current_prices;

select is((select count(*)::int from public.current_prices
           where product_id in ('bbbbbbbb-1400-4000-8000-0000000000b1', 'bbbbbbbb-1400-4000-8000-0000000000b2')),
  2, 'os dois preços aprovados estão em current_prices');

-- ── Quem não é admin não retira preço (a RLS filtra: 0 linhas, sem erro) ─────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1400-4000-8000-0000000000c3","role":"authenticated"}', true);
select lives_ok(
  $$update public.price_observations set status = 'rejected' where id = 'dddddddd-1400-4000-8000-0000000000d1'$$,
  'usuário comum tenta retirar o preço');
-- nem o autor
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1400-4000-8000-0000000000c1","role":"authenticated"}', true);
select lives_ok(
  $$update public.price_observations set status = 'rejected' where id = 'dddddddd-1400-4000-8000-0000000000d1'$$,
  'o autor tenta retirar o próprio preço aprovado');
reset role;
select is((select status::text from public.price_observations where id = 'dddddddd-1400-4000-8000-0000000000d1'),
  'approved', 'nenhum dos dois conseguiu: o preço continua aprovado (RLS)');

-- ── Admin retira o preço aprovado, com motivo ───────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1400-4000-8000-0000000000c2","role":"authenticated"}', true);
select lives_ok(
  $$update public.price_observations
       set status = 'rejected', review_note = 'O preço não confere com a foto'
     where id = 'dddddddd-1400-4000-8000-0000000000d1'$$,
  'admin retira um preço já aprovado');
reset role;

select is((select count(*)::int from public.current_prices
           where product_id = 'bbbbbbbb-1400-4000-8000-0000000000b1'), 0,
  'o preço retirado sai de current_prices na mesma transação (sem worker)');
select is((select count(*)::int from public.current_prices
           where product_id = 'bbbbbbbb-1400-4000-8000-0000000000b2'), 1,
  'os outros preços continuam publicados');
select is((select reviewed_by from public.price_observations where id = 'dddddddd-1400-4000-8000-0000000000d1'),
  'cccccccc-1400-4000-8000-0000000000c2'::uuid,
  'a retirada registra quem decidiu, mesmo com aprovação da comunidade');
select ok((select reviewed_at is not null from public.price_observations where id = 'dddddddd-1400-4000-8000-0000000000d1'),
  'e quando');
select is((select review_note from public.price_observations where id = 'dddddddd-1400-4000-8000-0000000000d1'),
  'O preço não confere com a foto', 'o motivo fica guardado');
select is((select status::text from public.review_tasks
           where target_id = 'dddddddd-1400-4000-8000-0000000000d1'), 'resolved',
  'a tarefa de revisão do preço aprovado é fechada pela decisão');
select is((select reputation from public.profiles where id = 'cccccccc-1400-4000-8000-0000000000c1'), 80,
  'o autor perde 20 pontos (100 → 80) pelo preço retirado');

-- ── O motivo tem tamanho válido ─────────────────────────────────────────────
select throws_ok(
  $$update public.price_observations set review_note = 'ab' where id = 'dddddddd-1400-4000-8000-0000000000d2'$$,
  '23514', null, 'motivo curto demais é recusado');
select throws_ok(
  format($$update public.price_observations set review_note = %L where id = 'dddddddd-1400-4000-8000-0000000000d2'$$,
         repeat('x', 201)),
  '23514', null, 'motivo longo demais é recusado');

select * from finish();
rollback;
