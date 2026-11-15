-- 0023 · Confiança da comunidade: confirmações, denúncias, reputação e feed (ADR-0010)
--
-- Um preço enviado com foto nasce `pending`. Ele vira `approved` sozinho quando:
--   • recebe >= 2 confirmações de pessoas diferentes do autor (no máximo 1 de "Novato" conta), sem
--     nenhum "mudou" nem denúncia; ou
--   • o autor já é "Confiável" (reputação >= 200) e não há contestação;
-- e sempre que o valor for plausível frente ao histórico aprovado do produto.
-- >= 2 "mudou" ou >= 3 denúncias tiram a publicação do feed e abrem uma tarefa para o admin.
--
-- Tudo acontece em funções SECURITY DEFINER, o único caminho de escrita: as tabelas não têm
-- INSERT/UPDATE/DELETE para `authenticated`, então nem um cliente que fale direto com o PostgREST
-- (com a chave pública e o próprio token) consegue pular as regras.

create type public.confirmation_verdict as enum ('confirm', 'changed');
create type public.report_reason as enum
  ('wrong_price', 'wrong_product', 'wrong_store', 'spam', 'inappropriate_photo', 'other');
create type public.reputation_event_kind as enum
  ('price_approved', 'price_rejected', 'confirmation_received', 'confirmation_given');

-- ── Tabelas ─────────────────────────────────────────────────────────────────
create table public.observation_confirmations (
  observation_id  uuid not null references public.price_observations (id),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  verdict         public.confirmation_verdict not null,
  created_at      timestamptz not null default now(),
  primary key (observation_id, user_id)
);
create index observation_confirmations_user_idx
  on public.observation_confirmations (user_id, created_at desc);

create table public.observation_reports (
  observation_id  uuid not null references public.price_observations (id),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  reason          public.report_reason not null,
  created_at      timestamptz not null default now(),
  primary key (observation_id, user_id)
);
create index observation_reports_user_idx
  on public.observation_reports (user_id, created_at desc);

