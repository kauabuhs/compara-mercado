-- Busca: tolerância real a erro de digitação.
-- Antes, `%` comparava a consulta com a string inteira ("leite integral campo bom"); uma
-- consulta curta com letras trocadas ("leiet") ficava abaixo do limiar e não achava nada.
-- Agora usamos word_similarity (`<%`), que compara com a melhor palavra/trecho do nome,
-- com limiar 0,5 explícito (0,4 casava o catálogo inteiro com ruído) (o GUC do pg_trgm não pode ser fixado por migration no Supabase).
-- Custo: o ramo fuzzy não usa o índice GIN (só o LIKE usa); ok para catálogo de MVP (dezenas de milhares de linhas). Reavaliar se crescer.
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
        or word_similarity(q.term, f_unaccent(lower(p.canonical_name || ' ' || coalesce(p.brand, '')))) >= 0.5
      )
  )
  select
    h.id, h.canonical_name, h.brand, h.size_value, h.size_unit, h.base_unit, h.category_id,
    (word_similarity(h.term, h.haystack)
      + similarity(h.haystack, h.term)
      + case when h.haystack like replace(replace(replace(h.term, '\', '\\'), '%', '\%'), '_', '\_') || '%' then 1 else 0 end)::real as score,
    (select min(cp.unit_price_cents) from current_prices cp where cp.product_id = h.id)::integer,
    (select count(*) from current_prices cp where cp.product_id = h.id)::integer
  from hits h
  order by score desc, h.canonical_name
  limit least(greatest(p_limit, 1), 50)
$$;
revoke all on function public.search_products(text, integer) from public;
grant execute on function public.search_products(text, integer) to anon, authenticated;
