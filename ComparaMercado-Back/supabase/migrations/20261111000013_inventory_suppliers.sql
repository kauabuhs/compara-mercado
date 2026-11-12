-- 0013 · Depósitos, estoque, movimentações, reservas e fornecedores
--
-- Estoque NÃO é um campo de products. É um saldo por (depósito, variante) protegido por
-- constraints e alterado apenas por funções que fazem UM UPDATE condicional (atômico sob
-- concorrência) e gravam a movimentação no mesmo commit:
--   · CHECK (on_hand >= 0), CHECK (reserved <= on_hand): é impossível vender o que não existe,
--     mesmo se alguém contornar as funções;
--   · `inventory_movements` é um razão (ledger) imutável: o saldo é auditável por soma.
--
-- Códigos SQLSTATE: ST001 estoque insuficiente · ST002 reserva não está ativa/expirou

create type public.warehouse_kind    as enum ('distribution_center', 'store_stock');
create type public.movement_kind     as enum ('receipt', 'sale', 'return', 'adjustment',
                                              'transfer_out', 'transfer_in', 'loss', 'damage');
create type public.reservation_status as enum ('active', 'committed', 'released', 'expired');

-- ── Fornecedores ────────────────────────────────────────────────────────────
create table public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  legal_name    text,
  tax_id        text,                                   -- CNPJ, EIN, NIF… (formato varia por país)
  country_code  char(2) references public.countries (code),
  email         text check (email is null or email ~ '^[^@\s]+@[^@\s]+$'),
  phone         text,
  status        public.record_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- identificador fiscal é único por país; sem tax_id não há restrição (NULLs são distintos)
  check (tax_id is null or country_code is not null),
  unique (country_code, tax_id)
);
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

create table public.supplier_products (
  supplier_id          uuid not null references public.suppliers (id),
  product_id           uuid not null references public.products (id),
  supplier_sku         text,
  cost_minor           bigint not null check (cost_minor >= 0),
  currency_code        char(3) not null references public.currencies (code),
  min_order_quantity   numeric(14, 3) not null default 1 check (min_order_quantity > 0),
  lead_time_days       smallint check (lead_time_days >= 0),
  is_preferred         boolean not null default false,
  updated_at           timestamptz not null default now(),
  primary key (supplier_id, product_id)
);
-- no máximo um fornecedor preferencial por produto (e é o índice usado ao buscar o preferido)
create unique index supplier_products_preferred_uq on public.supplier_products (product_id) where is_preferred;
create trigger supplier_products_updated_at before update on public.supplier_products
  for each row execute function public.set_updated_at();

-- ── Depósitos ───────────────────────────────────────────────────────────────
-- Um "depósito" é qualquer local com saldo: centro de distribuição OU a retaguarda de uma loja.
-- (Evita FK polimórfica loja|depósito: o inventário aponta sempre para warehouses.)
create table public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  market_id   uuid not null references public.markets (id),
  code        text not null unique check (code ~ '^[a-z0-9-]+$'),
  name        text not null check (length(trim(name)) > 0),
  kind        public.warehouse_kind not null,
  store_id    uuid,
  status      public.record_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (store_id, market_id) references public.stores (id, market_id),
  check ((kind = 'store_stock') = (store_id is not null))
);
-- cada loja tem no máximo um depósito de loja (e a consulta "estoque da loja X" usa este índice)
create unique index warehouses_store_uq on public.warehouses (store_id) where store_id is not null;
create trigger warehouses_updated_at before update on public.warehouses
  for each row execute function public.set_updated_at();

-- ── Saldo ───────────────────────────────────────────────────────────────────
create table public.inventory (
  warehouse_id  uuid not null references public.warehouses (id),
  product_id    uuid not null references public.products (id),
  on_hand       numeric(14, 3) not null default 0 check (on_hand >= 0),     -- quantidade física
  reserved      numeric(14, 3) not null default 0 check (reserved >= 0),
  available     numeric(14, 3) generated always as (on_hand - reserved) stored,
  min_level     numeric(14, 3) check (min_level >= 0),
  max_level     numeric(14, 3) check (max_level >= 0),
  updated_at    timestamptz not null default now(),
  primary key (warehouse_id, product_id),
  check (reserved <= on_hand),
  check (min_level is null or max_level is null or max_level >= min_level)
);
-- alerta de reposição: itens abaixo do mínimo (conjunto pequeno ⇒ índice parcial)
create index inventory_below_min_idx on public.inventory (warehouse_id)
  where min_level is not null and on_hand < min_level;
