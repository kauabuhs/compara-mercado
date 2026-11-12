-- 0015 · Resolução de preço (lista + promoção), ofertas vigentes e registro de execução de jobs
--
-- Regras de resolução (determinísticas: o mesmo estado sempre dá o mesmo preço)
--  1. PREÇO DE LISTA de um produto numa loja, no instante T:
--       listas ATIVAS do mercado da loja, com preço vigente em T. Vence a lista exclusiva da loja
--       sobre a do mercado; depois maior `priority`; depois o preço de início mais recente.
--  2. PROMOÇÕES aplicáveis: vigentes em T (promotion_is_live), com escopo cobrindo a loja,
--       produto elegível (lista explícita OU marca/categoria-alvo incluindo subcategorias), teto
--       de uso não atingido e condições de quantidade satisfeitas.
--  3. Entre as NÃO acumuláveis aplica-se UMA: a que resulta no menor preço (desempate: maior
--       `priority`, depois id). Em seguida as acumuláveis, em ordem de `priority`.
--  4. Uma promoção nunca eleva o preço, e o resultado nunca é negativo.
--  5. Arredondamento: meio para longe do zero, uma vez por promoção, em unidade menor.
--
-- Fora do escopo desta função (exige o carrinho inteiro, tratado por um motor de carrinho):
-- promoções `bundle_price`, `buy_x_pay_y` e as com regra `min_spend`. Elas existem no modelo e
-- são listadas por list_live_promotions(), mas não entram no preço unitário.

-- ── Registro de execução de jobs ────────────────────────────────────────────
create type public.job_run_status as enum ('running', 'succeeded', 'failed');

create table public.job_runs (
  id           uuid primary key default gen_random_uuid(),
  job_name     text not null,
  run_key      text unique,                       -- chave de idempotência (ex.: id do job no pg-boss)
  status       public.job_run_status not null default 'running',
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  affected     integer check (affected >= 0),
  error        text check (error is null or length(error) <= 500),
  check ((status = 'running') = (finished_at is null))
);
-- "últimas execuções do job X" e detecção de job parado
create index job_runs_job_idx on public.job_runs (job_name, started_at desc);

