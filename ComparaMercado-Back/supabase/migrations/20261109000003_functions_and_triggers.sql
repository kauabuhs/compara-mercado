-- 0003 · Funções auxiliares, guardas de integridade, auditoria e antiabuso

-- ── Papéis (checados no banco, não só na interface) ─────────────────────────
-- SECURITY DEFINER para ler `profiles` sem recursão de RLS. search_path vazio evita sequestro.

create or replace function public.app_role()
returns public.user_role
language sql stable security definer
set search_path = ''
as $$ select role from public.profiles where id = (select auth.uid()) $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select coalesce((select role = 'admin' from public.profiles where id = (select auth.uid())), false) $$;

revoke all on function public.app_role() from public, anon;
revoke all on function public.is_admin() from public;
grant execute on function public.app_role() to authenticated;
-- anon precisa executar is_admin(): as políticas de leitura pública a avaliam (devolve false
-- sem sessão). Não vaza nada: só responde sobre o próprio auth.uid().
grant execute on function public.is_admin() to anon, authenticated;

-- ── Perfil criado automaticamente no cadastro (dados mínimos: sem CPF) ──────

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- O papel NUNCA vem de metadados do cadastro: sempre começa como 'user'.
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 40), ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── price_observations: somente inclusão ────────────────────────────────────

-- Calcula o preço por unidade base no banco: fonte única da verdade, o cliente não decide.
create or replace function public.price_observations_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base_qty numeric;
  v_uid uuid := (select auth.uid());
  v_recent integer;
begin
  select base_quantity into v_base_qty from public.products where id = new.product_id;
  if v_base_qty is null then
    raise exception 'produto % não encontrado', new.product_id using errcode = '23503';
  end if;
  new.unit_price_cents := greatest(1, round(new.price_cents / v_base_qty)::integer);

  -- Antiabuso: usuários comuns têm teto diário de contribuições (admin e service_role ficam de fora).
  if v_uid is not null and not public.is_admin() then
    select count(*) into v_recent
    from public.price_observations
    where created_by = v_uid and created_at > now() - interval '1 day';
    if v_recent >= 30 then
      raise exception 'limite diário de contribuições atingido' using errcode = '54000';
    end if;
  end if;
  return new;
end $$;

create trigger price_observations_bi
  before insert on public.price_observations
  for each row execute function public.price_observations_before_insert();

-- Campos do preço são imutáveis; só o ciclo de revisão (status/aprovação) pode mudar.
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
    new.approved_by := coalesce(new.approved_by, (select auth.uid()));
  end if;
  return new;
end $$;

create trigger price_observations_bu
  before update or delete on public.price_observations
  for each row execute function public.price_observations_guard();

-- ── Perfis: usuário comum não promove a si mesmo ────────────────────────────

create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.reputation is distinct from old.reputation)
     and (select auth.uid()) is not null
     and not public.is_admin() then
    raise exception 'apenas admin altera papel ou reputação' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_bu
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- ── Auditoria: quem mudou o quê ─────────────────────────────────────────────
-- Sem dados pessoais no diff: perfis não são auditados por linha inteira (só mudança de papel).

create or replace function public.audit_changes()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor, action, entity, entity_id, diff)
  values (
    (select auth.uid()),
    tg_op,
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    case tg_op
      when 'INSERT' then to_jsonb(new)
      when 'DELETE' then to_jsonb(old)
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    end
  );
  return null;
end $$;

create trigger audit_cities   after insert or update or delete on public.cities
  for each row execute function public.audit_changes();
create trigger audit_stores   after insert or update or delete on public.stores
  for each row execute function public.audit_changes();
create trigger audit_products after insert or update or delete on public.products
  for each row execute function public.audit_changes();
create trigger audit_aliases  after insert or update or delete on public.product_aliases
  for each row execute function public.audit_changes();
-- observações: só as mudanças de status (aprovar/rejeitar) interessam; inserts são volumosos
create trigger audit_observations after update on public.price_observations
  for each row execute function public.audit_changes();

create or replace function public.audit_role_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    insert into public.audit_log (actor, action, entity, entity_id, diff)
    values ((select auth.uid()), 'ROLE_CHANGE', 'profiles', new.id::text,
            jsonb_build_object('old_role', old.role, 'new_role', new.role));
  end if;
  return null;
end $$;

create trigger audit_profile_role after update on public.profiles
  for each row execute function public.audit_role_change();

-- A trilha de auditoria só é escrita por triggers; privilégios e RLS em 0004.
