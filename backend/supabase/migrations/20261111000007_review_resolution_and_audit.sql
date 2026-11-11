-- Revisão de preços: fechar o ciclo e deixar rastro.
--
-- Achados do QA:
--  1. Aprovar/rejeitar uma observação não resolvia a review_task correspondente: a tarefa ficava
--     "open" para sempre (a fila da interface lê observações, então ninguém via, mas a tabela
--     acumulava tarefas fantasmas e qualquer métrica de "pendências" mentia).
--  2. Só a aprovação deixava rastro (approved_by/approved_at). Rejeitar não registrava quem decidiu.
--
-- Fazemos no banco (e não só na API) para valer por qualquer porta de entrada: API, worker, SQL.

-- ── Auditoria da decisão (aprovação OU rejeição) ────────────────────────────
alter table public.price_observations
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz;

create or replace function public.price_observations_review_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, (select auth.uid()));
  end if;
  return new;
end $$;

-- nome depois de price_observations_bu (guarda de imutabilidade) na ordem alfabética dos gatilhos
create trigger price_observations_bu_review
  before update on public.price_observations
  for each row execute function public.price_observations_review_audit();

-- ── Resolve a tarefa de revisão quando a observação é decidida ──────────────
-- SECURITY DEFINER: a consistência não pode depender de quem dispara (RLS de review_tasks é só
-- de admin; sem isto, uma decisão feita por outra via deixaria a tarefa aberta em silêncio).
create or replace function public.resolve_review_tasks_on_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.review_tasks
     set status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid())
   where target_type = 'price_observation'
     and target_id = new.id
     and status in ('open', 'in_progress');
  return null;
end $$;
revoke all on function public.resolve_review_tasks_on_decision() from public, anon, authenticated;

create trigger price_observations_au_resolve_tasks
  after update of status on public.price_observations
  for each row
  when (old.status = 'pending' and new.status is distinct from old.status)
  execute function public.resolve_review_tasks_on_decision();

-- ── Backfill: tarefas que já ficaram abertas apesar de a observação ter sido decidida ──
update public.review_tasks t
   set status = 'resolved',
       resolved_at = coalesce(o.approved_at, now()),
       resolved_by = o.approved_by
  from public.price_observations o
 where t.target_type = 'price_observation'
   and t.target_id = o.id
   and t.status in ('open', 'in_progress')
   and o.status <> 'pending';
