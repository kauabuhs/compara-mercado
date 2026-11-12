-- 0012 · Promoções: ciclo de vida, vigência, escopo (mercado/loja), elegibilidade e uso
--
-- Códigos SQLSTATE próprios (classe PR/ST, ver docs/database/promocoes.md):
--   PR001 promoção indisponível (fora da vigência, não ativa ou limite total atingido)
--   PR002 limite por cliente atingido        PR003 promoção não vale nesta loja
--
-- VIGÊNCIA É CALCULADA, NÃO ARMAZENADA. `status` é o ciclo de vida editorial (rascunho, ativa,
-- pausada…). Se uma promoção está APLICÁVEL agora é sempre `promotion_is_live(...)`, sobre
-- UTC, intervalo semiaberto [starts_at, ends_at). Assim uma oferta vencida deixa de valer no
-- instante do vencimento, mesmo que o job de expiração esteja parado.

create type public.promotion_kind   as enum ('percent_off', 'amount_off', 'fixed_price', 'bundle_price', 'buy_x_pay_y');
create type public.promotion_status as enum ('draft', 'active', 'paused', 'expired', 'cancelled');
create type public.promotion_rule_kind as enum ('target_category', 'target_brand', 'min_quantity', 'min_spend');

create or replace function public.promotion_is_live(
  p_status promotion_status, p_starts_at timestamptz, p_ends_at timestamptz,
  p_at timestamptz default now()
) returns boolean
language sql immutable parallel safe
set search_path = ''
as $$ select p_status = 'active' and p_starts_at <= p_at and (p_ends_at is null or p_at < p_ends_at) $$;

-- Converte data/hora LOCAL de um mercado em instante UTC (entrada do admin → armazenamento).
create or replace function public.market_local_to_utc(p_market_id uuid, p_local timestamp)
returns timestamptz
language sql stable
set search_path = ''
as $$ select p_local at time zone (select timezone from public.markets where id = p_market_id) $$;

-- ── Promoções ───────────────────────────────────────────────────────────────
create table public.promotions (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null check (length(trim(name)) > 0),
  description                text,
  kind                       public.promotion_kind not null,
  currency_code              char(3) references public.currencies (code),   -- só tipos com valor monetário
  discount_percent           numeric(5, 2) check (discount_percent > 0 and discount_percent <= 100),
  discount_amount_minor      bigint check (discount_amount_minor > 0),
  fixed_price_minor          bigint check (fixed_price_minor >= 0),          -- preço unitário ou do combo
  buy_quantity               integer check (buy_quantity > 0),                -- "leve X pague Y"
  pay_quantity               integer check (pay_quantity >= 0),
  starts_at                  timestamptz not null,
  ends_at                    timestamptz,
  status                     public.promotion_status not null default 'draft',
  stackable                  boolean not null default false,                  -- acumula com outras
  priority                   smallint not null default 0,
  usage_limit_total          integer check (usage_limit_total > 0),
  usage_limit_per_customer   integer check (usage_limit_per_customer > 0),
  usage_count                integer not null default 0 check (usage_count >= 0),
  created_by                 uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  expired_at                 timestamptz,
  check (ends_at is null or ends_at > starts_at),
  -- o teto de uso vale mesmo se alguém contornar a função de resgate
  check (usage_limit_total is null or usage_count <= usage_limit_total),
  -- cada tipo exige exatamente os seus campos
  check (coalesce(case kind
    when 'percent_off'  then discount_percent is not null and discount_amount_minor is null
                             and fixed_price_minor is null and currency_code is null
                             and buy_quantity is null and pay_quantity is null
    when 'amount_off'   then discount_amount_minor is not null and discount_percent is null
                             and fixed_price_minor is null and currency_code is not null
                             and buy_quantity is null and pay_quantity is null
    when 'fixed_price'  then fixed_price_minor is not null and discount_percent is null
                             and discount_amount_minor is null and currency_code is not null
                             and buy_quantity is null and pay_quantity is null
    when 'bundle_price' then fixed_price_minor is not null and discount_percent is null
                             and discount_amount_minor is null and currency_code is not null
                             and buy_quantity is null and pay_quantity is null
    when 'buy_x_pay_y'  then buy_quantity is not null and pay_quantity is not null
                             and buy_quantity > pay_quantity and discount_percent is null
                             and discount_amount_minor is null and fixed_price_minor is null
                             and currency_code is null
  end, false))
);
-- o conjunto "ativas" é pequeno diante do histórico: índice parcial para a resolução de preço
create index promotions_active_idx on public.promotions (starts_at, ends_at) where status = 'active';
-- varredura do job de expiração: ativas/pausadas que têm data de término
create index promotions_expiry_idx on public.promotions (ends_at) where status in ('active', 'paused') and ends_at is not null;
create trigger promotions_updated_at before update on public.promotions
  for each row execute function public.set_updated_at();