-- "onde há estoque deste produto?"
create index inventory_product_idx on public.inventory (product_id, warehouse_id);

-- ── Razão de movimentações (imutável) ───────────────────────────────────────
create table public.inventory_movements (
  id                bigint generated always as identity primary key,
  warehouse_id      uuid not null,
  product_id        uuid not null,
  kind              public.movement_kind not null,
  quantity_delta    numeric(14, 3) not null check (quantity_delta <> 0),
  on_hand_after     numeric(14, 3) not null check (on_hand_after >= 0),
  reference         text,                                  -- pedido, nota fiscal, ordem de compra…
  transfer_id       uuid,                                  -- une as duas pernas de uma transferência
  supplier_id       uuid references public.suppliers (id),
  unit_cost_minor   bigint check (unit_cost_minor >= 0),
  cost_currency     char(3) references public.currencies (code),
  note              text,
  idempotency_key   text unique,
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  foreign key (warehouse_id, product_id) references public.inventory (warehouse_id, product_id),
  check ((unit_cost_minor is null) = (cost_currency is null)),
  check (
    (kind in ('receipt', 'return', 'transfer_in') and quantity_delta > 0)
    or (kind in ('sale', 'transfer_out', 'loss', 'damage') and quantity_delta < 0)
    or kind = 'adjustment'
  )
);
-- cartão de estoque: extrato de um item em um depósito, mais recente primeiro
create index inventory_movements_card_idx on public.inventory_movements (warehouse_id, product_id, id desc);
-- as duas pernas de uma transferência
create index inventory_movements_transfer_idx on public.inventory_movements (transfer_id) where transfer_id is not null;
create trigger inventory_movements_append_only before update or delete on public.inventory_movements
  for each row execute function public.append_only();

-- ── Reservas ────────────────────────────────────────────────────────────────
create table public.stock_reservations (
  id             uuid primary key default gen_random_uuid(),
  warehouse_id   uuid not null,
  product_id     uuid not null,
  quantity       numeric(14, 3) not null check (quantity > 0),
  reference      text not null check (length(trim(reference)) > 0),   -- carrinho/pedido
  status         public.reservation_status not null default 'active',
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  foreign key (warehouse_id, product_id) references public.inventory (warehouse_id, product_id)
);
-- idempotência: uma reserva ATIVA por (item, referência)
create unique index stock_reservations_active_uq
  on public.stock_reservations (warehouse_id, product_id, reference) where status = 'active';
-- varredura de expiração
create index stock_reservations_expiry_idx on public.stock_reservations (expires_at) where status = 'active';

-- ── Operações (todas atômicas; SECURITY INVOKER: RLS/privilégios do chamador valem) ──

create or replace function public.stock_apply_movement(
  p_warehouse_id     uuid,
  p_product_id       uuid,
  p_kind             public.movement_kind,
  p_delta            numeric,
  p_reference        text default null,
  p_note             text default null,
  p_supplier_id      uuid default null,
  p_unit_cost_minor  bigint default null,
  p_cost_currency    char(3) default null,
  p_idempotency_key  text default null,
  p_transfer_id      uuid default null
) returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id    bigint;
  v_after numeric;
  v_mode  public.sale_mode;
