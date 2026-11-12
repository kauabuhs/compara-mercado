-- 0014 · Mídias: metadados de imagens (os arquivos ficam no Storage/CDN, nunca no banco)
--
-- Fluxo: o servidor valida o upload, grava o original no bucket `catalog`, registra um
-- `media_assets` (pending), um worker gera as renditions (thumb/small/medium/large em
-- WebP/AVIF/JPEG), e o asset vira `ready`. Listagens usam só a rendition `thumb` via
-- `product_thumbnails`; o original nunca é devolvido em listas.
--
-- A URL pública NÃO é guardada: é `<CDN_BASE_URL>/<object_key>` montada pela API. Trocar de CDN
-- ou de bucket não exige migração de dados.

create type public.media_status  as enum ('pending', 'processing', 'ready', 'failed');
create type public.media_variant as enum ('thumb', 'small', 'medium', 'large');
create type public.media_format  as enum ('webp', 'avif', 'jpeg');

create table public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null default 'catalog',
  object_key   text not null check (object_key !~ '^/' and length(object_key) between 1 and 512),
  mime_type    text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  byte_size    bigint not null check (byte_size > 0),
  width        integer check (width > 0),
  height       integer check (height > 0),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  alt_text     text,
  status       public.media_status not null default 'pending',
  error        text,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (bucket, object_key),
  unique (sha256)                    -- a mesma imagem não é guardada duas vezes
);
-- fila do worker de processamento
create index media_assets_pending_idx on public.media_assets (created_at) where status in ('pending', 'processing');

create table public.media_renditions (
  asset_id    uuid not null references public.media_assets (id) on delete cascade,  -- derivado, descartável
  variant     public.media_variant not null,
  format      public.media_format not null,
  width       integer not null check (width > 0),
  height      integer not null check (height > 0),
  byte_size   bigint not null check (byte_size > 0),
  object_key  text not null check (object_key !~ '^/'),
  primary key (asset_id, variant, format)
);

-- Um asset só fica `ready` se tiver ao menos a miniatura WebP (o que listas exibem).
create or replace function public.media_assets_ready_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'ready' and (tg_op = 'INSERT' or old.status is distinct from 'ready') then
    if tg_op = 'INSERT' or not exists (
         select 1 from public.media_renditions
         where asset_id = new.id and variant = 'thumb' and format = 'webp') then
      raise exception 'asset só fica ready com a rendition thumb/webp gerada' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger media_assets_ready_bi_bu before insert or update of status on public.media_assets
  for each row execute function public.media_assets_ready_guard();

-- ── Vínculos (um por dono, para manter integridade referencial real) ────────
-- position: ordem na galeria; is_primary: imagem principal (no máximo uma por dono).
create table public.product_media (
  product_id  uuid not null references public.products (id),
  asset_id    uuid not null references public.media_assets (id),
  position    smallint not null default 0 check (position >= 0),
  is_primary  boolean not null default false,
  primary key (product_id, asset_id),
  unique (product_id, position) deferrable initially deferred   -- permite reordenar numa transação
);
create unique index product_media_primary_uq on public.product_media (product_id) where is_primary;
create index product_media_asset_idx on public.product_media (asset_id);   -- "onde esta imagem é usada?"

create table public.brand_media (
  brand_id    uuid not null references public.brands (id),
  asset_id    uuid not null references public.media_assets (id),
  position    smallint not null default 0 check (position >= 0),
  is_primary  boolean not null default false,
  primary key (brand_id, asset_id),
  unique (brand_id, position) deferrable initially deferred
);
create unique index brand_media_primary_uq on public.brand_media (brand_id) where is_primary;
create index brand_media_asset_idx on public.brand_media (asset_id);

create table public.category_media (
  category_id uuid not null references public.categories (id),
  asset_id    uuid not null references public.media_assets (id),
  position    smallint not null default 0 check (position >= 0),
  is_primary  boolean not null default false,
  primary key (category_id, asset_id),
  unique (category_id, position) deferrable initially deferred
);
create unique index category_media_primary_uq on public.category_media (category_id) where is_primary;
create index category_media_asset_idx on public.category_media (asset_id);

-- Um asset em uso não pode ser apagado nem voltar a processar (referência quebrada).
create or replace function public.media_assets_in_use_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'media_assets não é apagada fisicamente: marque como failed ou desvincule' using errcode = '42501';
  end if;
  if new.status in ('pending', 'processing', 'failed') and old.status = 'ready' and exists (
       select 1 from public.product_media where asset_id = new.id
       union all select 1 from public.brand_media where asset_id = new.id
       union all select 1 from public.category_media where asset_id = new.id) then
    raise exception 'asset em uso não pode sair de ready' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger media_assets_use_bu_bd before update or delete on public.media_assets
  for each row execute function public.media_assets_in_use_guard();

-- ── Miniatura principal por produto: o que as LISTAGENS devem ler ───────────
-- Uma linha por produto com imagem principal pronta. Nunca inclui o original.
create view public.product_thumbnails with (security_invoker = true) as
select pm.product_id,
       a.id         as asset_id,
       a.alt_text,
       r.object_key as thumb_key,
       r.width      as thumb_width,
       r.height     as thumb_height
from public.product_media pm
join public.media_assets a on a.id = pm.asset_id and a.status = 'ready'
join public.media_renditions r on r.asset_id = a.id and r.variant = 'thumb' and r.format = 'webp'
where pm.is_primary;

-- ── Segurança ───────────────────────────────────────────────────────────────
alter table public.media_assets     enable row level security;
alter table public.media_renditions enable row level security;
alter table public.product_media    enable row level security;
alter table public.brand_media      enable row level security;
alter table public.category_media   enable row level security;

grant select on public.media_assets, public.media_renditions, public.product_media,
  public.brand_media, public.category_media, public.product_thumbnails to anon, authenticated;
grant insert, update on public.media_assets, public.media_renditions, public.product_media,
  public.brand_media, public.category_media to authenticated;
grant delete on public.media_renditions, public.product_media, public.brand_media, public.category_media to authenticated;

-- público vê só assets prontos (e o admin vê tudo, inclusive falhas)
create policy media_assets_read on public.media_assets for select to anon, authenticated
  using (status = 'ready' or (select public.is_admin()));
create policy media_renditions_read on public.media_renditions for select to anon, authenticated
  using (exists (select 1 from public.media_assets a where a.id = asset_id));

do $$
declare t text;
begin
  foreach t in array array['product_media', 'brand_media', 'category_media'] loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (exists (select 1 from public.media_assets a where a.id = asset_id))', t || '_read', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t || '_admin_del', t);
  end loop;
  foreach t in array array['media_assets', 'media_renditions', 'product_media', 'brand_media', 'category_media'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_admin_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_admin_upd', t);
  end loop;
end $$;
create policy media_renditions_admin_del on public.media_renditions for delete to authenticated using ((select public.is_admin()));

-- ── Bucket público de catálogo (leitura via CDN; escrita só pelo servidor/service_role) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog', 'catalog', true, 10 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