-- Elegibilidade: lista explícita de variantes (e, para combos, a quantidade de cada componente)
create table public.promotion_products (
  promotion_id  uuid not null references public.promotions (id),
  product_id    uuid not null references public.products (id),
  quantity      integer not null default 1 check (quantity > 0),
  primary key (promotion_id, product_id)
);
-- "quais promoções afetam este produto?" (página do produto e detecção de conflitos)
create index promotion_products_product_idx on public.promotion_products (product_id);

-- Regras: alvos por categoria/marca (inclui subcategorias) e condições de quantidade/gasto mínimo
create table public.promotion_rules (
  id            uuid primary key default gen_random_uuid(),
  promotion_id  uuid not null references public.promotions (id),
  kind          public.promotion_rule_kind not null,
  category_id   uuid references public.categories (id),
  brand_id      uuid references public.brands (id),
  quantity      integer check (quantity > 0),
  amount_minor  bigint check (amount_minor > 0),
  check (coalesce(case kind
    when 'target_category' then category_id is not null and brand_id is null and quantity is null and amount_minor is null
    when 'target_brand'    then brand_id is not null and category_id is null and quantity is null and amount_minor is null
    when 'min_quantity'    then quantity is not null and category_id is null and brand_id is null and amount_minor is null
    when 'min_spend'       then amount_minor is not null and category_id is null and brand_id is null and quantity is null
  end, false))
);
create index promotion_rules_promotion_idx on public.promotion_rules (promotion_id);

-- Escopo: em quais mercados (e, opcionalmente, lojas) a promoção vale. store_id nulo = o mercado todo.
create table public.promotion_scopes (
  id            uuid primary key default gen_random_uuid(),
  promotion_id  uuid not null references public.promotions (id),
  market_id     uuid not null references public.markets (id),
  store_id      uuid,
  foreign key (store_id, market_id) references public.stores (id, market_id),
  unique nulls not distinct (promotion_id, market_id, store_id)
);

-- Uso (resgates): somente inclusão
create table public.promotion_usage (
  id              uuid primary key default gen_random_uuid(),
  promotion_id    uuid not null references public.promotions (id),
  user_id         uuid references public.profiles (id) on delete set null,
  store_id        uuid not null references public.stores (id),
  order_ref       text not null check (length(trim(order_ref)) > 0),
  discount_minor  bigint not null check (discount_minor >= 0),
  currency_code   char(3) not null references public.currencies (code),
  used_at         timestamptz not null default now(),
  unique (promotion_id, order_ref)                       -- idempotência por pedido
);
-- limite por cliente: contar usos de (promoção, cliente)
create index promotion_usage_customer_idx on public.promotion_usage (promotion_id, user_id) where user_id is not null;

-- ── Guardas de integridade ──────────────────────────────────────────────────
create or replace function public.promotions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'promoções não são apagadas (histórico/auditoria): cancele ou deixe expirar'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.usage_count <> 0 then
      raise exception 'promoção nasce como rascunho e sem uso; ative depois de definir escopo e produtos'
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- UPDATE: máquina de estados
  if new.status is distinct from old.status then
    ok := (old.status, new.status) in (
      ('draft','active'), ('draft','cancelled'),
      ('active','paused'), ('paused','active'),
      ('active','expired'), ('paused','expired'),
      ('active','cancelled'), ('paused','cancelled'));
    if not ok then
      raise exception 'transição de status inválida: % → %', old.status, new.status using errcode = '23514';
    end if;
    if new.status = 'active' and old.status = 'draft' then
      if not exists (select 1 from public.promotion_scopes where promotion_id = new.id) then
        raise exception 'defina ao menos um escopo (mercado) antes de ativar' using errcode = '23514';
      end if;
      if not exists (select 1 from public.promotion_products where promotion_id = new.id)
         and not exists (select 1 from public.promotion_rules
                         where promotion_id = new.id and kind in ('target_category', 'target_brand')) then
        raise exception 'defina produtos ou alvos (categoria/marca) antes de ativar' using errcode = '23514';
      end if;
    end if;
    if new.status = 'expired' then
      new.expired_at := coalesce(new.expired_at, now());
    end if;
  end if;

  -- Depois de sair do rascunho, o que define o desconto não muda mais (preserva auditoria).
  if old.status <> 'draft' and (
       (new.kind, new.currency_code, new.discount_percent, new.discount_amount_minor,
        new.fixed_price_minor, new.buy_quantity, new.pay_quantity, new.starts_at, new.stackable,
        new.created_at, new.created_by)
       is distinct from
       (old.kind, old.currency_code, old.discount_percent, old.discount_amount_minor,
        old.fixed_price_minor, old.buy_quantity, old.pay_quantity, old.starts_at, old.stackable,
        old.created_at, old.created_by)) then
    raise exception 'regras de desconto de promoção publicada são imutáveis: cancele e crie outra'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger promotions_bi_bu_bd before insert or update or delete on public.promotions
  for each row execute function public.promotions_guard();

