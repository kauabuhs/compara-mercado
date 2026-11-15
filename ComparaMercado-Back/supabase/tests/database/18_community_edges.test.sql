-- Bordas da comunidade e do cadastro (QA B-05): expiração, tetos diários, piso da reputação,
-- "mudou" em preço já aprovado, habilitação automática da cidade e validação de `handle_new_user`.
-- Fixtures próprias; transação revertida.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into public.cities (id, ibge_code, name, uf, active) values
  ('aaaaaaaa-1800-4000-8000-000000000001', '9999801', 'Cidade Borda A', 'RS', false),
  ('aaaaaaaa-1800-4000-8000-000000000002', '9999802', 'Cidade Borda B', 'RS', false);
-- Cidade de outro país (precisa de um mercado comercial desse país para receber loja)
insert into public.markets (code, name, country_code, currency_code, timezone)
values ('ar-qa', 'Argentina QA', 'AR', 'ARS', 'America/Argentina/Buenos_Aires');
insert into public.cities (id, name, active, country_code) values
  ('aaaaaaaa-1800-4000-8000-000000000003', 'Cidade Borda Fora', false, 'AR');

insert into public.products (id, canonical_name, size_value, size_unit, status) values
  ('bbbbbbbb-1800-4000-8000-0000000000b1', 'Produto Borda', 1, 'kg', 'active');

-- ── Habilitação automática da cidade (stores_sync_city_active) ──────────────
insert into public.stores (id, city_id, name, neighborhood, location, status) values
  ('aaaaaaaa-1800-4000-8000-0000000000a1', 'aaaaaaaa-1800-4000-8000-000000000001', 'Loja Borda 1', 'Centro', extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'pending');
select is((select active from public.cities where id = 'aaaaaaaa-1800-4000-8000-000000000001'), false,
  'loja pendente NÃO habilita a cidade');

update public.stores set status = 'active' where id = 'aaaaaaaa-1800-4000-8000-0000000000a1';
select is((select active from public.cities where id = 'aaaaaaaa-1800-4000-8000-000000000001'), true,
  'a primeira loja ativa habilita a cidade');

