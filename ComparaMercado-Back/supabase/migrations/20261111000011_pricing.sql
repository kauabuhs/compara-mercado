-- 0011 · Preços: listas de preço por mercado/loja e preços versionados no tempo
--
-- Duas camadas de preço, que NÃO se misturam:
--   price_observations / current_prices (existentes) = EVIDÊNCIA: preço visto em lojas de terceiros
--                                                      (encarte, etiqueta); revisado; só inclusão.
--   price_lists / product_prices (este arquivo)      = PREÇO PUBLICADO pela operação, por mercado
--                                                      ou loja, com vigência.
--
-- Dinheiro: INTEIRO em unidade menor da moeda (centavos, e BRL=2, JPY=0, KWD=3 via
-- currencies.minor_unit). É decimal exato por construção (não existe "meio centavo" para
-- gravar) e bigint comporta moedas de valor nominal alto (IDR, VND). Câmbio NÃO é guardado
-- aqui: cada mercado tem seu preço na sua moeda; conversão é um conceito separado.
--
-- Regra de arredondamento (única, usada por SQL e TypeScript): meio para longe do zero
-- (numeric `round`), aplicado UMA vez sobre o valor final da linha, nunca em etapas.

-- necessária para usar igualdade de uuid dentro de índices GiST (constraint de exclusão abaixo)
create extension if not exists btree_gist with schema extensions;

create or replace function public.money_round(p_value numeric)
returns bigint
language sql immutable parallel safe strict
set search_path = ''
as $$ select pg_catalog.round(p_value)::bigint $$;

-- ── Listas de preço ─────────────────────────────────────────────────────────
-- store_id nulo = lista do mercado inteiro; preenchido = lista exclusiva da loja (vence a do mercado).
create table public.price_lists (
  id             uuid primary key default gen_random_uuid(),
  market_id      uuid not null,
  currency_code  char(3) not null,
  store_id       uuid,
  name           text not null check (length(trim(name)) > 0),
  priority       smallint not null default 0,           -- desempate entre listas do mesmo escopo
  status         public.record_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- a lista tem, obrigatoriamente, a moeda do mercado
  foreign key (market_id, currency_code) references public.markets (id, currency_code),
  -- e a loja do escopo pertence a esse mercado
  foreign key (store_id, market_id) references public.stores (id, market_id),
  unique nulls not distinct (market_id, store_id, name)
);
-- resolução de preço: listas ativas do mercado/loja
create index price_lists_scope_idx on public.price_lists (market_id, store_id) where status = 'active';
create trigger price_lists_updated_at before update on public.price_lists
  for each row execute function public.set_updated_at();

-- ── Preços versionados ──────────────────────────────────────────────────────
-- Uma linha = um preço válido em [valid_from, valid_to). Mudar o preço fecha a linha vigente
-- e insere outra: o histórico É a própria tabela (não existe `price_history` à parte).
create table public.product_prices (
  id             uuid primary key default gen_random_uuid(),
  price_list_id  uuid not null references public.price_lists (id),
  product_id     uuid not null references public.products (id),
  amount_minor   bigint not null check (amount_minor >= 0),
  valid_from     timestamptz not null default now(),
  valid_to       timestamptz,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  -- dois preços do mesmo produto na mesma lista NUNCA se sobrepõem no tempo.
  -- O índice GiST criado aqui também atende "preço de X na lista Y no instante T".
  constraint product_prices_no_overlap exclude using gist (
    price_list_id with =,
    product_id    with =,
    tstzrange(valid_from, valid_to, '[)') with &&
  )
);

-- Imutabilidade: valor, lista, produto e início nunca mudam; só se pode ENCERRAR (valid_to).
create or replace function public.product_prices_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'product_prices é histórico: não pode ser apagada' using errcode = '42501';
  end if;
  if (new.price_list_id, new.product_id, new.amount_minor, new.valid_from, new.created_at)
     is distinct from
     (old.price_list_id, old.product_id, old.amount_minor, old.valid_from, old.created_at) then
    raise exception 'preços são imutáveis: use set_product_price para mudar o valor'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger product_prices_bu_bd before update or delete on public.product_prices
  for each row execute function public.product_prices_guard();

-- Muda o preço de forma atômica e serializada por (lista, produto):
--   · encerra a versão que cobre `p_effective_from`;
--   · cria a nova, que termina onde começa a próxima versão já agendada (se houver).
create or replace function public.set_product_price(
  p_price_list_id  uuid,
  p_product_id     uuid,
  p_amount_minor   bigint,
  p_effective_from timestamptz default now()
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_next timestamptz;
  v_id   uuid;
begin
  if p_amount_minor is null or p_amount_minor < 0 then
    raise exception 'valor inválido' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_price_list_id::text || p_product_id::text, 0));

  update public.product_prices
  set valid_to = p_effective_from
  where price_list_id = p_price_list_id and product_id = p_product_id
    and valid_from < p_effective_from
    and (valid_to is null or valid_to > p_effective_from);

  select min(valid_from) into v_next
  from public.product_prices
  where price_list_id = p_price_list_id and product_id = p_product_id
    and valid_from >= p_effective_from;

  if v_next = p_effective_from then
    raise exception 'já existe um preço com início em %', p_effective_from using errcode = '23P01';
  end if;

  insert into public.product_prices (price_list_id, product_id, amount_minor, valid_from, valid_to)
  values (p_price_list_id, p_product_id, p_amount_minor, p_effective_from, v_next)
  returning id into v_id;
  return v_id;
end $$;

-- ── Segurança ───────────────────────────────────────────────────────────────
-- O público NÃO lê estas tabelas: lê o resultado via resolve_prices() (migração 0015).
alter table public.price_lists    enable row level security;
alter table public.product_prices enable row level security;

grant select, insert, update on public.price_lists to authenticated;
grant select, insert on public.product_prices to authenticated;
grant update (valid_to) on public.product_prices to authenticated;   -- só encerrar

create policy price_lists_admin_sel on public.price_lists for select to authenticated using ((select public.is_admin()));
create policy price_lists_admin_ins on public.price_lists for insert to authenticated with check ((select public.is_admin()));
create policy price_lists_admin_upd on public.price_lists for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_prices_admin_sel on public.product_prices for select to authenticated using ((select public.is_admin()));
create policy product_prices_admin_ins on public.product_prices for insert to authenticated with check ((select public.is_admin()));
create policy product_prices_admin_upd on public.product_prices for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on function public.set_product_price(uuid, uuid, bigint, timestamptz) from public, anon;
grant execute on function public.set_product_price(uuid, uuid, bigint, timestamptz) to authenticated, service_role;

create trigger audit_price_lists after insert or update on public.price_lists
  for each row execute function public.audit_changes();
create trigger price_lists_no_delete before delete on public.price_lists
  for each row execute function public.forbid_delete();
-- product_prices não usa audit_changes: ela mesma é o histórico (volume alto, imutável).
