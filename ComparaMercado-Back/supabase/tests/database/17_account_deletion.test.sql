-- Exclusão de conta (LGPD) × imutabilidade das observações de preço — QA-001.
--
-- `price_observations.created_by` referencia `profiles` com `on delete set null`, mas o gatilho
-- `price_observations_guard` trata `created_by` como imutável: o UPDATE que a FK dispara ao apagar a
-- pessoa é barrado (42501) e a exclusão inteira falha. Enquanto isso não for corrigido, quem tem ao
-- menos um preço registrado não pode ser excluída, e "excluir minha conta" não existe no produto.
--
-- As asserções que dependem da correção ficam marcadas como TODO: documentam o comportamento
-- esperado sem derrubar a suíte. Ao corrigir (ex.: o gatilho aceitar `created_by: X → null` quando
-- vem da FK), retire o `todo_start`/`todo_end` e o teste passa a proteger a regressão.
-- Fixtures próprias (a loja e o produto do seed); transação revertida.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-1700-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'exclusao@test.local');

select is((select count(*)::int from public.profiles
           where id = 'cccccccc-1700-4000-8000-0000000000c1'), 1,
  'o cadastro cria o perfil da pessoa');

insert into public.price_observations (store_id, product_id, price_cents, source, status, created_by)
select s.id, p.id, 777, 'manual', 'approved', 'cccccccc-1700-4000-8000-0000000000c1'
from (select id from public.stores order by id limit 1) s,
     (select id from public.products order by id limit 1) p;

select is((select count(*)::int from public.price_observations
           where created_by = 'cccccccc-1700-4000-8000-0000000000c1'), 1,
  'a pessoa tem um preço registrado');

-- Sem preços a exclusão funciona (só o perfil sai em cascata).
insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-1700-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'exclusao-sem-preco@test.local');
select lives_ok($$delete from auth.users where id = 'cccccccc-1700-4000-8000-0000000000c2'$$,
  'excluir uma conta sem preços registrados funciona');

-- O que falha hoje (QA-001): excluir quem tem preço registrado.
select todo_start('QA-001: excluir conta com preço registrado esbarra na guarda de imutabilidade');
select lives_ok($$delete from auth.users where id = 'cccccccc-1700-4000-8000-0000000000c1'$$,
  'excluir uma conta com preços registrados funciona');
select is((select count(*)::int from public.price_observations
           where price_cents = 777 and created_by is null), 1,
  'o preço continua publicado, sem autoria (anonimizado), depois da exclusão');
select todo_end();

select * from finish();
rollback;
