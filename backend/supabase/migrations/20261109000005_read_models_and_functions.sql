-- 0005 · Modelos de leitura: current_prices, price_board, busca, histórico e comparação de lista

-- ── current_prices ──────────────────────────────────────────────────────────
-- Para cada (mercado, produto): a observação aprovada e vigente mais recente.
-- Materializada para a comparação não recalcular a cada consulta; atualizada por job.
create materialized view public.current_prices as
select distinct on (po.store_id, po.product_id)
  po.store_id,
  po.product_id,
  po.id               as observation_id,
  po.price_cents,
  po.unit_price_cents,
  po.promo,
  po.valid_from,
  po.valid_to,
  po.observed_at,
  po.confidence,
  po.source
from public.price_observations po
where po.status = 'approved'
  and (po.valid_from is null or po.valid_from <= now())
  and (po.valid_to   is null or po.valid_to   >= now())
order by po.store_id, po.product_id, po.observed_at desc, po.created_at desc
with data;

-- Índice único obrigatório para REFRESH ... CONCURRENTLY (não bloqueia leituras).
create unique index current_prices_pk on public.current_prices (store_id, product_id);
create index current_prices_product_idx on public.current_prices (product_id, unit_price_cents);

grant select on public.current_prices to anon, authenticated;

-- Só admin dispara pela API; o worker atualiza direto no banco por cron.
create or replace function public.refresh_current_prices()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  -- admin pela API, ou o worker (service_role, sem sessão de usuário)
  if not (public.is_admin() or (select auth.role()) = 'service_role') then
    raise exception 'apenas admin' using errcode = '42501';
  end if;
  refresh materialized view concurrently public.current_prices;
end $$;
revoke all on function public.refresh_current_prices() from public, anon;
grant execute on function public.refresh_current_prices() to authenticated;

-- ── price_board: leitura pública com nomes (invoker: respeita RLS de lojas/produtos) ──
create view public.price_board with (security_invoker = true) as
select
  cp.store_id,
  cp.product_id,
  cp.price_cents,
  cp.unit_price_cents,
  cp.promo,
  cp.valid_to,
  cp.observed_at,
  cp.confidence,
  s.name          as store_name,
  s.city_id,
  s.neighborhood  as store_neighborhood,
  p.canonical_name,
  p.brand,
  p.size_value,
  p.size_unit,
  p.base_unit,
  p.category_id
from public.current_prices cp
join public.stores   s on s.id = cp.store_id   and s.status = 'active'
join public.products p on p.id = cp.product_id and p.status = 'active';

grant select on public.price_board to anon, authenticated;

