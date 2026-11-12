-- Revisão: decidir uma observação resolve a tarefa e deixa rastro (aprovação e rejeição).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-0000-4000-8000-0000000000f0', '9999992', 'Cidade Revisão', 'RS', true);
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-0000000000f0', 'Loja Revisão',
    extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active');
insert into public.products (id, canonical_name, size_value, size_unit, status) values
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'Produto Revisão', 1, 'kg', 'active');
insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev-admin@test.local');
update public.profiles set role = 'admin' where id = 'cccccccc-0000-4000-8000-0000000000f1';

insert into public.price_observations (id, store_id, product_id, price_cents, unit_price_cents, source, status) values
  ('dddddddd-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-0000000000f1', 500, 500, 'flyer', 'pending'),
  ('dddddddd-0000-4000-8000-0000000000f2', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-0000000000f1', 600, 600, 'flyer', 'pending'),
  ('dddddddd-0000-4000-8000-0000000000f3', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-0000000000f1', 700, 700, 'flyer', 'pending');
insert into public.review_tasks (target_type, target_id, reason) values
  ('price_observation', 'dddddddd-0000-4000-8000-0000000000f1', 'teste'),
  ('price_observation', 'dddddddd-0000-4000-8000-0000000000f2', 'teste'),
  ('price_observation', 'dddddddd-0000-4000-8000-0000000000f3', 'teste');

-- ── Admin decide ────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-4000-8000-0000000000f1","role":"authenticated"}', true);

update public.price_observations set status = 'approved' where id = 'dddddddd-0000-4000-8000-0000000000f1';
update public.price_observations set status = 'rejected' where id = 'dddddddd-0000-4000-8000-0000000000f2';
reset role;

select is((select status::text from public.review_tasks where target_id = 'dddddddd-0000-4000-8000-0000000000f1'),
  'resolved', 'aprovar resolve a tarefa');
select is((select status::text from public.review_tasks where target_id = 'dddddddd-0000-4000-8000-0000000000f2'),
  'resolved', 'rejeitar também resolve a tarefa');
select is((select status::text from public.review_tasks where target_id = 'dddddddd-0000-4000-8000-0000000000f3'),
  'open', 'tarefa de observação ainda pendente continua aberta');
select is((select resolved_by from public.review_tasks where target_id = 'dddddddd-0000-4000-8000-0000000000f2'),
  'cccccccc-0000-4000-8000-0000000000f1'::uuid, 'a tarefa registra quem resolveu');
select ok((select resolved_at is not null from public.review_tasks where target_id = 'dddddddd-0000-4000-8000-0000000000f2'),
  'a tarefa registra quando foi resolvida');

select is((select reviewed_by from public.price_observations where id = 'dddddddd-0000-4000-8000-0000000000f2'),
  'cccccccc-0000-4000-8000-0000000000f1'::uuid, 'rejeição registra o revisor (antes não deixava rastro)');
select ok((select reviewed_at is not null from public.price_observations where id = 'dddddddd-0000-4000-8000-0000000000f1'),
  'aprovação registra reviewed_at');
select is((select reviewed_by from public.price_observations where id = 'dddddddd-0000-4000-8000-0000000000f3'),
  null, 'observação pendente não tem revisor');

-- ── Decisão por outra porta (service_role/worker, sem auth.uid) também resolve ──
update public.price_observations set status = 'rejected' where id = 'dddddddd-0000-4000-8000-0000000000f3';
select is((select status::text from public.review_tasks where target_id = 'dddddddd-0000-4000-8000-0000000000f3'),
  'resolved', 'decisão sem usuário (worker/SQL) também fecha a tarefa');

-- ── Imutabilidade continua valendo ──────────────────────────────────────────
select throws_ok(
  $$update public.price_observations set price_cents = 1 where id = 'dddddddd-0000-4000-8000-0000000000f1'$$,
  '42501', null, 'preço continua imutável');
select throws_ok(
  $$delete from public.price_observations where id = 'dddddddd-0000-4000-8000-0000000000f1'$$,
  '42501', null, 'observação continua somente inclusão');

select * from finish();
rollback;
