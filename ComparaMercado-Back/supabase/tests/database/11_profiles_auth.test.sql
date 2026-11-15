-- Perfil e cadastro: dados da conta, consentimento e proteção contra auto-promoção (ADR-0009).
-- Roda numa transação revertida; fixtures próprias.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-0000-4000-8000-000000000011', '9999911', 'Cidade Perfil', 'RS', true);

-- ── Cadastro (trigger handle_new_user) ──────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('cccccccc-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'perfil1@test.local',
   '{"display_name":"  Maria Souza  ","terms_version":"2026-11","role":"admin"}'),
  ('cccccccc-0000-4000-8000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'perfil2@test.local', '{}'),
  ('cccccccc-0000-4000-8000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'perfil3@test.local', '{"display_name":"x","terms_version":"qualquer coisa"}');

select is((select display_name from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000d1'),
  'Maria Souza', 'cadastro grava o nome aparado');
select is((select role::text from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000d1'),
  'user', 'papel vindo dos metadados é ignorado: sempre começa como user');
select is((select terms_version from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000d1'),
  '2026-11', 'cadastro registra a versão dos termos aceita');
select isnt((select terms_accepted_at from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000d1'),
  null, 'cadastro registra quando os termos foram aceitos');
select is((select terms_accepted_at from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000d2'),
  null, 'sem versão informada, não há aceite registrado');
select is((select display_name from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000d3'),
  null, 'nome curto demais é descartado');
select is((select terms_version from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000d3'),
  null, 'versão de termos fora do formato é descartada');

-- ── Usuário edita o próprio perfil ──────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

select lives_ok(
  $$update public.profiles
    set display_name = 'Maria S.', phone = '+5554999990000',
        city_id = 'aaaaaaaa-0000-4000-8000-000000000011'
    where id = 'cccccccc-0000-4000-8000-0000000000d1'$$,
  'usuário edita nome, telefone e cidade');
select is((select phone from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000d1'),
  '+5554999990000', 'telefone gravado em E.164');
select throws_ok(
  $$update public.profiles set phone = '54 99999-0000' where id = 'cccccccc-0000-4000-8000-0000000000d1'$$,
  '23514', null, 'telefone fora do formato E.164 é rejeitado');
select throws_ok(
  $$update public.profiles set terms_accepted_at = now() where id = 'cccccccc-0000-4000-8000-0000000000d1'$$,
  '42501', null, 'usuário não altera o registro de aceite dos termos');
select throws_ok(
  $$update public.profiles set terms_version = '2099-01' where id = 'cccccccc-0000-4000-8000-0000000000d1'$$,
  '42501', null, 'usuário não altera a versão dos termos aceita');
select throws_ok(
  $$update public.profiles set role = 'admin' where id = 'cccccccc-0000-4000-8000-0000000000d1'$$,
  '42501', null, 'usuário não se promove a admin');

-- ── Isolamento entre usuários ───────────────────────────────────────────────
select is((select count(*)::int from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000d2'),
  0, 'usuário não lê o perfil (nem o telefone) de outro');
select lives_ok(
  $$update public.profiles set display_name = 'Invasor' where id = 'cccccccc-0000-4000-8000-0000000000d2'$$,
  'editar o perfil de outro não dá erro, mas é filtrado pela RLS');

reset role;
select is((select display_name from public.profiles where id = 'cccccccc-0000-4000-8000-0000000000d2'),
  null, 'o perfil do outro usuário continua intacto');

select * from finish();
rollback;
