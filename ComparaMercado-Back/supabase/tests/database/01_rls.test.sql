-- Testes de segurança do banco: RLS, privilégios, imutabilidade e antiabuso.
-- Tudo roda numa transação revertida ao final; fixtures próprias (não dependem do seed).
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ── Fixtures (como postgres, ignora RLS) ────────────────────────────────────
insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-0000-4000-8000-000000000001', '9999991', 'Cidade Teste', 'RS', true);

insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Loja Ativa',
    extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active'),
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-000000000001', 'Loja Inativa',
    extensions.st_makepoint(-51.19, -29.18)::extensions.geography, 'inactive');

insert into public.products (id, canonical_name, size_value, size_unit, status) values
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'Produto Ativo', 500, 'g', 'active'),
  ('bbbbbbbb-0000-4000-8000-0000000000b2', 'Produto Arquivado', 1, 'kg', 'archived'),
  ('bbbbbbbb-0000-4000-8000-0000000000b3', 'Produto Só Pendente', 1, 'kg', 'active');

insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user1@test.local'),
  ('cccccccc-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user2@test.local'),
  ('cccccccc-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local');
update public.profiles set role = 'admin' where id = 'cccccccc-0000-4000-8000-0000000000c3';

insert into public.price_observations
  (id, store_id, product_id, price_cents, unit_price_cents, source, status, created_by) values
  ('dddddddd-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-0000000000a1',
   'bbbbbbbb-0000-4000-8000-0000000000b1', 300, 1, 'manual', 'approved', 'cccccccc-0000-4000-8000-0000000000c3'),
  ('dddddddd-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-0000000000a1',
   'bbbbbbbb-0000-4000-8000-0000000000b3', 999, 1, 'label_photo', 'pending', 'cccccccc-0000-4000-8000-0000000000c1');
refresh materialized view public.current_prices;

-- ── Estrutura ───────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'toda tabela do schema public tem RLS ativada');

select is(
  (select unit_price_cents from public.price_observations where id = 'dddddddd-0000-4000-8000-0000000000d1'),
  600, 'preço por kg é calculado no banco (R$ 3,00 por 500 g = 600/kg)');

-- ── Visitante anônimo ───────────────────────────────────────────────────────
set local role anon;

select is((select count(*)::int from public.stores where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), 1,
  'anon vê loja ativa');
select is((select count(*)::int from public.stores where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'), 0,
  'anon não vê loja inativa');
select is((select count(*)::int from public.products where id = 'bbbbbbbb-0000-4000-8000-0000000000b1'), 1,
  'anon vê produto ativo');
select is((select count(*)::int from public.products where id = 'bbbbbbbb-0000-4000-8000-0000000000b2'), 0,
  'anon não vê produto arquivado');
select is((select count(*)::int from public.current_prices where product_id = 'bbbbbbbb-0000-4000-8000-0000000000b1'), 1,
  'anon vê preço aprovado em current_prices');
select is((select count(*)::int from public.price_board where product_id = 'bbbbbbbb-0000-4000-8000-0000000000b3'), 0,
  'preço só pendente não aparece para o público');
select throws_ok($$select * from public.price_observations$$, '42501', null,
  'anon não lê a tabela de observações diretamente');
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon não lê perfis');
select throws_ok($$select * from public.audit_log$$, '42501', null, 'anon não lê auditoria');
select throws_ok(
  $$insert into public.stores (city_id, name, location) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'Hack', extensions.st_makepoint(0, 0)::extensions.geography)$$,
  '42501', null, 'anon não cria loja');
select is((select count(*)::int from public.price_history('bbbbbbbb-0000-4000-8000-0000000000b1')), 1,
  'anon lê histórico só de preços aprovados');

reset role;

-- ── Usuário autenticado comum ───────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-4000-8000-0000000000c1","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by)
    values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000b1', 350, 1,
            'label_photo', 'pending', 'cccccccc-0000-4000-8000-0000000000c1')$$,
  'usuário envia preço pendente por foto de etiqueta');
select throws_ok(
  $$insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by)
    values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000b1', 1, 1,
            'label_photo', 'approved', 'cccccccc-0000-4000-8000-0000000000c1')$$,
  '42501', null, 'usuário não consegue publicar já aprovado');
select throws_ok(
  $$insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by)
    values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000b1', 1, 1,
            'manual', 'pending', 'cccccccc-0000-4000-8000-0000000000c1')$$,
  '42501', null, 'usuário não usa a origem manual');
