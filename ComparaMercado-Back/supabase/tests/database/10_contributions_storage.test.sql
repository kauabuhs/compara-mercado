-- Contribuição com foto: bucket privado, Storage por dono, `sources` do usuário e foto obrigatória.
-- Fixtures próprias; transação revertida.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ── Fixtures (como postgres, ignora RLS) ────────────────────────────────────
insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-9000-4000-8000-000000000001', '9999990', 'Cidade Contribuição', 'RS', true);
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-9000-4000-8000-0000000000a1', 'aaaaaaaa-9000-4000-8000-000000000001', 'Loja Ativa',
    extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active'),
  ('aaaaaaaa-9000-4000-8000-0000000000a2', 'aaaaaaaa-9000-4000-8000-000000000001', 'Loja Inativa',
    extensions.st_makepoint(-51.19, -29.18)::extensions.geography, 'inactive');
insert into public.products (id, canonical_name, size_value, size_unit, status) values
  ('bbbbbbbb-9000-4000-8000-0000000000b1', 'Produto Ativo', 1, 'kg', 'active'),
  ('bbbbbbbb-9000-4000-8000-0000000000b2', 'Produto Arquivado', 1, 'kg', 'archived');
insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-9000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ctr-u1@test.local'),
  ('cccccccc-9000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ctr-u2@test.local'),
  ('cccccccc-9000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ctr-admin@test.local');
update public.profiles set role = 'admin' where id = 'cccccccc-9000-4000-8000-0000000000c3';

-- uma foto já enviada por cada usuário comum (objeto + fonte do usuário 2)
insert into storage.objects (bucket_id, name) values
  ('contributions', 'cccccccc-9000-4000-8000-0000000000c1/fixture.jpg'),
  ('contributions', 'cccccccc-9000-4000-8000-0000000000c2/fixture.jpg');
insert into public.sources (id, store_id, kind, file_path, sha256, uploaded_by) values
  ('ffffffff-9000-4000-8000-0000000000f2', 'aaaaaaaa-9000-4000-8000-0000000000a1', 'label',
   'cccccccc-9000-4000-8000-0000000000c2/fixture.jpg', repeat('b', 64),
   'cccccccc-9000-4000-8000-0000000000c2');

-- ── Estrutura ───────────────────────────────────────────────────────────────
select is((select public from storage.buckets where id = 'contributions'), false,
  'o bucket contributions é privado');
select is((select allowed_mime_types from storage.buckets where id = 'contributions'),
  array['image/jpeg'], 'o bucket só aceita JPEG (a API re-codifica)');

-- ── Visitante anônimo ───────────────────────────────────────────────────────
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'contributions'), 0,
  'anônimo não enxerga nenhuma foto');
select throws_ok(
  $$insert into public.sources (store_id, kind, file_path, sha256, uploaded_by)
    values ('aaaaaaaa-9000-4000-8000-0000000000a1', 'label', 'x/y.jpg', repeat('c', 64), null)$$,
  '42501', null, 'anônimo não registra fonte');
reset role;

-- ── Usuário 1 ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-9000-4000-8000-0000000000c1","role":"authenticated"}', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('contributions', 'cccccccc-9000-4000-8000-0000000000c1/nova.jpg')$$,
  'usuário grava foto na própria pasta');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('contributions', 'cccccccc-9000-4000-8000-0000000000c2/invasao.jpg')$$,
  '42501', null, 'usuário não grava na pasta de outro');
-- (só a pasta dele: fotos de publicações visíveis no feed são legíveis por todos os logados, ADR-0010)
select is((select count(*)::int from storage.objects
           where bucket_id = 'contributions' and name like 'cccccccc-9000-4000-8000-0000000000c1/%'),
  2, 'usuário vê as próprias fotos (a antiga e a nova)');
-- DELETE direto é barrado pelo próprio Supabase (protect_delete); pela Storage API a barreira é a
-- ausência de política de DELETE, coberta no teste de integração da API.
select throws_ok(
  $$delete from storage.objects where bucket_id = 'contributions'$$,
  '42501', null, 'exclusão direta de fotos é bloqueada');
select is((select count(*)::int from storage.objects
           where bucket_id = 'contributions' and name like 'cccccccc-9000-4000-8000-0000000000c1/%'),
  2, 'usuário não consegue apagar o comprovante depois de enviar');

select lives_ok(
  $$insert into public.sources (id, store_id, kind, file_path, sha256, uploaded_by)
    values ('ffffffff-9000-4000-8000-0000000000f1', 'aaaaaaaa-9000-4000-8000-0000000000a1', 'label',
            'cccccccc-9000-4000-8000-0000000000c1/nova.jpg', repeat('a', 64),
            'cccccccc-9000-4000-8000-0000000000c1')$$,
  'usuário registra a própria fonte de etiqueta');
select throws_ok(
  $$insert into public.sources (store_id, kind, file_path, sha256, uploaded_by)
    values ('aaaaaaaa-9000-4000-8000-0000000000a1', 'label',
            'cccccccc-9000-4000-8000-0000000000c2/roubo.jpg', repeat('d', 64),
            'cccccccc-9000-4000-8000-0000000000c1')$$,
  '42501', null, 'fonte precisa apontar para a pasta do próprio usuário');
