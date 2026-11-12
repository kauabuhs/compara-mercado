-- 0010 · Catálogo: marcas, famílias (identidade) × variantes (item vendável), identificadores,
--        atributos, alergênicos e informação nutricional
--
-- Decisão de modelagem (ver docs/database/modelo-de-dados.md):
--   product_families = IDENTIDADE comercial ("Refrigerante Cola X"): nome, marca, categoria,
--                      ingredientes, alergênicos, nutrição. Vale para todas as apresentações.
--   products         = VARIANTE / item vendável (já existente): GTIN, tamanho, embalagem, modo de
--                      venda. NÃO foi renomeada: views, funções, RLS, API e testes dependem dela.
-- Cada produto existente recebe uma família (backfill abaixo); produtos novos criados pelo
-- caminho antigo (sem family_id) ganham uma família automaticamente por gatilho.

create type public.sale_mode          as enum ('per_unit', 'by_weight', 'by_volume');
create type public.identifier_type    as enum ('gtin_alt', 'sku', 'internal_code', 'plu', 'mpn');
create type public.attribute_value_type as enum ('text', 'number', 'boolean');
create type public.allergen_presence  as enum ('contains', 'may_contain');
create type public.nutrition_basis    as enum ('per_100g', 'per_100ml');

-- slug ASCII estável (marcas, códigos)
create or replace function public.slugify(text)
returns text
language sql immutable parallel safe strict
set search_path = ''
as $$ select trim(both '-' from regexp_replace(lower(public.f_unaccent($1)), '[^a-z0-9]+', '-', 'g')) $$;

