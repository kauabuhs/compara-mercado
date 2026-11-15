-- 0022 · Base da comunidade: origem da aprovação, centro das cidades e apelido público (ADR-0010)
--
-- Prepara o terreno para o feed, as confirmações e a reputação (migração seguinte):
--  1. `approved_via`: QUEM/O QUE aprovou um preço (admin, comunidade, autor de confiança, loja,
--     pipeline). Sem isto, `approved_by` mentiria quando a comunidade aprova (apontaria para quem
--     deu a última confirmação) e a interface não saberia qual selo mostrar.
--  2. `cities.center`: ponto de partida do mapa e do "perto de mim" quando não há GPS.
--  3. `profiles.public_nickname`: nome que as OUTRAS pessoas veem. `display_name` pode ser o nome
--     real; nunca vai para o feed.
--  4. `reputation_level()`: faixas de reputação num só lugar do banco (espelhadas em
--     `src/lib/reputation.ts`, com teste de paridade na integração).
--  5. Ajustes nos gatilhos para a reputação poder mudar por dentro de outro gatilho.

-- ── 1. Origem da aprovação ──────────────────────────────────────────────────
create type public.approval_kind as enum
  ('admin', 'community', 'trusted_author', 'store', 'pipeline');

-- `null` = observação inserida já aprovada ou anterior a esta migração (o rastro continua em
-- `approved_by`/`approved_at`). Só é preenchida na transição pending → approved.
alter table public.price_observations add column approved_via public.approval_kind;

-- Aprovação (admin, pipeline ou comunidade): `approved_by` e `reviewed_by` só apontam para uma
-- pessoa quando ela de fato decidiu. Na aprovação pela comunidade ninguém "decidiu": são várias
-- confirmações, registradas em `observation_confirmations`.
create or replace function public.price_observations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'price_observations é somente inclusão: use status' using errcode = '42501';
  end if;

  if (new.store_id, new.product_id, new.price_cents, new.unit_price_cents, new.promo,
      new.valid_from, new.valid_to, new.observed_at, new.source, new.source_id, new.source_ref,
      new.confidence, new.created_by, new.created_at)
     is distinct from
     (old.store_id, old.product_id, old.price_cents, old.unit_price_cents, old.promo,
      old.valid_from, old.valid_to, old.observed_at, old.source, old.source_id, old.source_ref,
      old.confidence, old.created_by, old.created_at) then
    raise exception 'observações de preço são imutáveis (apenas status e aprovação mudam)'
      using errcode = '42501';
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at := now();
    new.approved_via := coalesce(
      new.approved_via,
      case when (select auth.uid()) is null then 'pipeline'::public.approval_kind
           else 'admin'::public.approval_kind end
    );
    if new.approved_via = 'admin' then
      new.approved_by := coalesce(new.approved_by, (select auth.uid()));
    end if;
  end if;
  return new;
end $$;

create or replace function public.price_observations_review_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    if coalesce(new.approved_via::text, 'admin') not in ('community', 'trusted_author', 'store') then
      new.reviewed_by := coalesce(new.reviewed_by, (select auth.uid()));
    end if;
  end if;
  return new;
end $$;

-- ── 2. Centro da cidade ─────────────────────────────────────────────────────
alter table public.cities
  add column center extensions.geography(Point, 4326),
  -- coordenadas legíveis pela API (o PostgREST devolve geography em hexadecimal)
  add column center_lng double precision generated always as
    (extensions.st_x(center::extensions.geometry)) stored,
  add column center_lat double precision generated always as
    (extensions.st_y(center::extensions.geometry)) stored;

-- ── 3. Apelido público ──────────────────────────────────────────────────────
alter table public.profiles
  add column public_nickname text
    constraint profiles_public_nickname_format
    check (public_nickname is null or (
      length(public_nickname) between 2 and 24
      and public_nickname ~ '^[[:alnum:]][[:alnum:] ._-]*$'
    ));

-- Quem aparece no feed não pode se passar pela equipe nem pelo rótulo automático: nomes reservados
-- (palavras inteiras, sem diferenciar maiúsculas) e um apelido por pessoa (sem diferenciar
-- maiúsculas). "Equipe Compara Mercado" é o rótulo que o feed dá a preços sem autor.
alter table public.profiles
  add constraint profiles_public_nickname_reserved
    check (
      public_nickname is null
      or lower(public_nickname) !~
        '\m(equipe|admin|admins|administrador|administradora|administracao|administração|moderador|moderadora|moderacao|moderação|suporte|oficial|colaborador|compara|comparamercado)\M'
    );

create unique index profiles_public_nickname_uq
  on public.profiles (lower(public_nickname))
  where public_nickname is not null;

grant update (public_nickname) on public.profiles to authenticated;

-- Como as outras pessoas veem o autor: apelido escolhido ou "Colaborador #A1B2" (derivado do id,
-- sem revelar nada dele). Nunca devolve nome, e-mail ou telefone.
create or replace function public.public_author_label(p_user_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(p.public_nickname), ''),
    'Colaborador #' || upper(substr(md5(p.id::text), 1, 4))
  )
  from public.profiles p
  where p.id = p_user_id
$$;
-- Uso interno: só `list_community_feed` (SECURITY DEFINER, roda como dono) a chama. Fechada ao
-- PostgREST para ninguém descobrir o apelido de um id de usuário obtido por outro caminho.
revoke all on function public.public_author_label(uuid) from public, anon, authenticated;

-- ── 4. Faixas de reputação ──────────────────────────────────────────────────
-- 0 Novato · 1 Colaborador (50) · 2 Confiável (200) · 3 Guardião (600)
create or replace function public.reputation_level(p_reputation integer)
returns smallint
language sql immutable
set search_path = ''
as $$
  select (case
    when coalesce(p_reputation, 0) >= 600 then 3
    when coalesce(p_reputation, 0) >= 200 then 2
    when coalesce(p_reputation, 0) >= 50  then 1
    else 0
  end)::smallint
$$;
grant execute on function public.reputation_level(integer) to anon, authenticated;

-- ── 5. Reputação muda só por dentro de gatilho ──────────────────────────────
-- O papel continua intocável por não-admin. A reputação passa a poder mudar quando a atualização
-- vem de OUTRO gatilho (profundidade > 1): é o caso do livro-razão `reputation_events`. Uma
-- atualização direta do usuário em `profiles` tem profundidade 1 e segue barrada.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'apenas admin altera papel ou reputação' using errcode = '42501';
    end if;
    if new.reputation is distinct from old.reputation and pg_trigger_depth() <= 1 then
      raise exception 'apenas admin altera papel ou reputação' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