select throws_ok(
  $$insert into public.sources (store_id, kind, file_path, sha256, uploaded_by)
    values ('aaaaaaaa-9000-4000-8000-0000000000a1', 'label',
            'cccccccc-9000-4000-8000-0000000000c1/em-nome-de-outro.jpg', repeat('e', 64),
            'cccccccc-9000-4000-8000-0000000000c2')$$,
  '42501', null, 'usuário não registra fonte em nome de outro');
select throws_ok(
  $$insert into public.sources (store_id, kind, file_path, sha256, uploaded_by)
    values ('aaaaaaaa-9000-4000-8000-0000000000a1', 'flyer',
            'cccccccc-9000-4000-8000-0000000000c1/encarte.jpg', repeat('f', 64),
            'cccccccc-9000-4000-8000-0000000000c1')$$,
  '42501', null, 'usuário só registra fonte do tipo etiqueta');
select throws_ok(
  $$insert into public.sources (store_id, kind, file_path, sha256, uploaded_by)
    values (null, 'label', 'cccccccc-9000-4000-8000-0000000000c1/sem-loja.jpg', repeat('1', 64),
            'cccccccc-9000-4000-8000-0000000000c1')$$,
  '42501', null, 'fonte de etiqueta exige a loja');
select throws_ok(
  $$insert into public.sources (store_id, kind, file_path, sha256, uploaded_by)
    values ('aaaaaaaa-9000-4000-8000-0000000000a1', 'label',
            'cccccccc-9000-4000-8000-0000000000c1/repetida.jpg', repeat('a', 64),
            'cccccccc-9000-4000-8000-0000000000c1')$$,
  '23505', null, 'a mesma foto (sha256) não é registrada duas vezes');
select is((select count(*)::int from public.sources), 1,
  'usuário vê só as próprias fontes');

select lives_ok(
  $$insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by, source_id)
    values ('aaaaaaaa-9000-4000-8000-0000000000a1', 'bbbbbbbb-9000-4000-8000-0000000000b1', 599, 1,
            'label_photo', 'pending', 'cccccccc-9000-4000-8000-0000000000c1',
            'ffffffff-9000-4000-8000-0000000000f1')$$,
  'usuário envia preço com a própria foto');
select throws_ok(
  $$insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by)
    values ('aaaaaaaa-9000-4000-8000-0000000000a1', 'bbbbbbbb-9000-4000-8000-0000000000b1', 599, 1,
            'label_photo', 'pending', 'cccccccc-9000-4000-8000-0000000000c1')$$,
  '42501', null, 'preço de usuário comum sem foto é barrado');
select throws_ok(
  $$insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by, source_id)
    values ('aaaaaaaa-9000-4000-8000-0000000000a1', 'bbbbbbbb-9000-4000-8000-0000000000b1', 599, 1,
            'label_photo', 'pending', 'cccccccc-9000-4000-8000-0000000000c1',
            'ffffffff-9000-4000-8000-0000000000f2')$$,
  '42501', null, 'usuário não usa a foto de outro como prova');
select throws_ok(
  $$insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by, source_id)
    values ('aaaaaaaa-9000-4000-8000-0000000000a2', 'bbbbbbbb-9000-4000-8000-0000000000b1', 599, 1,
            'label_photo', 'pending', 'cccccccc-9000-4000-8000-0000000000c1',
            'ffffffff-9000-4000-8000-0000000000f1')$$,
  '42501', null, 'não se contribui para loja inativa');
select throws_ok(
  $$insert into public.price_observations (store_id, product_id, price_cents, unit_price_cents, source, status, created_by, source_id)
    values ('aaaaaaaa-9000-4000-8000-0000000000a1', 'bbbbbbbb-9000-4000-8000-0000000000b2', 599, 1,
            'label_photo', 'pending', 'cccccccc-9000-4000-8000-0000000000c1',
            'ffffffff-9000-4000-8000-0000000000f1')$$,
  '23503', null, 'não se contribui para produto arquivado (o usuário nem o enxerga)');
reset role;

-- ── Usuário 2 só enxerga do usuário 1 o que está numa publicação do feed ───
-- (ADR-0010: a foto de um preço visível para a comunidade pode ser vista por quem está logado;
-- qualquer outra foto continua privada.)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-9000-4000-8000-0000000000c2","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects
           where bucket_id = 'contributions' and name = 'cccccccc-9000-4000-8000-0000000000c1/nova.jpg'),
  1, 'a foto de uma publicação visível no feed é legível por outra pessoa logada');
select is((select count(*)::int from storage.objects
           where bucket_id = 'contributions' and name = 'cccccccc-9000-4000-8000-0000000000c1/fixture.jpg'),
  0, 'foto que não está em nenhuma publicação continua privada');
reset role;

-- ── Admin lê tudo (revisão com a foto) ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-9000-4000-8000-0000000000c3","role":"authenticated"}', true);
select cmp_ok((select count(*)::int from storage.objects where bucket_id = 'contributions'), '>=', 3,
  'admin vê as fotos de todos os usuários');
reset role;

select * from finish();
rollback;