-- Filhos só mudam enquanto a promoção é rascunho; escopo respeita a moeda da promoção.
create or replace function public.promotion_children_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.promotion_status;
  v_pid uuid := coalesce(new.promotion_id, old.promotion_id);
  v_currency char(3);
  v_market_currency char(3);
begin
  select status, currency_code into v_status, v_currency from public.promotions where id = v_pid;
  if v_status <> 'draft' then
    raise exception 'promoção % não está em rascunho: escopo, produtos e regras são imutáveis', v_pid
      using errcode = '42501';
  end if;
  if tg_table_name = 'promotion_scopes' and tg_op <> 'DELETE' and v_currency is not null then
    select currency_code into v_market_currency from public.markets where id = new.market_id;
    if v_market_currency <> v_currency then
      raise exception 'promoção em % não pode valer em mercado com moeda %', v_currency, v_market_currency
        using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger promotion_products_guard before insert or update or delete on public.promotion_products
  for each row execute function public.promotion_children_guard();
create trigger promotion_rules_guard before insert or update or delete on public.promotion_rules
  for each row execute function public.promotion_children_guard();
create trigger promotion_scopes_guard before insert or update or delete on public.promotion_scopes
  for each row execute function public.promotion_children_guard();

create or replace function public.append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% é somente inclusão', tg_table_name using errcode = '42501';
end $$;
create trigger promotion_usage_append_only before update or delete on public.promotion_usage
  for each row execute function public.append_only();

-- ── Expiração (idempotente) ─────────────────────────────────────────────────
-- Complementa a vigência calculada: marca como `expired` o que já passou do fim. Pode rodar
-- 0, 1 ou N vezes sem efeito colateral. O registro da execução é feito por job_runs (0015).
create or replace function public.expire_promotions(p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare v_count integer;
begin
  update public.promotions
  set status = 'expired', expired_at = p_now
  where status in ('active', 'paused') and ends_at is not null and ends_at <= p_now;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ── Resgate com limite atômico ──────────────────────────────────────────────
create or replace function public.redeem_promotion(
  p_promotion_id    uuid,
  p_order_ref       text,
  p_store_id        uuid,
  p_user_id         uuid,
  p_discount_minor  bigint,
  p_at              timestamptz default now()
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_promo   public.promotions;
  v_market  uuid;
  v_cur     char(3);
  v_used    integer;
  v_id      uuid;
begin
  -- idempotente: o mesmo pedido não consome o limite duas vezes
  select id into v_id from public.promotion_usage
  where promotion_id = p_promotion_id and order_ref = p_order_ref;
  if found then return v_id; end if;

  select * into v_promo from public.promotions where id = p_promotion_id;
  if not found then
    raise exception 'promoção inexistente' using errcode = 'PR001';
  end if;

  select s.market_id, m.currency_code into v_market, v_cur
  from public.stores s join public.markets m on m.id = s.market_id
  where s.id = p_store_id;
  if not exists (select 1 from public.promotion_scopes sc
                 where sc.promotion_id = p_promotion_id and sc.market_id = v_market
                   and (sc.store_id is null or sc.store_id = p_store_id)) then
    raise exception 'promoção não vale nesta loja' using errcode = 'PR003';
  end if;

  if v_promo.usage_limit_per_customer is not null then
    if p_user_id is null then
      raise exception 'promoção com limite por cliente exige cliente identificado' using errcode = 'PR002';
    end if;
    -- serializa resgates do mesmo cliente/promoção para não furar o limite em paralelo
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_promotion_id::text || p_user_id::text, 0));
    select count(*) into v_used from public.promotion_usage
    where promotion_id = p_promotion_id and user_id = p_user_id;
    if v_used >= v_promo.usage_limit_per_customer then
      raise exception 'limite por cliente atingido' using errcode = 'PR002';
    end if;
  end if;

  -- um único UPDATE condicional: valida vigência e teto total no mesmo instante em que reserva a vaga
  update public.promotions
  set usage_count = usage_count + 1
  where id = p_promotion_id
    and public.promotion_is_live(status, starts_at, ends_at, p_at)
    and (usage_limit_total is null or usage_count < usage_limit_total);
  if not found then
    raise exception 'promoção indisponível (fora da vigência, inativa ou esgotada)' using errcode = 'PR001';
  end if;

  insert into public.promotion_usage (promotion_id, user_id, store_id, order_ref, discount_minor, currency_code, used_at)
  values (p_promotion_id, p_user_id, p_store_id, p_order_ref, p_discount_minor, v_cur, p_at)
  returning id into v_id;
  return v_id;
