-- 0019 · Listagens paginadas no servidor: ofertas e busca de produtos
--
-- Até aqui a API devolvia no máximo 100 ofertas / 30 produtos e o navegador filtrava e ordenava.
-- Com uma cidade grande (dezenas de mercados, milhares de ofertas) isso não escala: o filtro, a
-- ordenação e a página passam a ser decididos aqui, e cada linha traz `total_count` para a
-- paginação numerada (uma só consulta, sem `count` separado).
--
-- Busca: se ALGUM item contém o texto digitado (sem acento, sem diferenciar maiúsculas), só esses
-- aparecem. A busca aproximada (erro de digitação, pg_trgm) é FALLBACK, usada apenas quando nada
-- contém o texto. Sem isso o limiar fuzzy (0,5) enche a lista de ruído ("sabao" trazia bolacha e
-- cerveja) e o ruído inflaria o total da paginação.
--
-- As funções antigas (`search_products(text, integer)`) continuam existindo: nada quebra para quem
-- ainda as chama. As novas têm sufixo `_page`.

-- ── Ofertas vigentes (promoções), com busca, filtro, ordenação e página ────────
create or replace function public.list_offers_page(
  p_store_id uuid    default null,
  p_query    text    default null,
  p_expiring boolean default false,          -- só as que vencem em até 3 dias
  p_sort     text    default 'featured',     -- featured | price | validity | recent
  p_limit    integer default 20,
  p_offset   integer default 0
)
returns table (
  store_id uuid, product_id uuid, price_cents integer, unit_price_cents integer,
  promo boolean, valid_to timestamptz, observed_at timestamptz,
  store_name text, store_neighborhood text, canonical_name text, brand text,
  size_value numeric, size_unit public.size_unit, base_unit public.base_unit,
  category_id uuid, total_count bigint
)
language sql stable
set search_path = public, extensions
as $$
  with q as (
    select nullif(f_unaccent(lower(left(trim(coalesce(p_query, '')), 80))), '') as term
  ),
  base as (
    select
      b.*,
      q.term,
      f_unaccent(lower(b.canonical_name || ' ' || coalesce(b.brand, '') || ' ' || b.store_name)) as haystack
    from price_board b, q
    where b.promo
      and (p_store_id is null or b.store_id = p_store_id)
      and (not coalesce(p_expiring, false)
           or (b.valid_to is not null and b.valid_to >= now() and b.valid_to <= now() + interval '3 days'))
  ),
  flagged as (
    select
      base.*,
      (term is not null
        and haystack like '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%') as is_exact,
      (term is not null and word_similarity(term, haystack) >= 0.5) as is_fuzzy
    from base
  ),
  candidates as (
    select flagged.*, coalesce(bool_or(is_exact) over (), false) as any_exact
    from flagged
    where term is null or is_exact or is_fuzzy
  ),
  hits as (
    select
      c.*,
      case when c.term is null then 0::real
           else (word_similarity(c.term, c.haystack) + case when c.is_exact then 1 else 0 end)::real
      end as relevance
    from candidates c
    -- sem busca: tudo; com busca: as exatas; se não há nenhuma exata, as aproximadas
    where c.term is null or c.is_exact or not c.any_exact
  )
  select
    h.store_id, h.product_id, h.price_cents, h.unit_price_cents, h.promo, h.valid_to, h.observed_at,
    h.store_name, h.store_neighborhood, h.canonical_name, h.brand,
    h.size_value, h.size_unit, h.base_unit, h.category_id,
    count(*) over () as total_count
  from hits h
  order by
    -- "featured" com busca: o mais relevante primeiro; sem busca: o que vence primeiro
    case when p_sort = 'featured' then h.relevance end desc nulls last,
    case when p_sort = 'price'    then h.unit_price_cents end asc,
    case when p_sort = 'recent'   then h.observed_at end desc,
    case when p_sort in ('featured', 'validity') then h.valid_to end asc nulls last,
    -- desempate total: a página 2 nunca repete nem pula itens da página 1
    h.store_name, h.canonical_name, h.store_id, h.product_id
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0)
$$;
revoke all on function public.list_offers_page(uuid, text, boolean, text, integer, integer) from public;
grant execute on function public.list_offers_page(uuid, text, boolean, text, integer, integer)
  to anon, authenticated;

-- ── Busca de produtos com página e filtro "com preço" ──────────────────────────
create or replace function public.search_products_page(
  p_query       text,
  p_limit       integer default 20,
  p_offset      integer default 0,
  p_only_priced boolean default false
)
returns table (
  product_id uuid, canonical_name text, brand text, size_value numeric,
  size_unit public.size_unit, base_unit public.base_unit, category_id uuid,
  score real, min_unit_price_cents integer, store_count integer, total_count bigint
)
language sql stable
set search_path = public, extensions
as $$
  with q as (
    select f_unaccent(lower(left(trim(p_query), 80))) as term
  ),
  flagged as (
    select
      p.*,
      q.term,
      f_unaccent(lower(p.canonical_name || ' ' || coalesce(p.brand, ''))) as haystack,
      (f_unaccent(lower(p.canonical_name || ' ' || coalesce(p.brand, ''))) like
        '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%') as is_exact,
      (word_similarity(q.term, f_unaccent(lower(p.canonical_name || ' ' || coalesce(p.brand, '')))) >= 0.5) as is_fuzzy
    from products p, q
    where p.status = 'active'
      and length(q.term) >= 2
  ),
  candidates as (
    select flagged.*, coalesce(bool_or(is_exact) over (), false) as any_exact
    from flagged
    where is_exact or is_fuzzy
  ),
  hits as (
    select c.* from candidates c
    -- se algum produto contém o texto, só esses; senão, os aproximados (erro de digitação)
    where c.is_exact or not c.any_exact
  ),
  priced as (
    select
      h.*,
      (select min(cp.unit_price_cents) from current_prices cp where cp.product_id = h.id)::integer as min_unit,
      (select count(*) from current_prices cp where cp.product_id = h.id)::integer as stores
    from hits h
  )
  select
    d.id, d.canonical_name, d.brand, d.size_value, d.size_unit, d.base_unit, d.category_id,
    (word_similarity(d.term, d.haystack)
      + similarity(d.haystack, d.term)
      + case when d.haystack like replace(replace(replace(d.term, '\', '\\'), '%', '\%'), '_', '\_') || '%' then 1 else 0 end)::real as score,
    d.min_unit,
    d.stores,
    count(*) over () as total_count
  from priced d
  where not coalesce(p_only_priced, false) or d.min_unit is not null
  order by score desc, d.canonical_name, d.id
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0)
$$;
revoke all on function public.search_products_page(text, integer, integer, boolean) from public;
grant execute on function public.search_products_page(text, integer, integer, boolean)
  to anon, authenticated;
