-- Comunidade (ADR-0010): confirmações, denúncias, corroboração, reputação, feed e fotos.
-- Fixtures próprias; transação revertida.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

-- ── Fixtures (como postgres, ignora RLS) ────────────────────────────────────
insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-1200-4000-8000-000000000001', '9999912', 'Cidade Comunidade', 'RS', true);
insert into public.stores (id, city_id, name, neighborhood, location, status) values
  ('aaaaaaaa-1200-4000-8000-0000000000a1', 'aaaaaaaa-1200-4000-8000-000000000001', 'Loja Perto', 'Centro',
    extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active'),
  ('aaaaaaaa-1200-4000-8000-0000000000a2', 'aaaaaaaa-1200-4000-8000-000000000001', 'Loja Longe', 'Distrito',
    extensions.st_makepoint(-51.40, -29.40)::extensions.geography, 'active');
insert into public.products (id, canonical_name, size_value, size_unit, status) values
  ('bbbbbbbb-1200-4000-8000-0000000000b1', 'Produto Histórico', 1, 'kg', 'active'),
  ('bbbbbbbb-1200-4000-8000-0000000000b2', 'Produto Comunidade', 1, 'kg', 'active');
insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-1200-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'com-autor@test.local'),
  ('cccccccc-1200-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'com-solido@test.local'),
  ('cccccccc-1200-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'com-novato1@test.local'),
  ('cccccccc-1200-4000-8000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'com-novato2@test.local'),
  ('cccccccc-1200-4000-8000-0000000000c5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'com-confiavel@test.local'),
  ('cccccccc-1200-4000-8000-0000000000c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'com-admin@test.local');
update public.profiles set role = 'admin' where id = 'cccccccc-1200-4000-8000-0000000000c6';
update public.profiles set reputation = 60  where id = 'cccccccc-1200-4000-8000-0000000000c2';  -- Colaborador
update public.profiles set reputation = 250 where id = 'cccccccc-1200-4000-8000-0000000000c5';  -- Confiável

-- histórico aprovado do produto B1 (mediana 1000): base da checagem de plausibilidade
insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status) values
  ('aaaaaaaa-1200-4000-8000-0000000000a1', 'bbbbbbbb-1200-4000-8000-0000000000b1', 1000, 1, 'manual', 'approved'),
  ('aaaaaaaa-1200-4000-8000-0000000000a1', 'bbbbbbbb-1200-4000-8000-0000000000b1', 1100, 1, 'manual', 'approved'),
  ('aaaaaaaa-1200-4000-8000-0000000000a1', 'bbbbbbbb-1200-4000-8000-0000000000b1',  900, 1, 'manual', 'approved');

-- fotos: uma da publicação O1 e uma da O3 (que será contestada)
insert into storage.objects (bucket_id, name) values
  ('contributions', 'cccccccc-1200-4000-8000-0000000000c1/foto1.jpg'),
  ('contributions', 'cccccccc-1200-4000-8000-0000000000c1/foto3.jpg');
insert into public.sources (id, store_id, kind, file_path, sha256, uploaded_by) values
  ('ffffffff-1200-4000-8000-0000000000f1', 'aaaaaaaa-1200-4000-8000-0000000000a1', 'label',
   'cccccccc-1200-4000-8000-0000000000c1/foto1.jpg', repeat('1', 64), 'cccccccc-1200-4000-8000-0000000000c1'),
  ('ffffffff-1200-4000-8000-0000000000f3', 'aaaaaaaa-1200-4000-8000-0000000000a2', 'label',
   'cccccccc-1200-4000-8000-0000000000c1/foto3.jpg', repeat('3', 64), 'cccccccc-1200-4000-8000-0000000000c1');

-- publicações da comunidade (todas nascem pendentes)
insert into public.price_observations
  (id, store_id, product_id, price_cents, unit_price_cents, promo, source, source_id, status, created_by) values
  -- O1: vai ser corroborada
  ('dddddddd-1200-4000-8000-0000000000d1', 'aaaaaaaa-1200-4000-8000-0000000000a1', 'bbbbbbbb-1200-4000-8000-0000000000b2',
   500, 1, false, 'label_photo', 'ffffffff-1200-4000-8000-0000000000f1', 'pending', 'cccccccc-1200-4000-8000-0000000000c1'),
  -- O2: só confirmações de Novato
  ('dddddddd-1200-4000-8000-0000000000d2', 'aaaaaaaa-1200-4000-8000-0000000000a1', 'bbbbbbbb-1200-4000-8000-0000000000b2',
   510, 1, false, 'label_photo', null, 'pending', 'cccccccc-1200-4000-8000-0000000000c1'),
  -- O3: vai ser contestada ("mudou" x2)
  ('dddddddd-1200-4000-8000-0000000000d3', 'aaaaaaaa-1200-4000-8000-0000000000a2', 'bbbbbbbb-1200-4000-8000-0000000000b2',
   520, 1, false, 'label_photo', 'ffffffff-1200-4000-8000-0000000000f3', 'pending', 'cccccccc-1200-4000-8000-0000000000c1'),
  -- O6: promoção que será denunciada 3 vezes
  ('dddddddd-1200-4000-8000-0000000000d6', 'aaaaaaaa-1200-4000-8000-0000000000a2', 'bbbbbbbb-1200-4000-8000-0000000000b2',
   530, 1, true, 'label_photo', null, 'pending', 'cccccccc-1200-4000-8000-0000000000c1'),
  -- O7: promoção na loja longe, sem problema
  ('dddddddd-1200-4000-8000-0000000000d7', 'aaaaaaaa-1200-4000-8000-0000000000a2', 'bbbbbbbb-1200-4000-8000-0000000000b2',
   540, 1, true, 'label_photo', null, 'pending', 'cccccccc-1200-4000-8000-0000000000c1');
-- autor Confiável: O4 é um valor absurdo (10% da mediana) e O5 é plausível
insert into public.price_observations
  (id, store_id, product_id, price_cents, unit_price_cents, source, status, created_by) values
  ('dddddddd-1200-4000-8000-0000000000d4', 'aaaaaaaa-1200-4000-8000-0000000000a1', 'bbbbbbbb-1200-4000-8000-0000000000b1',
   100, 1, 'label_photo', 'pending', 'cccccccc-1200-4000-8000-0000000000c5'),
  ('dddddddd-1200-4000-8000-0000000000d5', 'aaaaaaaa-1200-4000-8000-0000000000a1', 'bbbbbbbb-1200-4000-8000-0000000000b1',
   1050, 1, 'label_photo', 'pending', 'cccccccc-1200-4000-8000-0000000000c5');

-- ── Estrutura e regras puras ────────────────────────────────────────────────
select is((select count(*)::int from pg_class
           where relname in ('observation_confirmations', 'observation_reports', 'reputation_events')
             and relrowsecurity), 3, 'as três tabelas novas têm RLS ligada');
select is((select array_agg(public.reputation_level(x) order by x)
           from unnest(array[0, 49, 50, 199, 200, 599, 600]) as x),
  array[0, 0, 1, 1, 2, 2, 3]::smallint[], 'faixas de reputação: 0/50/200/600');
select ok(not ('created_by' = any (select unnest(proargnames) from pg_proc where proname = 'list_community_feed')),
  'o feed não devolve created_by');
select ok(not ('user_id' = any (select unnest(proargnames) from pg_proc where proname = 'list_community_feed')),
  'o feed não devolve user_id');
update public.cities set center = extensions.st_makepoint(-51.18, -29.17)::extensions.geography
 where id = 'aaaaaaaa-1200-4000-8000-000000000001';
select is((select round(center_lat::numeric, 2) from public.cities
           where id = 'aaaaaaaa-1200-4000-8000-000000000001'), -29.17, 'centro da cidade expõe lat/lng');

-- ── Autor de confiança: aprovação na inserção, com checagem de plausibilidade ──
select is((select status::text from public.price_observations where id = 'dddddddd-1200-4000-8000-0000000000d4'),
  'pending', 'autor Confiável com valor absurdo (10% da mediana) continua pendente');
select is((select status::text from public.price_observations where id = 'dddddddd-1200-4000-8000-0000000000d5'),
  'approved', 'autor Confiável com valor plausível nasce aprovado');
select is((select approved_via::text from public.price_observations where id = 'dddddddd-1200-4000-8000-0000000000d5'),
  'trusted_author', 'e registra a origem da aprovação');
select ok((select approved_by is null and reviewed_by is null from public.price_observations
           where id = 'dddddddd-1200-4000-8000-0000000000d5'),
  'aprovação por autor de confiança não aponta para nenhuma pessoa');
select is((select reputation from public.profiles where id = 'cccccccc-1200-4000-8000-0000000000c5'), 260,
  'o autor ganha +10 pela publicação aprovada');

-- ── Visitante anônimo ───────────────────────────────────────────────────────
set local role anon;
select throws_ok(
  $$select * from public.confirm_observation('dddddddd-1200-4000-8000-0000000000d1', 'confirm')$$,
  '42501', null, 'anônimo não confirma');
select throws_ok(
  $$select * from public.report_observation('dddddddd-1200-4000-8000-0000000000d1', 'spam')$$,
  '42501', null, 'anônimo não denuncia');
select throws_ok($$select * from public.observation_confirmations$$, '42501', null,
  'anônimo não lê confirmações');
select ok((select count(*) from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001')) > 0,
  'anônimo lê o feed');
reset role;

-- ── Autor (u1): não mexe na própria publicação nem na própria reputação ─────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c1","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.confirm_observation('dddddddd-1200-4000-8000-0000000000d1', 'confirm')$$,
  '42501', null, 'autor não confirma a própria publicação');
select throws_ok(
  $$select * from public.report_observation('dddddddd-1200-4000-8000-0000000000d1', 'spam')$$,
  '42501', null, 'autor não denuncia a própria publicação');
select throws_ok(
  $$insert into public.observation_confirmations (observation_id, user_id, verdict)
    values ('dddddddd-1200-4000-8000-0000000000d1', 'cccccccc-1200-4000-8000-0000000000c1', 'confirm')$$,
  '42501', null, 'ninguém grava confirmação direto na tabela');
select throws_ok(
  $$insert into public.observation_reports (observation_id, user_id, reason)
    values ('dddddddd-1200-4000-8000-0000000000d1', 'cccccccc-1200-4000-8000-0000000000c1', 'spam')$$,
  '42501', null, 'ninguém grava denúncia direto na tabela');
select throws_ok(
  $$insert into public.reputation_events (user_id, observation_id, kind, points)
    values ('cccccccc-1200-4000-8000-0000000000c1', 'dddddddd-1200-4000-8000-0000000000d1', 'confirmation_received', 500)$$,
  '42501', null, 'ninguém grava pontos de reputação direto na tabela');
select throws_ok(
  $$update public.profiles set reputation = 9999 where id = 'cccccccc-1200-4000-8000-0000000000c1'$$,
  '42501', null, 'usuário não altera a própria reputação');
select throws_ok(
  $$update public.profiles set public_nickname = 'x' where id = 'cccccccc-1200-4000-8000-0000000000c1'$$,
  '23514', null, 'apelido curto demais é recusado');
select throws_ok(
  $$update public.profiles set public_nickname = '<script>' where id = 'cccccccc-1200-4000-8000-0000000000c1'$$,
  '23514', null, 'apelido com símbolos é recusado');
select lives_ok(
  $$update public.profiles set public_nickname = 'Maria do Bairro' where id = 'cccccccc-1200-4000-8000-0000000000c1'$$,
  'usuário define o próprio apelido público');
select throws_ok(
  $$update public.profiles set public_nickname = 'Equipe Compara Mercado' where id = 'cccccccc-1200-4000-8000-0000000000c1'$$,
  '23514', null, 'apelido que imita a equipe é recusado (nome reservado)');
select throws_ok($$select public.public_author_label('cccccccc-1200-4000-8000-0000000000c1')$$,
  '42501', null, 'o rótulo do autor não é consultável direto pelo usuário');
reset role;

-- apelido é único (sem diferenciar maiúsculas)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c2","role":"authenticated"}', true);
select throws_ok(
  $$update public.profiles set public_nickname = 'MARIA DO BAIRRO' where id = 'cccccccc-1200-4000-8000-0000000000c2'$$,
  '23505', null, 'apelido já usado por outra pessoa é recusado');
reset role;

-- ── Inserção: quem não é admin não escolhe campos de decisão ────────────────
insert into storage.objects (bucket_id, name) values
  ('contributions', 'cccccccc-1200-4000-8000-0000000000c1/forjada.jpg');
insert into public.sources (id, store_id, kind, file_path, sha256, uploaded_by) values
  ('ffffffff-1200-4000-8000-0000000000f9', 'aaaaaaaa-1200-4000-8000-0000000000a1', 'label',
   'cccccccc-1200-4000-8000-0000000000c1/forjada.jpg', repeat('9', 64), 'cccccccc-1200-4000-8000-0000000000c1');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c1","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.price_observations
      (id, store_id, product_id, price_cents, unit_price_cents, source, source_id, status, created_by,
       approved_via, review_note, reviewed_by, reviewed_at, created_at)
    values ('dddddddd-1200-4000-8000-0000000000d9', 'aaaaaaaa-1200-4000-8000-0000000000a1',
      'bbbbbbbb-1200-4000-8000-0000000000b2', 515, 1, 'label_photo',
      'ffffffff-1200-4000-8000-0000000000f9', 'pending', 'cccccccc-1200-4000-8000-0000000000c1',
      'admin', 'aprovado pela equipe', 'cccccccc-1200-4000-8000-0000000000c6', now(), now() + interval '30 days')$$,
  'usuário comum consegue enviar, mesmo com campos de decisão preenchidos');
reset role;
select ok((select approved_via is null and review_note is null and reviewed_by is null
                  and reviewed_at is null and created_at <= now()
           from public.price_observations where id = 'dddddddd-1200-4000-8000-0000000000d9'),
  'o banco zera approved_via, review_note, reviewed_* e força created_at');

-- ── Corroboração: Colaborador (u2) + Novato (u3) aprovam O1 ─────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c2","role":"authenticated"}', true);
select is((select new_status::text from public.confirm_observation('dddddddd-1200-4000-8000-0000000000d1', 'confirm')),
  'pending', 'uma confirmação não basta');
select throws_ok(
  $$select * from public.confirm_observation('dddddddd-1200-4000-8000-0000000000d1', 'confirm')$$,
  '23505', null, 'a mesma pessoa não confirma duas vezes');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c3","role":"authenticated"}', true);
select is((select new_status::text from public.confirm_observation('dddddddd-1200-4000-8000-0000000000d1', 'confirm')),
  'approved', 'a segunda confirmação (de pessoa diferente) aprova');
reset role;

select is((select approved_via::text from public.price_observations where id = 'dddddddd-1200-4000-8000-0000000000d1'),
  'community', 'origem da aprovação: comunidade');
select ok((select approved_by is null and reviewed_by is null from public.price_observations
           where id = 'dddddddd-1200-4000-8000-0000000000d1'),
  'aprovação da comunidade não aponta para quem deu a última confirmação');
select is((select reputation from public.profiles where id = 'cccccccc-1200-4000-8000-0000000000c1'), 14,
  'autor: +2 +2 (confirmações) +10 (aprovada)');
select is((select reputation from public.profiles where id = 'cccccccc-1200-4000-8000-0000000000c2'), 61,
  'quem confirma ganha +1');
select is((select reputation from public.profiles where id = 'cccccccc-1200-4000-8000-0000000000c3'), 1,
  'Novato também ganha +1 ao confirmar');

-- ── Novatos sozinhos não bastam: só uma confirmação de Novato conta ─────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c3","role":"authenticated"}', true);
select lives_ok(
  $$select * from public.confirm_observation('dddddddd-1200-4000-8000-0000000000d2', 'confirm')$$,
  'Novato 1 confirma O2');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c4","role":"authenticated"}', true);
select is((select new_status::text from public.confirm_observation('dddddddd-1200-4000-8000-0000000000d2', 'confirm')),
  'pending', 'duas confirmações de Novatos não aprovam');
reset role;

-- ── Contestação: dois "mudou" tiram O3 do feed e abrem tarefa ───────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c2","role":"authenticated"}', true);
select lives_ok(
  $$select * from public.confirm_observation('dddddddd-1200-4000-8000-0000000000d3', 'changed')$$,
  'u2 diz que o preço mudou (O3)');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c4","role":"authenticated"}', true);
select lives_ok(
  $$select * from public.confirm_observation('dddddddd-1200-4000-8000-0000000000d3', 'changed')$$,
  'u4 também (O3)');
reset role;
select is((select count(*)::int from public.review_tasks
           where target_id = 'dddddddd-1200-4000-8000-0000000000d3' and status = 'open'
             and reason = 'Contestada pela comunidade'), 1,
  'dois "mudou" abrem uma tarefa de revisão');
select is((select status::text from public.price_observations where id = 'dddddddd-1200-4000-8000-0000000000d3'),
  'pending', 'a contestada não é rejeitada sozinha: quem decide é o admin');

-- ── Denúncias: 3 pessoas diferentes escondem O6 ─────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c2","role":"authenticated"}', true);
select lives_ok($$select public.report_observation('dddddddd-1200-4000-8000-0000000000d6', 'wrong_price')$$,
  'u2 denuncia O6');
select throws_ok($$select public.report_observation('dddddddd-1200-4000-8000-0000000000d6', 'spam')$$,
  '23505', null, 'a mesma pessoa não denuncia duas vezes');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c3","role":"authenticated"}', true);
select lives_ok($$select public.report_observation('dddddddd-1200-4000-8000-0000000000d6', 'spam')$$,
  'u3 denuncia O6');
reset role;
select is((select count(*)::int from public.review_tasks
           where target_id = 'dddddddd-1200-4000-8000-0000000000d6'), 0,
  'com 2 denúncias ainda não há tarefa');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c4","role":"authenticated"}', true);
select lives_ok($$select public.report_observation('dddddddd-1200-4000-8000-0000000000d6', 'wrong_store')$$,
  'u4 denuncia O6');
reset role;
select is((select count(*)::int from public.review_tasks
           where target_id = 'dddddddd-1200-4000-8000-0000000000d6' and status = 'open'), 1,
  'a terceira denúncia abre a tarefa de revisão');

-- ── Feed: o que aparece e o que não aparece ─────────────────────────────────
select is((select count(*)::int from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001')
           where id in ('dddddddd-1200-4000-8000-0000000000d1', 'dddddddd-1200-4000-8000-0000000000d2',
                        'dddddddd-1200-4000-8000-0000000000d5', 'dddddddd-1200-4000-8000-0000000000d7')),
  4, 'o feed mostra aprovadas e pendentes não contestadas');
select is((select count(*)::int from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001')
           where id in ('dddddddd-1200-4000-8000-0000000000d3', 'dddddddd-1200-4000-8000-0000000000d6')),
  0, 'contestada e denunciada saem do feed');
select is((select author_label from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001')
           where id = 'dddddddd-1200-4000-8000-0000000000d1'),
  'Maria do Bairro', 'o feed mostra o apelido público, nunca o nome');
-- visitante (sem auth.uid()): is_mine é false, nunca NULL (o contrato da API exige booleano)
set local role anon;
select is((select is_mine from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001')
           where id = 'dddddddd-1200-4000-8000-0000000000d1'),
  false, 'para visitante, is_mine é false (não NULL)');
reset role;
select matches((select author_label from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001')
                where id = 'dddddddd-1200-4000-8000-0000000000d5'),
  '^Colaborador #[0-9A-F]{4}$', 'sem apelido: "Colaborador #XXXX"');
select is((select author_level from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001')
           where id = 'dddddddd-1200-4000-8000-0000000000d5'),
  2::smallint, 'o feed informa o nível do autor');
select is((select count(*)::int from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001', p_promo_only => true)
           where id = 'dddddddd-1200-4000-8000-0000000000d7'),
  1, 'filtro de promoções');
select is((select count(*)::int from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001',
             p_lat => -29.17, p_lng => -51.18, p_radius_m => 2000)
           where id in ('dddddddd-1200-4000-8000-0000000000d1', 'dddddddd-1200-4000-8000-0000000000d7')),
  1, 'raio de 2 km inclui a loja perto e exclui a loja longe');
select ok((select distance_m from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001',
             p_lat => -29.17, p_lng => -51.18, p_radius_m => 2000)
           where id = 'dddddddd-1200-4000-8000-0000000000d1') < 100,
  'a distância até a loja perto é calculada');
select isnt(
  (select id from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001', p_limit => 1)),
  (select f.id from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001', p_limit => 1) first_row,
          lateral public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001',
            p_before_created_at => first_row.created_at, p_before_id => first_row.id, p_limit => 1) f),
  'paginação por cursor: a segunda página não repete a primeira');

-- o usuário vê o próprio voto e o que é dele
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c2","role":"authenticated"}', true);
select is((select my_verdict::text from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001')
           where id = 'dddddddd-1200-4000-8000-0000000000d1'),
  'confirm', 'o feed devolve o voto do próprio usuário');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c1","role":"authenticated"}', true);
select ok((select is_mine from public.list_community_feed('aaaaaaaa-1200-4000-8000-000000000001')
           where id = 'dddddddd-1200-4000-8000-0000000000d1'),
  'o feed marca as publicações do próprio usuário');
reset role;

-- ── Fotos: quem está logado vê as do feed, não as contestadas ───────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c4","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects
           where bucket_id = 'contributions' and name = 'cccccccc-1200-4000-8000-0000000000c1/foto1.jpg'),
  1, 'outra pessoa logada vê a foto de uma publicação visível no feed');
