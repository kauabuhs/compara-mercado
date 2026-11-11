-- 0002 · Tabelas do núcleo
-- Regras: dinheiro em centavos inteiros; datas em timestamptz (UTC); nada é apagado
-- fisicamente (usa-se `status`), exceto dados pessoais (LGPD).

-- Função utilitária de busca sem acento, imutável para poder ser usada em índices.
create or replace function public.f_unaccent(text)
returns text
language sql immutable parallel safe strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Geografia e catálogo ────────────────────────────────────────────────────

create table public.cities (
  id          uuid primary key default gen_random_uuid(),
  ibge_code   text not null unique check (ibge_code ~ '^\d{7}$'),
  name        text not null,
  uf          char(2) not null check (uf = upper(uf)),
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.stores (
  id             uuid primary key default gen_random_uuid(),
  city_id        uuid not null references public.cities (id),
  name           text not null check (length(trim(name)) > 0),
  cnpj           text unique check (cnpj ~ '^\d{14}$'),
  address        text,
  neighborhood   text,
  location       extensions.geography(Point, 4326) not null,
  -- coordenadas legíveis pela API (o PostgREST devolve geography em hexadecimal)
  lng            double precision generated always as
                   (extensions.st_x(location::extensions.geometry)) stored,
  lat            double precision generated always as
                   (extensions.st_y(location::extensions.geometry)) stored,
  opening_hours  jsonb,
  status         public.store_status not null default 'pending',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index stores_location_gist on public.stores using gist (location);
create index stores_city_idx on public.stores (city_id) where status = 'active';
create trigger stores_updated_at before update on public.stores
  for each row execute function public.set_updated_at();

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.categories (id),
  name       text not null,
  slug       text not null unique check (slug ~ '^[a-z0-9-]+$')
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  gtin            text unique check (gtin ~ '^(\d{8}|\d{12,14})$'),
  canonical_name  text not null check (length(trim(canonical_name)) > 0),
  brand           text,
  category_id     uuid references public.categories (id),
  size_value      numeric(12, 3) not null check (size_value > 0),
  size_unit       public.size_unit not null,
  -- unidade base e quantidade na base derivadas do tamanho: nunca ficam inconsistentes
  base_unit       public.base_unit generated always as (
                    case size_unit
                      when 'g'  then 'kg'::public.base_unit
                      when 'kg' then 'kg'::public.base_unit
                      when 'ml' then 'l'::public.base_unit
                      when 'l'  then 'l'::public.base_unit
                      else 'un'::public.base_unit
                    end) stored,
  base_quantity   numeric(14, 6) generated always as (
                    case size_unit
                      when 'g'  then size_value / 1000
                      when 'ml' then size_value / 1000
                      else size_value
                    end) stored,
  status          public.record_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index products_name_trgm on public.products
  using gin (public.f_unaccent(lower(canonical_name || ' ' || coalesce(brand, ''))) extensions.gin_trgm_ops);
create index products_category_idx on public.products (category_id);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ── Perfis e listas ─────────────────────────────────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (display_name is null or length(display_name) between 2 and 40),
  role          public.user_role not null default 'user',
  reputation    integer not null default 0,
  created_at    timestamptz not null default now()
);

create table public.shopping_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null default 'Minha lista' check (length(name) between 1 and 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index shopping_lists_user_idx on public.shopping_lists (user_id);
create trigger shopping_lists_updated_at before update on public.shopping_lists
  for each row execute function public.set_updated_at();

create table public.list_items (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.shopping_lists (id) on delete cascade,
  product_id  uuid references public.products (id),
  free_text   text check (free_text is null or length(free_text) between 1 and 120),
  quantity    integer not null default 1 check (quantity between 1 and 99),
  checked     boolean not null default false,
  created_at  timestamptz not null default now(),
  check (product_id is not null or free_text is not null)
);
create index list_items_list_idx on public.list_items (list_id);

-- ── Pipeline de preços ──────────────────────────────────────────────────────

create table public.sources (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid references public.stores (id),
  kind          public.source_kind not null,
  file_path     text not null,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  period_start  date,
  period_end    date,
  status        public.source_status not null default 'uploaded',
  error         text,
  uploaded_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  -- o mesmo arquivo não é reprocessado
  unique (sha256),
  check (period_end is null or period_start is null or period_end >= period_start)
);
create index sources_status_idx on public.sources (status);

create table public.extractions (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references public.sources (id) on delete cascade,
  model       text not null,
  raw_json    jsonb not null,
  confidence  numeric(4, 3) check (confidence between 0 and 1),
  created_at  timestamptz not null default now()
);
create index extractions_source_idx on public.extractions (source_id);

create table public.product_aliases (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid references public.stores (id),
  raw_name         text not null,
  normalized_name  text not null,
  product_id       uuid references public.products (id),
  confidence       numeric(4, 3) check (confidence between 0 and 1),
  status           public.alias_status not null default 'pending',
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique nulls not distinct (store_id, normalized_name)
);
create index product_aliases_trgm on public.product_aliases
  using gin (normalized_name extensions.gin_trgm_ops);
create index product_aliases_product_idx on public.product_aliases (product_id);

create table public.price_observations (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores (id),
  product_id       uuid not null references public.products (id),
  price_cents      integer not null check (price_cents between 1 and 10000000),
  unit_price_cents integer not null check (unit_price_cents > 0),
  promo            boolean not null default false,
  valid_from       timestamptz,
  valid_to         timestamptz,
  observed_at      timestamptz not null default now(),
  source           public.observation_source not null,
  source_id        uuid references public.sources (id),
  source_ref       text,
  confidence       numeric(4, 3) not null default 1 check (confidence between 0 and 1),
  status           public.observation_status not null default 'pending',
  created_by       uuid references public.profiles (id) on delete set null,
  approved_by      uuid references public.profiles (id) on delete set null,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
-- consulta mais comum: último preço de um produto em um mercado
create index price_obs_store_product_idx
  on public.price_observations (store_id, product_id, observed_at desc);
create index price_obs_status_idx on public.price_observations (status, created_at desc);
create index price_obs_creator_idx on public.price_observations (created_by, created_at desc);
create index price_obs_source_idx on public.price_observations (source_id);

create table public.review_tasks (
  id            uuid primary key default gen_random_uuid(),
  target_type   public.review_target not null,
  target_id     uuid not null,
  reason        text not null,
  payload       jsonb,
  assigned_to   uuid references public.profiles (id) on delete set null,
  status        public.review_status not null default 'open',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.profiles (id) on delete set null
);
create index review_tasks_open_idx on public.review_tasks (status, created_at) where status in ('open', 'in_progress');
create unique index review_tasks_target_open_uq
  on public.review_tasks (target_type, target_id) where status in ('open', 'in_progress');

create table public.contributions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  observation_id  uuid not null references public.price_observations (id),
  points          integer not null check (points >= 0),
  created_at      timestamptz not null default now(),
  unique (observation_id)
);
create index contributions_user_idx on public.contributions (user_id);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  diff       jsonb,
  at         timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, at desc);
create index audit_log_at_idx on public.audit_log (at desc);
