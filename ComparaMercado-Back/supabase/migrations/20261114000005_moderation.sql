-- Moderação de preços (Fase 3): retirar um preço já aprovado, fechar as tarefas de revisão em
-- qualquer decisão e explicar a rejeição a quem enviou.
--
-- Achados da auditoria:
--  1. Um preço aprovado e depois denunciado não podia ser retirado: a API só decidia `pending`, e
--     nada atualizava `current_prices` quando uma observação deixava de estar aprovada.
--  2. A tarefa "Denunciada pela comunidade" nasce também para preço aprovado, mas só era fechada
--     quando a decisão vinha de `pending`: a tarefa ficava aberta para sempre.
--  3. Quem enviava o preço via só "rejeitado", sem saber por quê.

-- ── 1. Motivo da rejeição (visível ao autor e ao admin) ─────────────────────
-- A coluna é mutável pela guarda de imutabilidade (que só lista os campos do preço em si) e a leitura
-- da tabela já é restrita ao autor e ao admin (`price_obs_read`).
alter table public.price_observations
  add column review_note text check (review_note is null or length(trim(review_note)) between 3 and 200);

-- ── 1b. Quem não é admin não escolhe os campos de decisão ao inserir ────────
-- A política de INSERT (`price_obs_insert`) só olha status/origem/foto; `authenticated` tem INSERT na
-- tabela inteira, então um usuário falando direto com o PostgREST podia gravar `approved_via`,
-- `review_note`, `reviewed_*` e um `created_at` forjado (que furava o teto diário de 30 e fixava a
-- publicação no topo do feed). Aqui o banco zera/força esses campos para quem não é admin; o admin e
-- o service_role (worker, seed) continuam livres.
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
    new.approved_via := null;
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.created_at := now();

    select count(*) into v_recent
    from public.price_observations
    where created_by = v_uid and created_at > now() - interval '1 day';
    if v_recent >= 30 then
      raise exception 'limite diário de contribuições atingido' using errcode = '54000';
    end if;
  end if;
  return new;
end $$;

-- ── 2. `current_prices` acompanha qualquer mudança de/para "aprovado" ───────
-- Antes, `current_prices` (materializada) só era atualizada pelo admin (API) ou pelo cron do worker
-- a cada 10 min: um preço aprovado pela comunidade ficava só no feed e não chegava a /produto,
-- /ofertas e /lista sem o worker no ar. Agora toda transição de `status` de ou para `approved`
-- atualiza a visão na mesma transação. Cobre corroboração, autor de confiança (a aprovação roda num
-- UPDATE dentro do gatilho de INSERT), decisão do admin e retirada de preço publicado.
--
-- Inserções que já nascem aprovadas (preço manual, pipeline, seed, importação) não disparam:
-- continuam usando o refresh explícito da API ou o cron, para não atualizar a visão em carga em lote.
--
-- O gatilho é por COMANDO (não por linha) e usa tabelas de transição: um UPDATE em lote que mude N
-- preços faz UM refresh completo, não N. (Tabelas de transição não aceitam lista de colunas no
-- `UPDATE OF`, então a função confere se alguma linha mudou de/para `approved`.)
--
-- Custo: um refresh completo (CONCURRENTLY, não bloqueia leitura) por comando que mude a aprovação.
-- Aceitável no volume do beta, onde a decisão é um evento raro. Se o volume crescer, trocar por
-- upsert incremental da linha (store_id, product_id) ou refresh agrupado (debounce) no worker.
create or replace function public.refresh_current_prices_on_status_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from old_rows o
    join new_rows n on n.id = o.id
    where o.status is distinct from n.status
      and 'approved' in (o.status::text, n.status::text)
  ) then
    refresh materialized view concurrently public.current_prices;
  end if;
  return null;
end $$;
revoke all on function public.refresh_current_prices_on_status_change() from public, anon, authenticated;

create trigger price_observations_au_refresh_current_prices
  after update on public.price_observations
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function public.refresh_current_prices_on_status_change();

-- ── 3. A decisão fecha as tarefas de revisão, venha de `pending` ou de `approved` ──
drop trigger price_observations_au_resolve_tasks on public.price_observations;
create trigger price_observations_au_resolve_tasks
  after update of status on public.price_observations
  for each row
  when (old.status is distinct from new.status)
  execute function public.resolve_review_tasks_on_decision();

-- ── 4. Auditoria: retirar um preço aprovado também deixa quem decidiu ───────
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
  elsif old.status = 'approved' and new.status = 'rejected' then
    -- retirada de preço já publicado: quem retirou fica registrado, mesmo que a aprovação tenha
    -- sido da comunidade (a decisão de agora é de uma pessoa)
    new.reviewed_at := now();
    -- sem sessão (service_role/SQL), `auth.uid()` é nulo: mantém quem decidiu antes em vez de apagar
    new.reviewed_by := coalesce((select auth.uid()), old.reviewed_by);
  end if;
  return new;
end $$;