end $$;

-- ── Conflitos: outras promoções NÃO acumuláveis que se sobrepõem a esta ─────
-- Sobreposição é permitida (a resolução de preço é determinística), mas o admin deve ver o
-- conflito antes de ativar. Cobre produtos listados explicitamente.
create or replace function public.promotion_conflicts(p_promotion_id uuid)
returns table (other_promotion_id uuid, product_id uuid, market_id uuid, overlap tstzrange)
language sql stable
set search_path = ''
as $$
  select o.id, pa.product_id, sa.market_id,
         tstzrange(a.starts_at, a.ends_at, '[)') * tstzrange(o.starts_at, o.ends_at, '[)')
  from public.promotions a
  join public.promotion_products pa on pa.promotion_id = a.id
  join public.promotion_scopes   sa on sa.promotion_id = a.id
  join public.promotion_products po on po.product_id = pa.product_id and po.promotion_id <> a.id
  join public.promotions o on o.id = po.promotion_id and o.status in ('draft', 'active', 'paused')
  join public.promotion_scopes   so on so.promotion_id = o.id and so.market_id = sa.market_id
       and (so.store_id is null or sa.store_id is null or so.store_id = sa.store_id)
  where a.id = p_promotion_id
    and not (a.stackable and o.stackable)
    and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(o.starts_at, o.ends_at, '[)')
$$;

-- ── Segurança ───────────────────────────────────────────────────────────────
-- O público não lê as tabelas (têm contadores e regras internas): lê resolve_prices() e
-- list_live_promotions() (0015).
alter table public.promotions         enable row level security;
alter table public.promotion_products enable row level security;
alter table public.promotion_rules    enable row level security;
alter table public.promotion_scopes   enable row level security;
alter table public.promotion_usage    enable row level security;

grant select, insert on public.promotions to authenticated;
-- usage_count só muda por redeem_promotion (service_role); o admin edita nome/descrição/status/fim/prioridade
grant update (name, description, status, ends_at, priority, usage_limit_total, usage_limit_per_customer, expired_at)
  on public.promotions to authenticated;
grant select, insert, update, delete on public.promotion_products, public.promotion_rules,
  public.promotion_scopes to authenticated;
grant select on public.promotion_usage to authenticated;

create policy promotions_admin_sel on public.promotions for select to authenticated using ((select public.is_admin()));
create policy promotions_admin_ins on public.promotions for insert to authenticated with check ((select public.is_admin()));
create policy promotions_admin_upd on public.promotions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy promotion_usage_admin_sel on public.promotion_usage for select to authenticated using ((select public.is_admin()));

do $$
declare t text;
begin
  foreach t in array array['promotion_products', 'promotion_rules', 'promotion_scopes'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_admin()))', t || '_admin_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_admin_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_admin_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t || '_admin_del', t);
  end loop;
end $$;

revoke all on function public.expire_promotions(timestamptz) from public, anon;
revoke all on function public.redeem_promotion(uuid, text, uuid, uuid, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.promotion_conflicts(uuid) from public, anon;
grant execute on function public.expire_promotions(timestamptz) to authenticated, service_role;
grant execute on function public.redeem_promotion(uuid, text, uuid, uuid, bigint, timestamptz) to service_role;
grant execute on function public.promotion_conflicts(uuid) to authenticated, service_role;
grant execute on function public.promotion_is_live(public.promotion_status, timestamptz, timestamptz, timestamptz) to anon, authenticated, service_role;
grant execute on function public.market_local_to_utc(uuid, timestamp) to anon, authenticated, service_role;

create trigger audit_promotions after insert or update on public.promotions
  for each row execute function public.audit_changes();