-- ── Marcas ──────────────────────────────────────────────────────────────────
create table public.brands (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  manufacturer  text,                      -- fabricante; vira tabela própria se precisar de atributos
  status        public.record_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

-- backfill: uma marca por slug (grafias "Nestlé"/"Nestle" colapsam em uma)
insert into public.brands (name, slug)
select min(trim(brand)), public.slugify(brand)
from public.products
where brand is not null and public.slugify(brand) <> ''
group by public.slugify(brand)
on conflict (slug) do nothing;

-- ── Famílias de produto ─────────────────────────────────────────────────────
create table public.product_families (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  brand_id     uuid references public.brands (id),
  category_id  uuid references public.categories (id),
  description  text,
  ingredients  text,
  status       public.record_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- navegação por marca / categoria (telas de listagem); parciais: só o que o público enxerga
create index product_families_brand_idx    on public.product_families (brand_id)    where status = 'active';
create index product_families_category_idx on public.product_families (category_id) where status = 'active';
create trigger product_families_updated_at before update on public.product_families
  for each row execute function public.set_updated_at();

-- ── Variante: novas colunas em products (todas nulas ou com default) ────────
alter table public.products
  add column family_id       uuid references public.product_families (id),
  add column brand_id        uuid references public.brands (id),
  add column sale_mode       public.sale_mode not null default 'per_unit',
  add column pack_quantity   integer not null default 1 check (pack_quantity >= 1),
  add column variant_label   text check (variant_label is null or length(trim(variant_label)) > 0),
  add column gross_weight_g  numeric(10, 2) check (gross_weight_g is null or gross_weight_g > 0),
  add column length_mm       integer check (length_mm is null or length_mm > 0),
  add column width_mm        integer check (width_mm  is null or width_mm  > 0),
  add column height_mm       integer check (height_mm is null or height_mm > 0);

-- backfill de marca e família -------------------------------------------------
-- sem gatilhos de auditoria/updated_at: é reclassificação técnica, não edição de negócio
alter table public.products disable trigger audit_products;
alter table public.products disable trigger products_updated_at;

update public.products
set brand_id = b.id
from public.brands b
where public.products.brand is not null
  and b.slug = public.slugify(public.products.brand);

-- agrupa variantes da mesma identidade (mesmo nome, marca e categoria): tamanhos diferentes
-- do mesmo produto passam a dividir UMA família
create temp table _family_map on commit drop as
select gen_random_uuid() as family_id,
       lower(canonical_name) as lname, brand_id, category_id,
       min(canonical_name) as name,
       bool_or(status = 'active') as any_active
from public.products
group by lower(canonical_name), brand_id, category_id;

insert into public.product_families (id, name, brand_id, category_id, status)
select family_id, name, brand_id, category_id,
       case when any_active then 'active'::public.record_status else 'archived'::public.record_status end
from _family_map;

update public.products p
set family_id = m.family_id
from _family_map m
where lower(p.canonical_name) = m.lname
  and p.brand_id    is not distinct from m.brand_id
  and p.category_id is not distinct from m.category_id;

alter table public.products enable trigger audit_products;
alter table public.products enable trigger products_updated_at;

alter table public.products alter column family_id set not null;
create index products_family_idx on public.products (family_id);   -- variantes de uma família

-- ── Gatilhos: família é a fonte de marca/categoria; colunas antigas viram cópia de leitura ──
-- `products.brand` e `products.category_id` continuam existindo (busca, price_board e a API
-- dependem delas). Daqui em diante a família manda; alterar só o produto é erro explícito.
create or replace function public.products_resolve_family()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_slug       text;
  v_f_brand    uuid;
  v_f_category uuid;
  v_f_brand_nm text;
begin
  if tg_op = 'INSERT' and new.family_id is null then
    -- caminho legado: quem cria produto sem família recebe (ou reaproveita) uma
    v_slug := case when new.brand is null then '' else public.slugify(new.brand) end;
    if new.brand_id is null and v_slug <> '' then
      insert into public.brands (name, slug) values (trim(new.brand), v_slug)
      on conflict (slug) do nothing;
      select id into new.brand_id from public.brands where slug = v_slug;
    end if;
    select f.id into new.family_id
    from public.product_families f
    where lower(f.name) = lower(new.canonical_name)
      and f.brand_id    is not distinct from new.brand_id
      and f.category_id is not distinct from new.category_id
    order by f.created_at, f.id
    limit 1;
    if new.family_id is null then
      insert into public.product_families (name, brand_id, category_id, status)
      values (new.canonical_name, new.brand_id, new.category_id,
              case when new.status = 'active' then 'active'::public.record_status else new.status end)
      returning id into new.family_id;
    end if;
  end if;

  select f.brand_id, f.category_id, b.name
    into v_f_brand, v_f_category, v_f_brand_nm
  from public.product_families f
  left join public.brands b on b.id = f.brand_id
  where f.id = new.family_id;

  if tg_op = 'UPDATE' and new.family_id = old.family_id and (
       (new.category_id is distinct from old.category_id and new.category_id is distinct from v_f_category)
    or (new.brand_id    is distinct from old.brand_id    and new.brand_id    is distinct from v_f_brand)
    or (new.brand       is distinct from old.brand       and new.brand       is distinct from v_f_brand_nm)
  ) then
    raise exception 'marca e categoria pertencem à família do produto: altere product_families'
      using errcode = '23514';
  end if;

  new.brand_id    := v_f_brand;
  new.category_id := v_f_category;
  new.brand       := v_f_brand_nm;
  return new;
end $$;

-- nome começa com "a_" para rodar ANTES do gatilho de updated_at/auditoria na ordem alfabética
create trigger a_products_resolve_family before insert or update on public.products
  for each row execute function public.products_resolve_family();

-- renomear marca / mover família propaga para as cópias de leitura
create or replace function public.brands_propagate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    update public.products set updated_at = now() where brand_id = new.id;
  end if;
  return null;
end $$;
create trigger brands_au after update on public.brands
  for each row execute function public.brands_propagate();

create or replace function public.families_propagate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.brand_id is distinct from old.brand_id or new.category_id is distinct from old.category_id then
    update public.products set updated_at = now() where family_id = new.id;
  end if;
  return null;
end $$;
create trigger product_families_au after update on public.product_families
  for each row execute function public.families_propagate();

-- ── Identificadores adicionais (o GTIN principal continua em products.gtin) ─
create table public.product_identifiers (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id),
  id_type      public.identifier_type not null,
  value        text not null check (length(trim(value)) > 0),
  market_id    uuid references public.markets (id),   -- PLU e códigos internos podem ser por mercado
  created_at   timestamptz not null default now(),
  check (id_type <> 'gtin_alt' or value ~ '^(\d{8}|\d{12,14})$'),
  unique nulls not distinct (id_type, value, market_id)
);
create index product_identifiers_product_idx on public.product_identifiers (product_id);

-- um código de barras não pode ser, ao mesmo tempo, o GTIN principal de um produto e o
-- alternativo de outro (nas duas direções)
create or replace function public.identifiers_gtin_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id_type = 'gtin_alt' and exists (
       select 1 from public.products p where p.gtin = new.value and p.id <> new.product_id) then
    raise exception 'GTIN % já é o código principal de outro produto', new.value using errcode = '23505';
  end if;
  return new;
end $$;
create trigger product_identifiers_bi_bu before insert or update on public.product_identifiers
  for each row execute function public.identifiers_gtin_guard();

create or replace function public.products_gtin_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.gtin is not null and exists (
       select 1 from public.product_identifiers i
       where i.id_type = 'gtin_alt' and i.value = new.gtin and i.product_id <> new.id) then
    raise exception 'GTIN % já é código alternativo de outro produto', new.gtin using errcode = '23505';
  end if;
  return new;
end $$;
create trigger b_products_gtin_guard before insert or update of gtin on public.products
  for each row execute function public.products_gtin_guard();

-- ── Atributos flexíveis (nível de família), tipados — sem JSON ──────────────
create table public.attribute_definitions (
  code         text primary key check (code ~ '^[a-z0-9_]+$'),
  label        text not null,
  value_type   public.attribute_value_type not null,
  unit         text,
  created_at   timestamptz not null default now()
);

create table public.family_attribute_values (
  family_id       uuid not null references public.product_families (id),
  attribute_code  text not null references public.attribute_definitions (code),
  value_text      text,
  value_number    numeric,
  value_boolean   boolean,
  primary key (family_id, attribute_code),
  -- exatamente um valor preenchido
  check (num_nonnulls(value_text, value_number, value_boolean) = 1)
);

create or replace function public.family_attribute_type_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_type public.attribute_value_type;
begin
  select value_type into v_type from public.attribute_definitions where code = new.attribute_code;
  if (v_type = 'text'    and new.value_text    is null)
  or (v_type = 'number'  and new.value_number  is null)
  or (v_type = 'boolean' and new.value_boolean is null) then
    raise exception 'valor incompatível com o tipo (%) do atributo %', v_type, new.attribute_code
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger family_attribute_values_bi_bu before insert or update on public.family_attribute_values
  for each row execute function public.family_attribute_type_guard();

-- ── Alergênicos (lista regulatória: 14 alérgenos de declaração obrigatória na UE) ──
create table public.allergens (
  code  text primary key check (code ~ '^[a-z_]+$'),
  name  text not null
);
insert into public.allergens (code, name) values
  ('gluten', 'Glúten'), ('crustaceans', 'Crustáceos'), ('eggs', 'Ovos'), ('fish', 'Peixe'),
  ('peanuts', 'Amendoim'), ('soy', 'Soja'), ('milk', 'Leite'), ('tree_nuts', 'Castanhas e nozes'),
  ('celery', 'Aipo'), ('mustard', 'Mostarda'), ('sesame', 'Gergelim'), ('sulphites', 'Sulfitos'),
  ('lupin', 'Tremoço'), ('molluscs', 'Moluscos')
on conflict (code) do nothing;

create table public.family_allergens (
  family_id      uuid not null references public.product_families (id),
  allergen_code  text not null references public.allergens (code),
  presence       public.allergen_presence not null,
  primary key (family_id, allergen_code)
);

-- ── Informação nutricional (1:1 com a família; colunas tipadas) ─────────────
create table public.family_nutrition (
  family_id           uuid primary key references public.product_families (id),
  basis               public.nutrition_basis not null,
  serving_size        numeric(8, 2) check (serving_size > 0),
  energy_kcal         numeric(7, 2) check (energy_kcal >= 0),
  fat_g               numeric(7, 2) check (fat_g >= 0),
  saturated_fat_g     numeric(7, 2) check (saturated_fat_g >= 0),
  carbohydrate_g      numeric(7, 2) check (carbohydrate_g >= 0),
  sugars_g            numeric(7, 2) check (sugars_g >= 0),
  fiber_g             numeric(7, 2) check (fiber_g >= 0),
  protein_g           numeric(7, 2) check (protein_g >= 0),
  sodium_mg           numeric(8, 2) check (sodium_mg >= 0),
  updated_at          timestamptz not null default now(),
  check (saturated_fat_g is null or fat_g is null or saturated_fat_g <= fat_g),
  check (sugars_g is null or carbohydrate_g is null or sugars_g <= carbohydrate_g)
);
create trigger family_nutrition_updated_at before update on public.family_nutrition
  for each row execute function public.set_updated_at();

-- ── Segurança ───────────────────────────────────────────────────────────────
alter table public.brands                 enable row level security;
alter table public.product_families       enable row level security;
alter table public.product_identifiers    enable row level security;
alter table public.attribute_definitions  enable row level security;
alter table public.family_attribute_values enable row level security;
alter table public.allergens              enable row level security;
alter table public.family_allergens       enable row level security;
alter table public.family_nutrition       enable row level security;

grant select on public.brands, public.product_families, public.attribute_definitions,
  public.family_attribute_values, public.allergens, public.family_allergens, public.family_nutrition
  to anon, authenticated;
-- identificadores internos (SKU, códigos de depósito) não são públicos
grant select on public.product_identifiers to authenticated;
grant insert, update on public.brands, public.product_families, public.product_identifiers,
  public.attribute_definitions, public.family_attribute_values, public.allergens,
  public.family_allergens, public.family_nutrition to authenticated;
-- remoção de linhas de associação (corrigir um alergênico lançado errado) é permitida só a admin;
-- entidades com histórico (marcas, famílias, produtos) nunca são apagadas
grant delete on public.family_attribute_values, public.family_allergens, public.family_nutrition,
  public.product_identifiers to authenticated;

create policy brands_read on public.brands for select to anon, authenticated
  using (status = 'active' or (select public.is_admin()));
create policy families_read on public.product_families for select to anon, authenticated
  using (status = 'active' or (select public.is_admin()));
create policy identifiers_admin_read on public.product_identifiers for select to authenticated
  using ((select public.is_admin()));
create policy attr_defs_read on public.attribute_definitions for select to anon, authenticated using (true);
create policy allergens_read on public.allergens for select to anon, authenticated using (true);
-- dados de família só aparecem se a família estiver visível (a RLS de product_families se aplica)
create policy fam_attr_read on public.family_attribute_values for select to anon, authenticated
  using (exists (select 1 from public.product_families f where f.id = family_id));
create policy fam_allergens_read on public.family_allergens for select to anon, authenticated
  using (exists (select 1 from public.product_families f where f.id = family_id));
create policy fam_nutrition_read on public.family_nutrition for select to anon, authenticated
  using (exists (select 1 from public.product_families f where f.id = family_id));

do $$
declare t text;
begin
  foreach t in array array['brands','product_families','product_identifiers','attribute_definitions',
                           'family_attribute_values','allergens','family_allergens','family_nutrition']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_admin_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_admin_upd', t);
  end loop;
  foreach t in array array['family_attribute_values','family_allergens','family_nutrition','product_identifiers']
  loop
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t || '_admin_del', t);
  end loop;
end $$;

create trigger audit_brands    after insert or update or delete on public.brands
  for each row execute function public.audit_changes();
create trigger audit_families  after insert or update or delete on public.product_families
  for each row execute function public.audit_changes();
create trigger audit_identifiers after insert or update or delete on public.product_identifiers
  for each row execute function public.audit_changes();

-- Entidades com histórico comercial nunca são apagadas fisicamente (nem por service_role).
create or replace function public.forbid_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% não pode ser apagada fisicamente: use status', tg_table_name using errcode = '42501';
end $$;
create trigger brands_no_delete   before delete on public.brands
  for each row execute function public.forbid_delete();
create trigger families_no_delete before delete on public.product_families
  for each row execute function public.forbid_delete();
create trigger products_no_delete before delete on public.products
  for each row execute function public.forbid_delete();
