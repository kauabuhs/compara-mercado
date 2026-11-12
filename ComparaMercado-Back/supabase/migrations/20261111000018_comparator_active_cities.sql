-- 0018 · O comparador considera apenas lojas de cidades ATIVAS
--
-- Com mercados multi-país (0009), existem lojas fora da cidade piloto. `cities.active` é a
-- chave que habilita uma cidade no comparador; `compare_list` ignorava essa chave e comparava
-- toda loja ativa, o que misturaria lojas (e moedas) de outros países. Passa a respeitá-la.
-- Mesma assinatura e mesmos privilégios (CREATE OR REPLACE); única mudança: o JOIN com cities.
-- Dados atuais não mudam: todas as lojas existentes estão em cidade ativa.

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
    from stores s
    join cities c on c.id = s.city_id and c.active      -- só cidades habilitadas no comparador
    cross join me
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