select throws_ok(
  $$insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by)
    values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000b1', 1, 1,
            'label_photo', 'pending', 'cccccccc-0000-4000-8000-0000000000c2')$$,
  '42501', null, 'usuário não contribui em nome de outro');
select is((select count(*)::int from public.price_observations), 2,
  'usuário vê só as próprias observações (a de teste + a recém-enviada)');
select lives_ok(
  $$update public.price_observations set status = 'approved'
    where created_by = 'cccccccc-0000-4000-8000-0000000000c1'$$,
  'tentativa de auto-aprovação não dá erro, mas é filtrada pela RLS');
select is(
  (select count(*)::int from public.price_observations where status = 'approved'),
  0, 'usuário não consegue aprovar a própria contribuição');
select throws_ok($$update public.profiles set role = 'admin' where id = 'cccccccc-0000-4000-8000-0000000000c1'$$,
  '42501', null, 'usuário não se promove a admin');
select lives_ok(
  $$update public.profiles set display_name = 'Maria' where id = 'cccccccc-0000-4000-8000-0000000000c1'$$,
  'usuário edita o próprio apelido');
select is((select count(*)::int from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000c2'), 0,
  'usuário não vê o perfil de outro');
select throws_ok($$select public.refresh_current_prices()$$, '42501', null,
  'usuário não atualiza current_prices');
select is((select count(*)::int from public.audit_log), 0, 'usuário não lê auditoria');

-- listas: isolamento entre donos
select lives_ok(
  $$insert into public.shopping_lists (id, user_id, name)
    values ('eeeeeeee-0000-4000-8000-0000000000e1', 'cccccccc-0000-4000-8000-0000000000c1', 'Compra do mês')$$,
  'usuário cria a própria lista');

-- antiabuso: teto diário (30) por usuário comum
select lives_ok($test$
  do $x$ begin
    for i in 1..28 loop
      insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by)
      values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000b1', 100 + i, 1,
              'label_photo', 'pending', 'cccccccc-0000-4000-8000-0000000000c1');
    end loop;
  end $x$ $test$, 'usuário chega ao teto diário de 30 contribuições');
select throws_ok(
  $$insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by)
    values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000b1', 200, 1,
            'label_photo', 'pending', 'cccccccc-0000-4000-8000-0000000000c1')$$,
  '54000', null, 'a 31ª contribuição do dia é barrada');

reset role;

-- ── Outro usuário não acessa a lista alheia ─────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-4000-8000-0000000000c2","role":"authenticated"}', true);

select is((select count(*)::int from public.shopping_lists), 0, 'outro usuário não vê a lista alheia');
select throws_ok(
  $$insert into public.list_items (list_id, free_text) values ('eeeeeeee-0000-4000-8000-0000000000e1', 'arroz')$$,
  '42501', null, 'outro usuário não insere item em lista alheia');

reset role;

-- ── Admin ───────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-4000-8000-0000000000c3","role":"authenticated"}', true);

select is((select count(*)::int from public.stores where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'), 1,
  'admin vê loja inativa');
select lives_ok(
  $$update public.price_observations set status = 'approved'
    where id = 'dddddddd-0000-4000-8000-0000000000d2'$$,
  'admin aprova observação pendente');
select ok(
  (select approved_by = 'cccccccc-0000-4000-8000-0000000000c3' and approved_at is not null
   from public.price_observations where id = 'dddddddd-0000-4000-8000-0000000000d2'),
  'aprovação registra quem e quando');
select throws_ok(
  $$update public.price_observations set price_cents = 1 where id = 'dddddddd-0000-4000-8000-0000000000d1'$$,
  '42501', null, 'preço de uma observação é imutável, até para admin');
select throws_ok($$delete from public.price_observations where id = 'dddddddd-0000-4000-8000-0000000000d1'$$,
  '42501', null, 'observações nunca são apagadas');
select ok((select count(*) from public.audit_log where entity = 'price_observations' and action = 'UPDATE') >= 1,
  'a aprovação ficou na trilha de auditoria');
select lives_ok($$select public.refresh_current_prices()$$, 'admin atualiza current_prices');

reset role;

-- ── Worker (service_role, sem sessão de usuário) ────────────────────────────
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$select public.refresh_current_prices()$$, 'worker (service_role) atualiza current_prices');
reset role;

select * from finish();
rollback;