-- Livro-razão da reputação: só inclusão. `source_user_id` distingue várias confirmações recebidas
-- na mesma publicação (uma por pessoa); `nulls not distinct` mantém os demais tipos únicos.
create table public.reputation_events (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  observation_id  uuid not null references public.price_observations (id),
  kind            public.reputation_event_kind not null,
  points          integer not null check (points <> 0),
  source_user_id  uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create unique index reputation_events_once_uq
  on public.reputation_events (user_id, observation_id, kind, source_user_id) nulls not distinct;
create index reputation_events_user_idx on public.reputation_events (user_id, created_at desc);

-- ── RLS: leitura do que é seu; escrita só pelas funções abaixo ──────────────
alter table public.observation_confirmations enable row level security;
alter table public.observation_reports       enable row level security;
alter table public.reputation_events         enable row level security;

grant select on public.observation_confirmations, public.observation_reports,
                public.reputation_events to authenticated;

create policy confirmations_read on public.observation_confirmations for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy reports_read on public.observation_reports for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy reputation_events_read on public.reputation_events for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ── Reputação: pontos ───────────────────────────────────────────────────────
-- A atualização de `profiles.reputation` acontece dentro deste gatilho (profundidade 2), que o
-- `profiles_guard` aceita. Nunca fica negativa.
create or replace function public.apply_reputation_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.profiles
     set reputation = greatest(0, reputation + new.points)
   where id = new.user_id;
  return null;
end $$;
revoke all on function public.apply_reputation_event() from public, anon, authenticated;

create trigger reputation_events_ai
  after insert on public.reputation_events
  for each row execute function public.apply_reputation_event();

-- Decisão sobre o preço: +10 se aprovado, −20 se rejeitado (só para preço enviado por pessoa).
create or replace function public.award_reputation_on_decision()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.created_by is null or new.source <> 'label_photo' then
    return null;
  end if;
  if new.status = 'approved' then
    insert into public.reputation_events (user_id, observation_id, kind, points)
    values (new.created_by, new.id, 'price_approved', 10)
    on conflict do nothing;
  elsif new.status = 'rejected' then
    insert into public.reputation_events (user_id, observation_id, kind, points)
    values (new.created_by, new.id, 'price_rejected', -20)
    on conflict do nothing;
  end if;
  return null;
end $$;
revoke all on function public.award_reputation_on_decision() from public, anon, authenticated;

create trigger price_observations_au_reputation
  after update of status on public.price_observations
  for each row
  when (old.status is distinct from new.status)
  execute function public.award_reputation_on_decision();

-- ── Plausibilidade do valor ─────────────────────────────────────────────────
-- Entre 0,4x e 2,5x a mediana dos preços aprovados do produto nos últimos 60 dias. Com menos de
-- 3 amostras não dá para julgar: considera plausível (a corroboração continua sendo exigida).
create or replace function public.price_is_plausible(p_product_id uuid, p_price_cents integer)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  with ref as (
    select count(*) as n,
           percentile_cont(0.5) within group (order by price_cents) as median
    from public.price_observations
    where product_id = p_product_id
      and status = 'approved'
      and observed_at > now() - interval '60 days'
  )
  select coalesce((select n < 3 or p_price_cents between median * 0.4 and median * 2.5 from ref), true)
$$;
revoke all on function public.price_is_plausible(uuid, integer) from public, anon, authenticated;

-- ── Avaliação de uma publicação pendente ────────────────────────────────────
-- Interna: decide se vira `approved` ou se é contestada. Devolve o status resultante.
create or replace function public.evaluate_observation(p_observation_id uuid)
returns public.observation_status
language plpgsql security definer
set search_path = ''
as $$
declare
  o            public.price_observations;
  v_solid      integer;
  v_novice     integer;
  v_changed    integer;
  v_reports    integer;
  v_author_rep integer;
  v_kind       public.approval_kind;
begin
  select * into o from public.price_observations where id = p_observation_id for update;
  if not found then
    return null;
  end if;
  if o.status <> 'pending' or o.source <> 'label_photo' then
    return o.status;
  end if;

  select count(*) filter (where c.verdict = 'confirm' and p.reputation >= 50),
         count(*) filter (where c.verdict = 'confirm' and p.reputation < 50),
         count(*) filter (where c.verdict = 'changed')
    into v_solid, v_novice, v_changed
    from public.observation_confirmations c
    join public.profiles p on p.id = c.user_id
   where c.observation_id = o.id;

  select count(*) into v_reports from public.observation_reports where observation_id = o.id;
  select coalesce(reputation, 0) into v_author_rep from public.profiles where id = o.created_by;
  v_author_rep := coalesce(v_author_rep, 0);

  -- Contestada: some do feed (a leitura filtra) e vai para o admin decidir.
  if v_changed >= 2 or v_reports >= 3 then
    insert into public.review_tasks (target_type, target_id, reason, payload)
    values ('price_observation', o.id, 'Contestada pela comunidade',
            jsonb_build_object('changed', v_changed, 'reports', v_reports))
    on conflict (target_type, target_id) where status in ('open', 'in_progress') do nothing;
    return o.status;
  end if;

  if v_changed = 0 and v_reports = 0 and public.price_is_plausible(o.product_id, o.price_cents) then
    if v_solid + least(v_novice, 1) >= 2 then
      v_kind := 'community';
    elsif v_author_rep >= 200 then
      v_kind := 'trusted_author';
    end if;
  end if;

  if v_kind is not null then
    update public.price_observations
       set status = 'approved', approved_via = v_kind
     where id = o.id;
    return 'approved';
  end if;
  return o.status;
end $$;
revoke all on function public.evaluate_observation(uuid) from public, anon, authenticated;

-- Autor de confiança: o preço já nasce aprovado (a regra é a mesma, avaliada na inserção).
create or replace function public.price_observations_ai_evaluate()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.evaluate_observation(new.id);
  return null;
end $$;
revoke all on function public.price_observations_ai_evaluate() from public, anon, authenticated;

create trigger price_observations_ai_evaluate
  after insert on public.price_observations
  for each row
  when (new.status = 'pending' and new.source = 'label_photo')
  execute function public.price_observations_ai_evaluate();

-- ── Confirmar ("ainda está assim" / "mudou") ────────────────────────────────
create or replace function public.confirm_observation(
  p_observation_id uuid,
  p_verdict        public.confirmation_verdict
)
returns table (new_status public.observation_status, confirmations integer, changes integer)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  o       public.price_observations;
  v_today integer;
begin
  if v_uid is null then
    raise exception 'login obrigatório' using errcode = '42501';
  end if;

  select * into o from public.price_observations where id = p_observation_id for update;
  if not found or o.status not in ('pending', 'approved') then
    raise exception 'publicação indisponível' using errcode = 'P0002';
  end if;
  if o.created_by = v_uid then
    raise exception 'não é possível confirmar a própria publicação' using errcode = '42501';
  end if;
  if o.created_at < now() - interval '7 days'
     or (o.valid_to is not null and o.valid_to < now()) then
    raise exception 'publicação expirada' using errcode = 'P0002';
  end if;

  select count(*) into v_today
    from public.observation_confirmations
   where user_id = v_uid and created_at > now() - interval '1 day';
  if v_today >= 200 then
    raise exception 'limite diário de confirmações atingido' using errcode = '54000';
  end if;

  -- 23505 (unique_violation) se esta pessoa já votou nesta publicação.
  insert into public.observation_confirmations (observation_id, user_id, verdict)
  values (o.id, v_uid, p_verdict);

  -- Pontos: quem confirma ganha 1 (até 20 por dia, para não render pontos por clique em massa);
  -- o autor ganha 2 por cada confirmação (não por "mudou").
  if v_today < 20 then
    insert into public.reputation_events (user_id, observation_id, kind, points)
    values (v_uid, o.id, 'confirmation_given', 1)
    on conflict do nothing;
  end if;
  if p_verdict = 'confirm' and o.created_by is not null then
    insert into public.reputation_events (user_id, observation_id, kind, points, source_user_id)
    values (o.created_by, o.id, 'confirmation_received', 2, v_uid)
    on conflict do nothing;
  end if;

  perform public.evaluate_observation(o.id);

  return query
    select ob.status,
           (select count(*)::integer from public.observation_confirmations c
             where c.observation_id = ob.id and c.verdict = 'confirm'),
           (select count(*)::integer from public.observation_confirmations c
             where c.observation_id = ob.id and c.verdict = 'changed')
      from public.price_observations ob
     where ob.id = o.id;
end $$;
revoke all on function public.confirm_observation(uuid, public.confirmation_verdict)
  from public, anon;
grant execute on function public.confirm_observation(uuid, public.confirmation_verdict)
  to authenticated;

-- ── Denunciar ───────────────────────────────────────────────────────────────
create or replace function public.report_observation(
  p_observation_id uuid,
  p_reason         public.report_reason
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  o         public.price_observations;
  v_today   integer;
  v_reports integer;
begin
  if v_uid is null then
    raise exception 'login obrigatório' using errcode = '42501';
  end if;

  select * into o from public.price_observations where id = p_observation_id for update;
  if not found or o.status not in ('pending', 'approved') then
    raise exception 'publicação indisponível' using errcode = 'P0002';
  end if;
  if o.created_by = v_uid then
    raise exception 'não é possível denunciar a própria publicação' using errcode = '42501';
  end if;

  select count(*) into v_today
    from public.observation_reports
   where user_id = v_uid and created_at > now() - interval '1 day';
  if v_today >= 50 then
    raise exception 'limite diário de denúncias atingido' using errcode = '54000';
  end if;

  -- 23505 se esta pessoa já denunciou.
  insert into public.observation_reports (observation_id, user_id, reason)
  values (o.id, v_uid, p_reason);

  select count(*) into v_reports from public.observation_reports where observation_id = o.id;
  if v_reports >= 3 then
    -- vale também para preço já aprovado: o admin pode rejeitá-lo
    insert into public.review_tasks (target_type, target_id, reason, payload)
    values ('price_observation', o.id, 'Denunciada pela comunidade',
            jsonb_build_object('reports', v_reports))
    on conflict (target_type, target_id) where status in ('open', 'in_progress') do nothing;
  end if;
end $$;
revoke all on function public.report_observation(uuid, public.report_reason) from public, anon;
grant execute on function public.report_observation(uuid, public.report_reason) to authenticated;

-- ── Feed da comunidade ──────────────────────────────────────────────────────
-- Público (sem login). Mostra, por cidade, do mais novo ao mais antigo:
--   • preços aprovados (de qualquer origem);
--   • preços da comunidade ainda pendentes, desde que não contestados;
-- só dos últimos 7 dias e ainda vigentes. Devolve apenas colunas públicas: nunca o id, nome,
-- e-mail ou telefone do autor. Paginação por cursor (created_at, id), estável com publicações
-- novas chegando.
create or replace function public.list_community_feed(
  p_city_id           uuid,
  p_lat               double precision default null,
  p_lng               double precision default null,
  p_radius_m          integer          default null,
  p_promo_only        boolean          default false,
  p_before_created_at timestamptz      default null,
  p_before_id         uuid             default null,
  p_limit             integer          default 20
)
returns table (
  id uuid, created_at timestamptz, observed_at timestamptz,
  store_id uuid, store_name text, store_neighborhood text, distance_m integer,
  product_id uuid, canonical_name text, brand text, size_value numeric,
  size_unit public.size_unit, base_unit public.base_unit,
  price_cents integer, unit_price_cents integer, promo boolean, valid_to timestamptz,
  source public.observation_source, status public.observation_status,
  approved_via public.approval_kind,
  confirm_count integer, changed_count integer, has_photo boolean,
  author_label text, author_level smallint, is_mine boolean,
  my_verdict public.confirmation_verdict
)
language sql stable security definer
set search_path = ''
as $$
  select
    o.id, o.created_at, o.observed_at,
    s.id, s.name, s.neighborhood,
    case when p_lat is null or p_lng is null then null
         else round(extensions.st_distance(
                s.location, extensions.st_makepoint(p_lng, p_lat)::extensions.geography))::integer
    end,
    p.id, p.canonical_name, p.brand, p.size_value, p.size_unit, p.base_unit,
    o.price_cents, o.unit_price_cents, o.promo, o.valid_to,
    o.source, o.status, o.approved_via,
    cc.confirms, cc.changes,
    (o.source = 'label_photo' and o.source_id is not null),
    case when o.created_by is null then 'Equipe Compara Mercado'
         else public.public_author_label(o.created_by) end,
    case when o.created_by is null then null
         else public.reputation_level(a.reputation) end,
    coalesce(o.created_by = (select auth.uid()), false),
    mine.verdict
  from public.price_observations o
  join public.stores s
    on s.id = o.store_id and s.status = 'active' and s.city_id = p_city_id
  join public.products p
    on p.id = o.product_id and p.status = 'active'
  left join public.profiles a on a.id = o.created_by
  left join lateral (
    select count(*) filter (where c.verdict = 'confirm')::integer as confirms,
           count(*) filter (where c.verdict = 'changed')::integer as changes
      from public.observation_confirmations c
     where c.observation_id = o.id
  ) cc on true
  left join lateral (
    select count(*)::integer as reports
      from public.observation_reports r
     where r.observation_id = o.id
  ) rr on true
  left join public.observation_confirmations mine
    on mine.observation_id = o.id and mine.user_id = (select auth.uid())
  where (o.status = 'approved' or (o.status = 'pending' and o.source = 'label_photo'))
    and not (o.status = 'pending' and (cc.changes >= 2 or rr.reports >= 3))
    and o.created_at > now() - interval '7 days'
    and (o.valid_to is null or o.valid_to >= now())
    and (not coalesce(p_promo_only, false) or o.promo)
    and (p_radius_m is null or p_lat is null or p_lng is null
         or extensions.st_dwithin(
              s.location, extensions.st_makepoint(p_lng, p_lat)::extensions.geography, p_radius_m))
    and (p_before_created_at is null
         or (o.created_at, o.id) < (p_before_created_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by o.created_at desc, o.id desc
  limit least(greatest(p_limit, 1), 50)
$$;
revoke all on function public.list_community_feed(
  uuid, double precision, double precision, integer, boolean, timestamptz, uuid, integer) from public;
grant execute on function public.list_community_feed(
  uuid, double precision, double precision, integer, boolean, timestamptz, uuid, integer)
  to anon, authenticated;

-- ── Foto da publicação para quem está logado ────────────────────────────────
-- A foto continua privada (bucket sem URL pública). Quem está logado lê a foto de uma publicação
-- que o feed mostraria (MESMA regra de `list_community_feed`: 7 dias, ainda vigente, loja e produto
-- ativos, não contestada); o autor e o admin já liam as suas por outras políticas.
create or replace function public.can_view_community_photo(p_object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.sources src
      join public.price_observations o on o.source_id = src.id
      join public.stores s on s.id = o.store_id and s.status = 'active'
      join public.products p on p.id = o.product_id and p.status = 'active'
     where src.file_path = p_object_name
       and o.source = 'label_photo'
       and (o.status = 'approved' or o.status = 'pending')
       and o.created_at > now() - interval '7 days'
       and (o.valid_to is null or o.valid_to >= now())
       and not (
         o.status = 'pending' and (
           (select count(*) from public.observation_confirmations c
             where c.observation_id = o.id and c.verdict = 'changed') >= 2
           or (select count(*) from public.observation_reports r
                where r.observation_id = o.id) >= 3
         )
       )
  )
$$;
revoke all on function public.can_view_community_photo(text) from public, anon;
grant execute on function public.can_view_community_photo(text) to authenticated;

create policy contributions_community_select on storage.objects for select to authenticated
  using (bucket_id = 'contributions' and public.can_view_community_photo(name));
