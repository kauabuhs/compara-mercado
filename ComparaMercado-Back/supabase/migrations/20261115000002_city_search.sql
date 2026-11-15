-- 0025 · Busca na biblioteca de cidades, leitura pública e ativação por cobertura (ADR-0014)
--
--  1. As cidades passam a ser dado de referência público: a biblioteca inteira (inclusive as ainda
--     desabilitadas) é legível por qualquer pessoa. A política antiga escondia as desabilitadas.
--     `active` continua significando "habilitada no comparador"; é só o que o comparador filtra.
--  2. `search_cities`: busca sem acento, por prefixo ou parte do nome, tolerante a erro de digitação.
--     Sem texto, devolve as cidades que já têm mercados (atalhos do seletor).
--  3. Gatilho: quando a primeira loja ATIVA aparece numa cidade BRASILEIRA, ela é habilitada sozinha. O admin
--     ainda pode desabilitá-la depois (o gatilho só age quando uma loja se torna ativa).
--  4. Coluna `name_search` (nome sem acento) e índice de trigramas para a busca.

-- ── 1. Leitura pública da biblioteca ────────────────────────────────────────
drop policy cities_read on public.cities;
create policy cities_read on public.cities for select to anon, authenticated using (true);

-- ── 4. Coluna e índice da busca ─────────────────────────────────────────────
-- Nome sem acento e em minúsculas, calculado uma vez (f_unaccent é imutável): a busca compara
-- 5,5 mil linhas sem refazer `unaccent` em cada uma.
alter table public.cities
  add column name_search text generated always as (public.f_unaccent(lower(name))) stored;
create index cities_name_search_trgm on public.cities
  using gin (name_search extensions.gin_trgm_ops);
create index cities_uf_idx on public.cities (uf);

-- ── 2. Busca ────────────────────────────────────────────────────────────────
-- p_query vazio (ou < 2 letras) + sem UF  → cidades com mercados, as mais cobertas primeiro.
-- p_query vazio + UF                      → cidades da UF (as com mercados primeiro, depois por nome).
-- p_query com 2+ letras                   → prefixo > parte do nome > aproximação (typo).
-- A contagem de mercados só é lida para o que sobra do LIMIT (e para o ranking sem texto).
create or replace function public.search_cities(
  p_query text default '',
  p_uf    text default null,
  p_limit integer default 20
)
returns table (
  id           uuid,
  name         text,
  uf           text,
  ibge_code    text,
  active       boolean,
  store_count  integer,
  center_lat   double precision,
  center_lng   double precision,
  score        real
)
language sql stable
set search_path = public, extensions
as $$
  with q as (
    select
      f_unaccent(lower(left(trim(coalesce(p_query, '')), 80))) as term,
      nullif(upper(trim(coalesce(p_uf, ''))), '') as uf,
      least(greatest(coalesce(p_limit, 20), 1), 50) as lim
  ),
  esc as (
    select replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') as pat from q
  ),
  cover as (
    select s.city_id, count(*)::integer as n
    from stores s
    where s.status = 'active'
    group by s.city_id
  ),
  matched as (
    -- com texto
    select
      c.id,
      (similarity(c.name_search, q.term)
        + word_similarity(q.term, c.name_search)
        + case when c.name_search like esc.pat || '%' then 2 else 0 end
        + case when c.name_search like '%' || esc.pat || '%' then 1 else 0 end)::real as score
    from cities c, q, esc
    where length(q.term) >= 2
      and c.country_code = 'BR'
      and (q.uf is null or c.uf = q.uf)
      and (c.name_search like '%' || esc.pat || '%'
           or word_similarity(q.term, c.name_search) >= 0.5
           or similarity(c.name_search, q.term) >= 0.4)
    union all
    -- sem texto: a UF inteira, ou só as cidades que já têm mercados
    select c.id, coalesce(cv.n, 0)::real
    from cities c
    cross join q
    left join cover cv on cv.city_id = c.id
    where length(q.term) < 2
      and c.country_code = 'BR'
      and (q.uf is null or c.uf = q.uf)
      and (q.uf is not null or cv.n > 0)
  )
  select
    c.id, c.name, c.uf::text, c.ibge_code, c.active, coalesce(cv.n, 0),
    c.center_lat, c.center_lng, m.score
  from matched m
  join cities c on c.id = m.id
  left join cover cv on cv.city_id = c.id
  order by m.score desc, c.name, c.id
  limit (select lim from q)
$$;
revoke all on function public.search_cities(text, text, integer) from public;
grant execute on function public.search_cities(text, text, integer) to anon, authenticated;

-- ── 3. Habilitar a cidade quando a primeira loja ativa aparece ───────────────
create or replace function public.stores_sync_city_active()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active' or old.city_id is distinct from new.city_id) then
    -- Só cidades brasileiras: a biblioteca é do IBGE, e uma cidade de outro país mistura moedas no
    -- comparador, então essa habilitação continua manual (admin).
    update public.cities set active = true
     where id = new.city_id and not active and country_code = 'BR';
  end if;
  return null;
end $$;
revoke all on function public.stores_sync_city_active() from public, anon, authenticated;

create trigger stores_ai_au_city_active after insert or update of status, city_id on public.stores
  for each row execute function public.stores_sync_city_active();