select is((select count(*)::int from storage.objects
           where bucket_id = 'contributions' and name = 'cccccccc-1200-4000-8000-0000000000c1/foto3.jpg'),
  0, 'mas não a de uma publicação contestada');
reset role;

-- ── Decisão do admin: auditoria e pontos ────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1200-4000-8000-0000000000c6","role":"authenticated"}', true);
update public.price_observations set status = 'approved' where id = 'dddddddd-1200-4000-8000-0000000000d2';
update public.price_observations set status = 'rejected' where id = 'dddddddd-1200-4000-8000-0000000000d4';
reset role;
select ok((select approved_via = 'admin' and approved_by = 'cccccccc-1200-4000-8000-0000000000c6'
           from public.price_observations where id = 'dddddddd-1200-4000-8000-0000000000d2'),
  'aprovação do admin continua apontando para o admin');
-- 14 (antes) + 4 (duas confirmações de O2) + 10 (aprovação do admin)
select is((select reputation from public.profiles where id = 'cccccccc-1200-4000-8000-0000000000c1'), 28,
  'a aprovação do admin também rende +10 ao autor');
select is((select reputation from public.profiles where id = 'cccccccc-1200-4000-8000-0000000000c5'), 240,
  'preço rejeitado custa −20 ao autor');

select * from finish();
rollback;