insert into public.stores (id, city_id, name, neighborhood, location, status) values
  ('aaaaaaaa-1800-4000-8000-0000000000a3', 'aaaaaaaa-1800-4000-8000-000000000003', 'Loja Borda Fora', 'Centro', extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active');
select is((select active from public.cities where id = 'aaaaaaaa-1800-4000-8000-000000000003'), false,
  'cidade de outro país não é habilitada sozinha (continua manual)');

update public.stores set city_id = 'aaaaaaaa-1800-4000-8000-000000000002'
 where id = 'aaaaaaaa-1800-4000-8000-0000000000a1';
select is((select active from public.cities where id = 'aaaaaaaa-1800-4000-8000-000000000002'), true,
  'mudar a loja ativa de cidade habilita a cidade nova');

insert into public.cities (id, ibge_code, name, uf, active) values
  ('aaaaaaaa-1800-4000-8000-000000000004', '9999804', 'Cidade Borda C', 'RS', false);
insert into public.stores (id, city_id, name, neighborhood, location, status) values
  ('aaaaaaaa-1800-4000-8000-0000000000a4', 'aaaaaaaa-1800-4000-8000-000000000004', 'Loja Borda Inativa', 'Centro', extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'inactive');
select is((select active from public.cities where id = 'aaaaaaaa-1800-4000-8000-000000000004'), false,
  'loja inativa não habilita a cidade');

-- ── handle_new_user: metadados do cliente nunca são confiáveis ──────────────
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('cccccccc-1800-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'termos-ruim@test.local', '{"terms_version":"banana"}'),
  ('cccccccc-1800-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'termos-dia@test.local', '{"terms_version":"2026-11-15"}'),
  ('cccccccc-1800-4000-8000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'termos-mes@test.local', '{"terms_version":"2026-11"}'),
  ('cccccccc-1800-4000-8000-0000000000e4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'nome-curto@test.local', '{"display_name":" A "}'),
  ('cccccccc-1800-4000-8000-0000000000e5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'nome-longo@test.local', jsonb_build_object('display_name', repeat('x', 50))),
  ('cccccccc-1800-4000-8000-0000000000e6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'papel@test.local', '{"role":"admin","display_name":"Esperta"}'),
  ('cccccccc-1800-4000-8000-0000000000e7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sem-meta@test.local', null);

select is((select terms_version from public.profiles where id = 'cccccccc-1800-4000-8000-0000000000e1'), null,
  'versão de termos fora do formato é descartada');
select is((select terms_accepted_at from public.profiles where id = 'cccccccc-1800-4000-8000-0000000000e1'), null,
  'e o aceite não é registrado');
select is((select terms_version from public.profiles where id = 'cccccccc-1800-4000-8000-0000000000e2'), '2026-11-15',
  'versão AAAA-MM-DD é aceita');
select is((select terms_version from public.profiles where id = 'cccccccc-1800-4000-8000-0000000000e3'), '2026-11',
  'versão AAAA-MM é aceita');
select is((select display_name from public.profiles where id = 'cccccccc-1800-4000-8000-0000000000e4'), null,
  'nome com 1 letra (depois de aparado) é descartado');
select is((select length(display_name) from public.profiles where id = 'cccccccc-1800-4000-8000-0000000000e5'), 40,
  'nome longo é cortado em 40');
select is((select role::text from public.profiles where id = 'cccccccc-1800-4000-8000-0000000000e6'), 'user',
  'o papel nunca vem dos metadados do cliente');
select is((select count(*)::int from public.profiles where id = 'cccccccc-1800-4000-8000-0000000000e7'), 1,
  'cadastro sem metadados também cria o perfil');

-- ── Observações para as bordas de regra ─────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-1800-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-autor@test.local'),
  ('cccccccc-1800-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-solido@test.local'),
  ('cccccccc-1800-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-teto-confirma@test.local'),
  ('cccccccc-1800-4000-8000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-piso@test.local'),
  ('cccccccc-1800-4000-8000-0000000000c5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-teto-denuncia@test.local'),
  ('cccccccc-1800-4000-8000-0000000000c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-pontos-20@test.local'),
  ('cccccccc-1800-4000-8000-0000000000c7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-pontos-19@test.local');
update public.profiles set reputation = 60 where id = 'cccccccc-1800-4000-8000-0000000000c2';
update public.profiles set reputation = 60 where id = 'cccccccc-1800-4000-8000-0000000000c7';
update public.profiles set reputation = 5  where id = 'cccccccc-1800-4000-8000-0000000000c4';

-- 205 observações pendentes (origem manual: o gatilho de avaliação não age sobre elas)
insert into public.price_observations (id, store_id, product_id, price_cents, unit_price_cents, source, status)
select ('dddddddd-1800-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
       'aaaaaaaa-1800-4000-8000-0000000000a1', 'bbbbbbbb-1800-4000-8000-0000000000b1',
       1000 + i, 1, 'manual', 'pending'
  from generate_series(1, 205) i;

-- uma observação da comunidade com 8 dias e outra já vencida
insert into public.price_observations
  (id, store_id, product_id, price_cents, unit_price_cents, source, status, created_by, created_at) values
  ('eeeeeeee-1800-4000-8000-0000000000e1', 'aaaaaaaa-1800-4000-8000-0000000000a1', 'bbbbbbbb-1800-4000-8000-0000000000b1',
   2001, 1, 'label_photo', 'pending', 'cccccccc-1800-4000-8000-0000000000c1', now() - interval '8 days');
insert into public.price_observations
  (id, store_id, product_id, price_cents, unit_price_cents, source, status, created_by, valid_to) values
  ('eeeeeeee-1800-4000-8000-0000000000e2', 'aaaaaaaa-1800-4000-8000-0000000000a1', 'bbbbbbbb-1800-4000-8000-0000000000b1',
   2002, 1, 'label_photo', 'pending', 'cccccccc-1800-4000-8000-0000000000c1', now() - interval '1 day');
-- aprovada, para o "mudou" duplo
insert into public.price_observations (id, store_id, product_id, price_cents, unit_price_cents, source, status)
values ('eeeeeeee-1800-4000-8000-0000000000e3', 'aaaaaaaa-1800-4000-8000-0000000000a1',
        'bbbbbbbb-1800-4000-8000-0000000000b1', 2003, 1, 'manual', 'approved');

-- Reputação nunca fica negativa (como postgres: o livro-razão não é gravável pelo cliente)
insert into public.reputation_events (user_id, observation_id, kind, points)
values ('cccccccc-1800-4000-8000-0000000000c4', 'dddddddd-1800-4000-8000-000000000001', 'price_rejected', -20);
select is((select reputation from public.profiles where id = 'cccccccc-1800-4000-8000-0000000000c4'), 0,
  'reputação 5 com −20 fica em 0, nunca negativa');
insert into public.reputation_events (user_id, observation_id, kind, points)
values ('cccccccc-1800-4000-8000-0000000000c4', 'dddddddd-1800-4000-8000-000000000002', 'price_rejected', -20);
select is((select reputation from public.profiles where id = 'cccccccc-1800-4000-8000-0000000000c4'), 0,
  'e continua em 0 com novas penalidades');

-- Histórico de hoje: as pessoas já "gastaram" o teto (inseridos direto, como postgres)
insert into public.observation_confirmations (observation_id, user_id, verdict)
select ('dddddddd-1800-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
       'cccccccc-1800-4000-8000-0000000000c3', 'confirm'
  from generate_series(1, 200) i;
insert into public.observation_reports (observation_id, user_id, reason)
select ('dddddddd-1800-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
       'cccccccc-1800-4000-8000-0000000000c5', 'spam'
  from generate_series(1, 50) i;
insert into public.observation_confirmations (observation_id, user_id, verdict)
select ('dddddddd-1800-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
       'cccccccc-1800-4000-8000-0000000000c6', 'confirm'
  from generate_series(1, 20) i;
insert into public.observation_confirmations (observation_id, user_id, verdict)
select ('dddddddd-1800-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
       'cccccccc-1800-4000-8000-0000000000c7', 'confirm'
  from generate_series(1, 19) i;

-- ── Expiração (7 dias e validade) ───────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1800-4000-8000-0000000000c2","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.confirm_observation('eeeeeeee-1800-4000-8000-0000000000e1', 'confirm')$$,
  'P0002', 'publicação expirada', 'confirmar publicação com mais de 7 dias é recusado');
select throws_ok(
  $$select * from public.confirm_observation('eeeeeeee-1800-4000-8000-0000000000e2', 'confirm')$$,
  'P0002', 'publicação expirada', 'confirmar publicação com validade vencida é recusado');

-- ── Tetos diários ───────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1800-4000-8000-0000000000c3","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.confirm_observation('dddddddd-1800-4000-8000-0000000000c9', 'confirm')$$,
  '54000', 'limite diário de confirmações atingido', 'a 201ª confirmação do dia é recusada');

select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1800-4000-8000-0000000000c5","role":"authenticated"}', true);
select throws_ok(
  $$select public.report_observation('dddddddd-1800-4000-8000-000000000033', 'spam')$$,
  '54000', 'limite diário de denúncias atingido', 'a 51ª denúncia do dia é recusada');

-- ── Pontos por confirmar: no máximo 20 por dia ──────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1800-4000-8000-0000000000c6","role":"authenticated"}', true);
select lives_ok(
  $$select * from public.confirm_observation('dddddddd-1800-4000-8000-000000000064', 'confirm')$$,
  'a 21ª confirmação do dia ainda é aceita');
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1800-4000-8000-0000000000c7","role":"authenticated"}', true);
select lives_ok(
  $$select * from public.confirm_observation('dddddddd-1800-4000-8000-000000000064', 'confirm')$$,
  'a 20ª confirmação do dia é aceita');
reset role;
select is((select count(*)::int from public.reputation_events
           where user_id = 'cccccccc-1800-4000-8000-0000000000c6' and kind = 'confirmation_given'
             and observation_id = 'dddddddd-1800-4000-8000-000000000064'), 0,
  'depois de 20 no dia, confirmar não rende mais pontos');
select is((select count(*)::int from public.reputation_events
           where user_id = 'cccccccc-1800-4000-8000-0000000000c7' and kind = 'confirmation_given'
             and observation_id = 'dddddddd-1800-4000-8000-000000000064'), 1,
  'com 19 no dia, a próxima ainda rende o ponto');

-- ── "Mudou" duas vezes em preço JÁ APROVADO ─────────────────────────────────
-- Comportamento atual (a confirmar com o produto, ver docs/qa/bugs.md QA-009): só preço pendente
-- é contestado por "mudou"; um preço aprovado segue publicado e sem tarefa para o admin.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1800-4000-8000-0000000000c2","role":"authenticated"}', true);
select lives_ok(
  $$select * from public.confirm_observation('eeeeeeee-1800-4000-8000-0000000000e3', 'changed')$$,
  'primeiro "mudou" em preço aprovado');
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1800-4000-8000-0000000000c7","role":"authenticated"}', true);
select lives_ok(
  $$select * from public.confirm_observation('eeeeeeee-1800-4000-8000-0000000000e3', 'changed')$$,
  'segundo "mudou" em preço aprovado');
reset role;
select is((select status::text from public.price_observations
           where id = 'eeeeeeee-1800-4000-8000-0000000000e3'), 'approved',
  'preço aprovado com 2 "mudou" segue aprovado');
select is((select count(*)::int from public.review_tasks
           where target_id = 'eeeeeeee-1800-4000-8000-0000000000e3'), 0,
  'e nenhuma tarefa de revisão é aberta (só denúncias abrem para preço aprovado)');

select * from finish();
rollback;