create or replace function public.job_run_start(p_job_name text, p_run_key text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.job_runs (job_name, run_key) values (p_job_name, p_run_key)
  on conflict (run_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.job_runs where run_key = p_run_key;   -- reexecução da mesma chave
  end if;
  return v_id;
end $$;

create or replace function public.job_run_finish(
  p_id uuid, p_status public.job_run_status, p_affected integer default null, p_error text default null
) returns void
language sql
set search_path = ''
as $$
  update public.job_runs
  set status = p_status, finished_at = now(), affected = p_affected, error = left(p_error, 500)
  where id = p_id and status = 'running'
$$;

alter table public.job_runs enable row level security;
grant select on public.job_runs to authenticated;
create policy job_runs_admin_sel on public.job_runs for select to authenticated using ((select public.is_admin()));
revoke all on function public.job_run_start(text, text) from public, anon, authenticated;
revoke all on function public.job_run_finish(uuid, public.job_run_status, integer, text) from public, anon, authenticated;
grant execute on function public.job_run_start(text, text) to service_role;
grant execute on function public.job_run_finish(uuid, public.job_run_status, integer, text) to service_role;

-- ── Auxiliares ──────────────────────────────────────────────────────────────

-- categoria + ancestrais (promoção na categoria "Bebidas" vale para "Refrigerantes")
create or replace function public.category_ancestry(p_category_id uuid)
returns uuid[]
language sql stable
set search_path = ''
as $$
  with recursive up as (
    select c.id, c.parent_id, 1 as depth from public.categories c where c.id = p_category_id
    union all
    select c.id, c.parent_id, up.depth + 1 from public.categories c join up on c.id = up.parent_id
    where up.depth < 10                     -- trava contra ciclos
  )
  select coalesce(array_agg(id), '{}'::uuid[]) from up
$$;

-- preço depois de aplicar UMA promoção unitária (nunca sobe, nunca negativo)
create or replace function public.apply_promotion_unit(
  p_kind public.promotion_kind, p_percent numeric, p_amount bigint, p_fixed bigint, p_price bigint
) returns bigint
language sql immutable parallel safe
set search_path = ''
as $$
  select greatest(0, least(p_price, case p_kind
    when 'percent_off' then p_price - public.money_round(p_price * p_percent / 100)
    when 'amount_off'  then p_price - p_amount
    when 'fixed_price' then p_fixed
    else p_price
  end))
$$;

create or replace function public.promotion_candidates(
  p_store_id uuid, p_market_id uuid, p_product_id uuid, p_at timestamptz, p_quantity integer
) returns table (
  id uuid, kind public.promotion_kind, discount_percent numeric, discount_amount_minor bigint,
  fixed_price_minor bigint, stackable boolean, priority smallint, ends_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.kind, p.discount_percent, p.discount_amount_minor, p.fixed_price_minor,
         p.stackable, p.priority, p.ends_at
  from public.promotions p
  where public.promotion_is_live(p.status, p.starts_at, p.ends_at, p_at)
    and p.kind in ('percent_off', 'amount_off', 'fixed_price')
    and (p.usage_limit_total is null or p.usage_count < p.usage_limit_total)
    and exists (select 1 from public.promotion_scopes sc
                where sc.promotion_id = p.id and sc.market_id = p_market_id
                  and (sc.store_id is null or sc.store_id = p_store_id))
    and (
      exists (select 1 from public.promotion_products pp
              where pp.promotion_id = p.id and pp.product_id = p_product_id)
      or exists (select 1 from public.promotion_rules r
                 join public.products pr on pr.id = p_product_id
                 where r.promotion_id = p.id and (
                   (r.kind = 'target_brand' and r.brand_id = pr.brand_id)
                   or (r.kind = 'target_category'
                       and r.category_id = any (public.category_ancestry(pr.category_id)))))
    )
    and not exists (select 1 from public.promotion_rules r
                    where r.promotion_id = p.id and r.kind = 'min_spend')          -- motor de carrinho
    and not exists (select 1 from public.promotion_rules r
                    where r.promotion_id = p.id and r.kind = 'min_quantity' and r.quantity > p_quantity)
$$;
revoke all on function public.category_ancestry(uuid) from public, anon;
revoke all on function public.promotion_candidates(uuid, uuid, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.category_ancestry(uuid) to authenticated, service_role;
grant execute on function public.apply_promotion_unit(public.promotion_kind, numeric, bigint, bigint, bigint) to anon, authenticated, service_role;

-- ── Preço final por loja ────────────────────────────────────────────────────
create or replace function public.resolve_prices(
  p_store_id     uuid,
  p_product_ids  uuid[],
  p_at           timestamptz default now(),
  p_quantity     integer default 1
) returns table (
  product_id              uuid,
  currency_code           char(3),
  list_price_minor        bigint,
  price_list_id           uuid,
  final_price_minor       bigint,
  discount_minor          bigint,
  applied_promotion_ids   uuid[],
  valid_until             timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_market   uuid;
  v_cur      char(3);
  v_pid      uuid;
  v_list_id  uuid;
  v_amount   bigint;
  v_until    timestamptz;
  v_price    bigint;
  v_applied  uuid[];
  v_new      bigint;
  v_took_best boolean;
  c          record;
begin
  if p_product_ids is null or cardinality(p_product_ids) > 200 then
    raise exception 'informe de 1 a 200 produtos' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity not between 1 and 9999 then
    raise exception 'quantidade fora do intervalo 1..9999' using errcode = '22023';
  end if;

  select s.market_id, m.currency_code into v_market, v_cur
  from public.stores s join public.markets m on m.id = s.market_id
  where s.id = p_store_id and s.status = 'active' and m.status = 'active';
  if not found then return; end if;

  foreach v_pid in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_product_ids) x) loop
    select pl.id, pp.amount_minor, pp.valid_to
      into v_list_id, v_amount, v_until
    from public.price_lists pl
    join public.product_prices pp
      on pp.price_list_id = pl.id and pp.product_id = v_pid
     and tstzrange(pp.valid_from, pp.valid_to, '[)') @> p_at
    where pl.market_id = v_market and pl.status = 'active'
      and (pl.store_id is null or pl.store_id = p_store_id)
    order by (pl.store_id is not null) desc, pl.priority desc, pp.valid_from desc, pl.id
    limit 1;
    if not found then continue; end if;          -- sem preço publicado: o produto não aparece

    v_price := v_amount;
    v_applied := '{}';

    -- Uma única leitura dos candidatos, já ordenada: primeiro as NÃO acumuláveis (menor preço
    -- final primeiro; só a melhor é aplicada), depois as acumuláveis por prioridade.
    v_took_best := false;
    for c in
      select x.id, x.ends_at, x.stackable, x.kind, x.discount_percent, x.discount_amount_minor, x.fixed_price_minor,
             public.apply_promotion_unit(x.kind, x.discount_percent, x.discount_amount_minor, x.fixed_price_minor, v_amount) as solo_price
      from public.promotion_candidates(p_store_id, v_market, v_pid, p_at, p_quantity) x
      order by x.stackable,
               case when not x.stackable then public.apply_promotion_unit(x.kind, x.discount_percent, x.discount_amount_minor, x.fixed_price_minor, v_amount) end asc,
               x.priority desc, x.id
    loop
      if not c.stackable then
        if v_took_best then continue; end if;       -- só uma não acumulável
        v_took_best := true;
      end if;
      v_new := public.apply_promotion_unit(c.kind, c.discount_percent, c.discount_amount_minor, c.fixed_price_minor, v_price);
      if v_new < v_price then
        v_price := v_new;
        v_applied := v_applied || c.id;
        v_until := least(v_until, c.ends_at);
      end if;
    end loop;

    product_id := v_pid;
    currency_code := v_cur;
    list_price_minor := v_amount;
    price_list_id := v_list_id;
    final_price_minor := v_price;
    discount_minor := v_amount - v_price;
    applied_promotion_ids := v_applied;
    valid_until := v_until;
    return next;
  end loop;
end $$;

revoke all on function public.resolve_prices(uuid, uuid[], timestamptz, integer) from public;
grant execute on function public.resolve_prices(uuid, uuid[], timestamptz, integer) to anon, authenticated, service_role;

-- ── Ofertas vigentes de uma loja (somente campos públicos) ──────────────────
create or replace function public.list_live_promotions(p_store_id uuid, p_limit integer default 50)
returns table (
  id uuid, name text, description text, kind public.promotion_kind,
  discount_percent numeric, discount_amount_minor bigint, fixed_price_minor bigint,
  currency_code char(3), starts_at timestamptz, ends_at timestamptz, product_ids uuid[]
)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.name, p.description, p.kind, p.discount_percent, p.discount_amount_minor,
         p.fixed_price_minor, p.currency_code, p.starts_at, p.ends_at,
         coalesce((select array_agg(pp.product_id order by pp.product_id)
                   from public.promotion_products pp where pp.promotion_id = p.id), '{}')
  from public.promotions p
  join public.stores s on s.id = p_store_id and s.status = 'active'
  where public.promotion_is_live(p.status, p.starts_at, p.ends_at, now())
    and (p.usage_limit_total is null or p.usage_count < p.usage_limit_total)
    and exists (select 1 from public.promotion_scopes sc
                where sc.promotion_id = p.id and sc.market_id = s.market_id
                  and (sc.store_id is null or sc.store_id = s.id))
  order by p.ends_at nulls last, p.starts_at, p.id
  limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.list_live_promotions(uuid, integer) from public;
grant execute on function public.list_live_promotions(uuid, integer) to anon, authenticated, service_role;