begin
  if p_idempotency_key is not null then
    select id into v_id from public.inventory_movements where idempotency_key = p_idempotency_key;
    if found then return v_id; end if;
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'quantidade deve ser diferente de zero' using errcode = '22023';
  end if;

  select sale_mode into v_mode from public.products where id = p_product_id;
  if not found then
    raise exception 'produto inexistente' using errcode = '23503';
  end if;
  if v_mode = 'per_unit' and p_delta <> pg_catalog.trunc(p_delta) then
    raise exception 'produto vendido por unidade não aceita quantidade fracionada' using errcode = '22023';
  end if;

  insert into public.inventory (warehouse_id, product_id) values (p_warehouse_id, p_product_id)
  on conflict (warehouse_id, product_id) do nothing;

  begin
    -- UPDATE trava a linha: movimentações concorrentes do mesmo item se enfileiram aqui,
    -- e os CHECKs avaliam o saldo já atualizado pela anterior.
    update public.inventory
    set on_hand = on_hand + p_delta, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id
    returning on_hand into v_after;
  exception when check_violation then
    raise exception 'estoque insuficiente (saldo ou reservas impedem a saída de %)', -p_delta
      using errcode = 'ST001';
  end;

  insert into public.inventory_movements
    (warehouse_id, product_id, kind, quantity_delta, on_hand_after, reference, note, supplier_id,
     unit_cost_minor, cost_currency, idempotency_key, transfer_id)
  values
    (p_warehouse_id, p_product_id, p_kind, p_delta, v_after, p_reference, p_note, p_supplier_id,
     p_unit_cost_minor, p_cost_currency, p_idempotency_key, p_transfer_id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.reserve_stock(
  p_warehouse_id  uuid,
  p_product_id    uuid,
  p_quantity      numeric,
  p_reference     text,
  p_ttl           interval default interval '15 minutes'
) returns uuid
language plpgsql
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantidade deve ser positiva' using errcode = '22023';
  end if;

  select id into v_id from public.stock_reservations
  where warehouse_id = p_warehouse_id and product_id = p_product_id
    and reference = p_reference and status = 'active';
  if found then return v_id; end if;

  -- reserva só se houver disponível: condição e escrita no MESMO comando
  update public.inventory
  set reserved = reserved + p_quantity, updated_at = now()
  where warehouse_id = p_warehouse_id and product_id = p_product_id
    and on_hand - reserved >= p_quantity;
  if not found then
    raise exception 'estoque insuficiente para reservar %', p_quantity using errcode = 'ST001';
  end if;

  insert into public.stock_reservations (warehouse_id, product_id, quantity, reference, expires_at)
  values (p_warehouse_id, p_product_id, p_quantity, p_reference, now() + p_ttl)
  returning id into v_id;
  return v_id;
end $$;

-- Confirma a venda: baixa o físico e libera a reserva. Idempotente.
create or replace function public.commit_reservation(p_reservation_id uuid, p_reference text default null)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  r       public.stock_reservations;
  v_after numeric;
  v_id    bigint;
begin
  select * into r from public.stock_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reserva inexistente' using errcode = 'ST002';
  end if;
  if r.status = 'committed' then
    select id into v_id from public.inventory_movements where idempotency_key = 'commit:' || r.id;
    return v_id;
  end if;
  -- vigência é conferida na hora, sem depender do job de expiração
  if r.status <> 'active' or r.expires_at <= now() then
    raise exception 'reserva não está ativa (status %, expira em %)', r.status, r.expires_at
      using errcode = 'ST002';
  end if;

  update public.inventory
  set on_hand = on_hand - r.quantity, reserved = reserved - r.quantity, updated_at = now()
  where warehouse_id = r.warehouse_id and product_id = r.product_id
  returning on_hand into v_after;

  insert into public.inventory_movements
    (warehouse_id, product_id, kind, quantity_delta, on_hand_after, reference, idempotency_key)
  values
    (r.warehouse_id, r.product_id, 'sale', -r.quantity, v_after, coalesce(p_reference, r.reference),
     'commit:' || r.id)
  returning id into v_id;

  update public.stock_reservations set status = 'committed', resolved_at = now() where id = r.id;
  return v_id;
end $$;

-- Cancela uma reserva ativa e devolve o disponível. Idempotente (liberar de novo não faz nada).
create or replace function public.release_reservation(p_reservation_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare r public.stock_reservations;
begin
  select * into r from public.stock_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reserva inexistente' using errcode = 'ST002';
  end if;
  if r.status = 'committed' then
    raise exception 'reserva já confirmada; use uma devolução' using errcode = 'ST002';
  end if;
  if r.status <> 'active' then return false; end if;

  update public.inventory
  set reserved = reserved - r.quantity, updated_at = now()
  where warehouse_id = r.warehouse_id and product_id = r.product_id;
  update public.stock_reservations set status = 'released', resolved_at = now() where id = r.id;
  return true;
end $$;

-- Job: devolve ao disponível as reservas vencidas. Idempotente.
create or replace function public.expire_stock_reservations(p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare v_count integer;
begin
  with expired as (
    update public.stock_reservations
    set status = 'expired', resolved_at = p_now
    where status = 'active' and expires_at <= p_now
    returning warehouse_id, product_id, quantity
  ), per_item as (
    select warehouse_id, product_id, sum(quantity) as qty
    from expired group by warehouse_id, product_id
  ), upd as (
    update public.inventory i
    set reserved = i.reserved - per_item.qty, updated_at = now()
    from per_item
    where i.warehouse_id = per_item.warehouse_id and i.product_id = per_item.product_id
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end $$;

-- Transferência entre depósitos: duas pernas ligadas por transfer_id, na mesma transação.
-- Locks sempre em ordem crescente de depósito para duas transferências cruzadas não travarem uma à outra.
create or replace function public.transfer_stock(
  p_from_warehouse_id  uuid,
  p_to_warehouse_id    uuid,
  p_product_id         uuid,
  p_quantity           numeric,
  p_reference          text default null
) returns uuid
language plpgsql
set search_path = ''
as $$
declare v_tid uuid := gen_random_uuid();
begin
  if p_from_warehouse_id = p_to_warehouse_id then
    raise exception 'origem e destino devem ser diferentes' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantidade deve ser positiva' using errcode = '22023';
  end if;

  if p_from_warehouse_id < p_to_warehouse_id then
    perform public.stock_apply_movement(p_from_warehouse_id, p_product_id, 'transfer_out', -p_quantity, p_reference, null, null, null, null, null, v_tid);
    perform public.stock_apply_movement(p_to_warehouse_id,   p_product_id, 'transfer_in',   p_quantity, p_reference, null, null, null, null, null, v_tid);
  else
    perform public.stock_apply_movement(p_to_warehouse_id,   p_product_id, 'transfer_in',   p_quantity, p_reference, null, null, null, null, null, v_tid);
    perform public.stock_apply_movement(p_from_warehouse_id, p_product_id, 'transfer_out', -p_quantity, p_reference, null, null, null, null, null, v_tid);
  end if;
  return v_tid;
end $$;

-- ── Segurança: tudo interno (admin / service_role). Nada é público nem apagável. ──
alter table public.suppliers           enable row level security;
alter table public.supplier_products   enable row level security;
alter table public.warehouses          enable row level security;
alter table public.inventory           enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.stock_reservations  enable row level security;

grant select, insert, update on public.suppliers, public.supplier_products, public.warehouses to authenticated;
grant select, insert, update on public.inventory, public.stock_reservations to authenticated;
grant select, insert on public.inventory_movements to authenticated;

do $$
declare t text;
begin
  foreach t in array array['suppliers','supplier_products','warehouses','inventory','stock_reservations'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_admin()))', t || '_admin_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_admin_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_admin_upd', t);
  end loop;
end $$;
create policy inventory_movements_admin_sel on public.inventory_movements for select to authenticated using ((select public.is_admin()));
create policy inventory_movements_admin_ins on public.inventory_movements for insert to authenticated with check ((select public.is_admin()));

revoke all on function public.stock_apply_movement(uuid, uuid, public.movement_kind, numeric, text, text, uuid, bigint, char, text, uuid) from public, anon;
revoke all on function public.reserve_stock(uuid, uuid, numeric, text, interval) from public, anon;
revoke all on function public.commit_reservation(uuid, text) from public, anon;
revoke all on function public.release_reservation(uuid) from public, anon;
revoke all on function public.expire_stock_reservations(timestamptz) from public, anon;
revoke all on function public.transfer_stock(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.stock_apply_movement(uuid, uuid, public.movement_kind, numeric, text, text, uuid, bigint, char, text, uuid) to authenticated, service_role;
grant execute on function public.reserve_stock(uuid, uuid, numeric, text, interval) to authenticated, service_role;
grant execute on function public.commit_reservation(uuid, text) to authenticated, service_role;
grant execute on function public.release_reservation(uuid) to authenticated, service_role;
grant execute on function public.expire_stock_reservations(timestamptz) to authenticated, service_role;
grant execute on function public.transfer_stock(uuid, uuid, uuid, numeric, text) to authenticated, service_role;

create trigger audit_suppliers after insert or update on public.suppliers
  for each row execute function public.audit_changes();
create trigger audit_warehouses after insert or update on public.warehouses
  for each row execute function public.audit_changes();
create trigger suppliers_no_delete before delete on public.suppliers
  for each row execute function public.forbid_delete();
create trigger warehouses_no_delete before delete on public.warehouses
  for each row execute function public.forbid_delete();
create trigger inventory_no_delete before delete on public.inventory
  for each row execute function public.forbid_delete();
create trigger stock_reservations_no_delete before delete on public.stock_reservations
  for each row execute function public.forbid_delete();
