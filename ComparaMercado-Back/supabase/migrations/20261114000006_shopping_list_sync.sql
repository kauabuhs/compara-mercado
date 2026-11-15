-- Lista de compras na conta (Fase 4).
--
-- Até aqui a lista vivia só no navegador; `shopping_lists`/`list_items` existiam com RLS, mas nada
-- as usava. Cada pessoa passa a ter UMA lista ("Minha lista"), sincronizada pelo app. A troca dos
-- itens é uma função (atômica): o app manda a lista inteira e o banco a substitui.

-- Ordem dos itens: sem isto, um insert em lote cria linhas com o mesmo `created_at`.
alter table public.list_items add column position integer not null default 0;
create index list_items_list_position_idx on public.list_items (list_id, position);

-- Substitui os itens da lista da pessoa logada e devolve o novo `updated_at` (a "versão" da lista).
--
-- Não é SECURITY DEFINER de propósito: roda como a própria pessoa, então a RLS vale. Por isso:
--  · só a lista dela é lida e gravada;
--  · produtos que ela não pode ver (arquivados, rascunho, inexistentes) são ignorados em silêncio
--    (o `join` com `products` passa pela RLS), em vez de a lista inteira falhar;
--  · quantidade fora de 1..99 e produto repetido não entram (vale a primeira ocorrência).
create or replace function public.replace_shopping_list(p_items jsonb)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_list    uuid;
  v_updated timestamptz;
begin
  if v_uid is null then
    raise exception 'login obrigatório' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'lista inválida: esperado um array de até 100 itens' using errcode = '22023';
  end if;

  select id into v_list
    from public.shopping_lists
   where user_id = v_uid
   order by created_at, id
   limit 1;
  if v_list is null then
    insert into public.shopping_lists (user_id) values (v_uid) returning id into v_list;
  end if;

  delete from public.list_items where list_id = v_list;

  insert into public.list_items (list_id, product_id, quantity, position)
  select v_list, i.product_id, i.quantity, i.ord::integer
    from (
      select distinct on (x.product_id) x.product_id, x.quantity, x.ord
        from (
          select (e.item ->> 'product_id')::uuid as product_id,
                 (e.item ->> 'quantity')::integer as quantity,
                 e.ord
            from jsonb_array_elements(p_items) with ordinality as e(item, ord)
        ) x
       where x.product_id is not null and x.quantity between 1 and 99
       order by x.product_id, x.ord
    ) i
    join public.products p on p.id = i.product_id;

  update public.shopping_lists set updated_at = now() where id = v_list
  returning updated_at into v_updated;
  return v_updated;
end $$;

revoke all on function public.replace_shopping_list(jsonb) from public, anon;
grant execute on function public.replace_shopping_list(jsonb) to authenticated;
