-- Lista de compras na conta (Fase 4): substituição atômica, isolamento por dono e RLS.
-- Fixtures próprias; transação revertida.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.products (id, canonical_name, size_value, size_unit, status) values
  ('bbbbbbbb-1500-4000-8000-0000000000b1', 'Lista Produto A', 1, 'kg', 'active'),
  ('bbbbbbbb-1500-4000-8000-0000000000b2', 'Lista Produto B', 1, 'kg', 'active'),
  ('bbbbbbbb-1500-4000-8000-0000000000b3', 'Lista Produto Arquivado', 1, 'kg', 'archived');
insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-1500-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lista-a@test.local'),
  ('cccccccc-1500-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lista-b@test.local');

-- ── Visitante: sem acesso à função nem às tabelas ───────────────────────────
set local role anon;
select throws_ok($$select public.replace_shopping_list('[]'::jsonb)$$, '42501', null,
  'visitante não substitui lista');
select throws_ok($$select * from public.shopping_lists$$, '42501', null,
  'visitante não lê listas');
reset role;

-- ── Pessoa A grava a lista ──────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1500-4000-8000-0000000000c1","role":"authenticated"}', true);

select isnt(public.replace_shopping_list(
  '[{"product_id":"bbbbbbbb-1500-4000-8000-0000000000b2","quantity":3},
    {"product_id":"bbbbbbbb-1500-4000-8000-0000000000b1","quantity":2}]'::jsonb), null,
  'primeira gravação cria a lista e devolve a versão');
select is((select count(*)::int from public.shopping_lists), 1, 'a pessoa tem uma lista');
select is((select array_agg(product_id order by position) from public.list_items),
  array['bbbbbbbb-1500-4000-8000-0000000000b2', 'bbbbbbbb-1500-4000-8000-0000000000b1']::uuid[],
  'a ordem enviada é a ordem guardada');

-- trocar: ignora arquivado, repetido e quantidade inválida; vale a primeira ocorrência
select lives_ok(
  $$select public.replace_shopping_list(
    '[{"product_id":"bbbbbbbb-1500-4000-8000-0000000000b1","quantity":5},
      {"product_id":"bbbbbbbb-1500-4000-8000-0000000000b1","quantity":9},
      {"product_id":"bbbbbbbb-1500-4000-8000-0000000000b3","quantity":1},
      {"product_id":"bbbbbbbb-1500-4000-8000-0000000000b2","quantity":0},
      {"product_id":"bbbbbbbb-1500-4000-8000-0000000000b2","quantity":100}]'::jsonb)$$,
  'troca a lista inteira, mesmo com itens que não valem');
select is((select count(*)::int from public.list_items), 1,
  'só o item válido ficou (arquivado, quantidade 0 e 100 foram ignorados)');
select is((select quantity from public.list_items), 5,
  'produto repetido vale a primeira ocorrência');
select is((select count(*)::int from public.shopping_lists), 1, 'a lista é reaproveitada, não duplicada');

-- vazio limpa
select lives_ok($$select public.replace_shopping_list('[]'::jsonb)$$, 'lista vazia é aceita');
select is((select count(*)::int from public.list_items), 0, 'e limpa os itens');

select throws_ok($$select public.replace_shopping_list('{"a":1}'::jsonb)$$, '22023', null,
  'o corpo precisa ser um array');

-- ── Pessoa B não vê nem mexe na lista da A ──────────────────────────────────
select public.replace_shopping_list(
  '[{"product_id":"bbbbbbbb-1500-4000-8000-0000000000b1","quantity":4}]'::jsonb);
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1500-4000-8000-0000000000c2","role":"authenticated"}', true);
select is((select count(*)::int from public.list_items), 0, 'B não enxerga os itens de A');
select public.replace_shopping_list(
  '[{"product_id":"bbbbbbbb-1500-4000-8000-0000000000b2","quantity":1}]'::jsonb);
reset role;

select is((select count(*)::int from public.shopping_lists
           where user_id in ('cccccccc-1500-4000-8000-0000000000c1', 'cccccccc-1500-4000-8000-0000000000c2')),
  2, 'cada pessoa tem a sua própria lista');
select is((select quantity from public.list_items li join public.shopping_lists l on l.id = li.list_id
           where l.user_id = 'cccccccc-1500-4000-8000-0000000000c1'), 4,
  'a gravação de B não alterou a lista de A');

select * from finish();
rollback;