-- ── Histórico de preço (somente aprovados; não expõe quem contribuiu) ───────
create or replace function public.price_history(
  p_product_id uuid,
  p_store_id   uuid default null,
  p_days       integer default 90
)
returns table (
  store_id uuid, price_cents integer, unit_price_cents integer,
  promo boolean, observed_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select po.store_id, po.price_cents, po.unit_price_cents, po.promo, po.observed_at
  from public.price_observations po
  join public.stores s on s.id = po.store_id and s.status = 'active'
  where po.product_id = p_product_id
    and po.status in ('approved', 'superseded')
    and (p_store_id is null or po.store_id = p_store_id)
    and po.observed_at >= now() - make_interval(days => least(greatest(p_days, 1), 365))
  order by po.observed_at
$$;
revoke all on function public.price_history(uuid, uuid, integer) from public;
grant execute on function public.price_history(uuid, uuid, integer) to anon, authenticated;

-- ── Busca com tolerância a erro de digitação e sem acento ───────────────────
create or replace function public.search_products(p_query text, p_limit integer default 20)
returns table (
  product_id uuid, canonical_name text, brand text, size_value numeric,
  size_unit public.size_unit, base_unit public.base_unit, category_id uuid,
  score real, min_unit_price_cents integer, store_count integer
)
language sql stable
set search_path = public, extensions
as $$
  with q as (
    select f_unaccent(lower(left(trim(p_query), 80))) as term
  ),
  hits as (
    select
      p.*,
      f_unaccent(lower(p.canonical_name || ' ' || coalesce(p.brand, ''))) as haystack,
      q.term
    from products p, q
    where p.status = 'active'
      and length(q.term) >= 2
      and (
        f_unaccent(lower(p.canonical_name || ' ' || coalesce(p.brand, ''))) like
          '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or f_unaccent(lower(p.canonical_name || ' ' || coalesce(p.brand, ''))) % q.term
      )
  )
  select
    h.id, h.canonical_name, h.brand, h.size_value, h.size_unit, h.base_unit, h.category_id,
    (similarity(h.haystack, h.term)
      + case when h.haystack like replace(replace(replace(h.term, '\', '\\'), '%', '\%'), '_', '\_') || '%' then 1 else 0 end)::real as score,
    (select min(cp.unit_price_cents) from current_prices cp where cp.product_id = h.id)::integer,
    (select count(*) from current_prices cp where cp.product_id = h.id)::integer
  from hits h
  order by score desc, h.canonical_name
  limit least(greatest(p_limit, 1), 50)
$$;
revoke all on function public.search_products(text, integer) from public;
grant execute on function public.search_products(text, integer) to anon, authenticated;

-- ── Comparação de lista ─────────────────────────────────────────────────────
-- Entrada: [{"product_id": "...", "quantity": 2}, ...] (+ localização opcional, usada só
-- na consulta e nunca gravada). Saída: total por mercado, melhor mercado único e melhor
-- divisão entre dois mercados, com economia e distância extra.
-- Espelha packages/domain/src/compare.ts (empates podem desempatar diferente).
create or replace function public.compare_list(
  p_items jsonb,
  p_lat   double precision default null,
  p_lng   double precision default null
)
returns jsonb
language plpgsql stable
set search_path = public, extensions
as $$
declare
  v_result jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items deve ser um array JSON' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'lista excede 100 itens' using errcode = '22023';
  end if;
  if (p_lat is not null and p_lat not between -90 and 90)
     or (p_lng is not null and p_lng not between -180 and 180) then
    raise exception 'coordenadas inválidas' using errcode = '22023';
  end if;

  with
  items as (
    select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) e
    where (e ->> 'quantity')::integer >= 1
    group by 1
  ),
  n_items as (select count(*)::integer as n from items),
  me as (
    select case when p_lat is not null and p_lng is not null
                then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as geo
  ),
  active_stores as (
    select s.id, s.name,
           case when me.geo is not null then round(st_distance(s.location, me.geo))::integer end as dist
    from stores s cross join me
    where s.status = 'active'
  ),
  prices as (
    select cp.store_id, cp.product_id, cp.price_cents
    from current_prices cp join items i on i.product_id = cp.product_id
  ),
  totals as (
    select a.id as store_id, a.name, a.dist,
           coalesce(sum(p.price_cents::bigint * i.quantity), 0)::integer as total_cents,
           count(p.product_id)::integer as found_count,
           coalesce(array_agg(i.product_id order by i.product_id) filter (where p.product_id is null),
                    '{}'::uuid[]) as missing_ids
    from active_stores a
    cross join items i
    left join prices p on p.store_id = a.id and p.product_id = i.product_id
    group by a.id, a.name, a.dist
  ),
  ranked as (
    select t.*,
           cardinality(t.missing_ids) as missing_count,
           row_number() over (
             order by cardinality(t.missing_ids), t.total_cents, t.dist nulls last, t.store_id
           ) as rk
    from totals t
  ),
  single as (select * from ranked where found_count > 0 order by rk limit 1),
  top_stores as (select * from ranked where found_count > 0 order by rk limit 10),
  pair_rows as (
    select a.store_id as a_id, b.store_id as b_id, a.dist as a_dist, b.dist as b_dist,
           i.product_id, i.quantity, pa.price_cents as price_a, pb.price_cents as price_b
    from top_stores a
    join top_stores b on a.store_id < b.store_id
    cross join items i
    left join prices pa on pa.store_id = a.store_id and pa.product_id = i.product_id
    left join prices pb on pb.store_id = b.store_id and pb.product_id = i.product_id
  ),
  pair_agg as (
    select a_id, b_id, max(a_dist) as a_dist, max(b_dist) as b_dist,
           coalesce(sum(least(price_a, price_b)::bigint * quantity), 0)::integer as total_cents,
           (count(*) filter (where price_a is null and price_b is null))::integer as missing_count,
           count(distinct case
                   when price_a is null and price_b is null then null
                   when price_b is null or (price_a is not null and price_a <= price_b) then a_id
                   else b_id
                 end)::integer as stores_used
    from pair_rows
    group by a_id, b_id
  ),
  best_pair as (
    select pa.*, s.total_cents as single_total, s.dist as single_dist
    from pair_agg pa cross join single s
    where pa.stores_used = 2
      and (pa.missing_count < s.missing_count
           or (pa.missing_count = s.missing_count and pa.total_cents < s.total_cents))
    order by pa.missing_count, pa.total_cents, pa.a_id, pa.b_id
    limit 1
  )
  select jsonb_build_object(
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'store_id', r.store_id, 'name', r.name, 'total_cents', r.total_cents,
        'found_count', r.found_count, 'missing_product_ids', to_jsonb(r.missing_ids),
        'complete', (r.missing_count = 0 and (select n from n_items) > 0),
        'distance_meters', r.dist
      ) order by r.rk) from ranked r
    ), '[]'::jsonb),
    'best_single', (
      select jsonb_build_object(
        'store_id', r.store_id, 'name', r.name, 'total_cents', r.total_cents,
        'found_count', r.found_count, 'missing_product_ids', to_jsonb(r.missing_ids),
        'complete', (r.missing_count = 0 and (select n from n_items) > 0),
        'distance_meters', r.dist
      ) from single r
    ),
    'best_split', (
      select jsonb_build_object(
        'store_ids', jsonb_build_array(bp.a_id, bp.b_id),
        'total_cents', bp.total_cents,
        'savings_cents', greatest(0, bp.single_total - bp.total_cents),
        'extra_distance_meters',
          case when bp.a_dist is not null and bp.b_dist is not null and bp.single_dist is not null
               then greatest(0, bp.a_dist + bp.b_dist - bp.single_dist) end,
        'missing_product_ids', coalesce((
          select jsonb_agg(pr.product_id order by pr.product_id) from pair_rows pr
          where pr.a_id = bp.a_id and pr.b_id = bp.b_id
            and pr.price_a is null and pr.price_b is null
        ), '[]'::jsonb),
        'assignments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'product_id', pr.product_id,
            'store_id', case when pr.price_b is null or (pr.price_a is not null and pr.price_a <= pr.price_b)
                             then pr.a_id else pr.b_id end,
            'price_cents', least(pr.price_a, pr.price_b),
            'quantity', pr.quantity
          ) order by pr.product_id)
          from pair_rows pr
          where pr.a_id = bp.a_id and pr.b_id = bp.b_id
            and (pr.price_a is not null or pr.price_b is not null)
        ), '[]'::jsonb)
      ) from best_pair bp
    )
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.compare_list(jsonb, double precision, double precision) from public;
grant execute on function public.compare_list(jsonb, double precision, double precision) to anon, authenticated;
