-- 0004 · Negar por padrão: privilégios mínimos + RLS em TODAS as tabelas do schema public
--
-- Camadas: (1) GRANT mínimo por papel; (2) RLS decide linha a linha; (3) triggers protegem
-- invariantes. O app não é confiável: a segurança vive aqui.

-- Tabelas futuras do schema public nascem sem acesso para anon/authenticated.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter table public.cities              enable row level security;
alter table public.stores              enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.product_aliases     enable row level security;
alter table public.price_observations  enable row level security;
alter table public.sources             enable row level security;
alter table public.extractions         enable row level security;
alter table public.review_tasks        enable row level security;
alter table public.profiles            enable row level security;
alter table public.shopping_lists      enable row level security;
alter table public.list_items          enable row level security;
alter table public.contributions       enable row level security;
alter table public.audit_log           enable row level security;

-- ── Leitura pública: apenas lojas, produtos e categorias ativos ─────────────
grant select on public.cities, public.stores, public.categories, public.products to anon, authenticated;

create policy cities_read on public.cities for select to anon, authenticated
  using (active or (select public.is_admin()));
create policy stores_read on public.stores for select to anon, authenticated
  using (status = 'active' or (select public.is_admin()));
create policy categories_read on public.categories for select to anon, authenticated
  using (true);
create policy products_read on public.products for select to anon, authenticated
  using (status = 'active' or (select public.is_admin()));

-- ── Escrita de catálogo: somente admin (sem DELETE: usa-se status) ──────────
grant insert, update on public.cities, public.stores, public.categories, public.products to authenticated;

create policy cities_admin_write on public.cities for insert to authenticated
  with check ((select public.is_admin()));
create policy cities_admin_update on public.cities for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy stores_admin_write on public.stores for insert to authenticated
  with check ((select public.is_admin()));
create policy stores_admin_update on public.stores for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_admin_write on public.categories for insert to authenticated
  with check ((select public.is_admin()));
create policy categories_admin_update on public.categories for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy products_admin_write on public.products for insert to authenticated
  with check ((select public.is_admin()));
create policy products_admin_update on public.products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ── Observações de preço ────────────────────────────────────────────────────
-- Público NÃO lê a tabela: lê `current_prices`, `price_board` e `price_history()`
-- (só preços aprovados, sem expor quem contribuiu).
grant select, insert, update on public.price_observations to authenticated;

create policy price_obs_read on public.price_observations for select to authenticated
  using (created_by = (select auth.uid()) or (select public.is_admin()));

-- Usuário comum: só envia foto de etiqueta, sempre pendente, em seu próprio nome.
-- Admin: lança preço manual já aprovado.
create policy price_obs_insert on public.price_observations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select public.is_admin())
      or (status = 'pending' and source = 'label_photo' and approved_by is null and approved_at is null)
    )
  );

create policy price_obs_admin_update on public.price_observations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ── Pipeline interno (admin) ────────────────────────────────────────────────
grant select, insert, update on public.product_aliases to authenticated;
create policy aliases_admin_select on public.product_aliases for select to authenticated
  using ((select public.is_admin()));
create policy aliases_admin_insert on public.product_aliases for insert to authenticated
  with check ((select public.is_admin()));
create policy aliases_admin_update on public.product_aliases for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.sources to authenticated;
create policy sources_read on public.sources for select to authenticated
  using (uploaded_by = (select auth.uid()) or (select public.is_admin()));
-- Uploads passam pelo servidor (service_role): valida tipo, remove EXIF e grava `sources`.

grant select on public.extractions to authenticated;
create policy extractions_admin_select on public.extractions for select to authenticated
  using ((select public.is_admin()));

grant select, insert, update on public.review_tasks to authenticated;
create policy review_tasks_admin_select on public.review_tasks for select to authenticated
  using ((select public.is_admin()));
create policy review_tasks_admin_insert on public.review_tasks for insert to authenticated
  with check ((select public.is_admin()));
create policy review_tasks_admin_update on public.review_tasks for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ── Perfis: cada um enxerga e edita só o próprio apelido ────────────────────
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ── Listas: dono total, ninguém mais ────────────────────────────────────────
grant select, insert, update, delete on public.shopping_lists, public.list_items to authenticated;

create policy lists_owner_select on public.shopping_lists for select to authenticated
  using (user_id = (select auth.uid()));
create policy lists_owner_insert on public.shopping_lists for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy lists_owner_update on public.shopping_lists for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy lists_owner_delete on public.shopping_lists for delete to authenticated
  using (user_id = (select auth.uid()));

create policy list_items_owner_select on public.list_items for select to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())));
create policy list_items_owner_insert on public.list_items for insert to authenticated
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())));
create policy list_items_owner_update on public.list_items for update to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())))
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())));
create policy list_items_owner_delete on public.list_items for delete to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())));

-- ── Contribuições (pontos): usuário vê as suas; quem concede é o servidor ───
grant select on public.contributions to authenticated;
create policy contributions_read on public.contributions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ── Auditoria: só admin lê; ninguém escreve (apenas triggers SECURITY DEFINER) ──
grant select on public.audit_log to authenticated;
create policy audit_admin_select on public.audit_log for select to authenticated
  using ((select public.is_admin()));

-- ── Storage: buckets privados; sem políticas = nenhum acesso direto do navegador ─
-- Todo upload/leitura passa pelo servidor (valida tipo e tamanho, remove EXIF, assina URL).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('flyers', 'flyers', false, 15 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('labels', 'labels', false, 5 * 1024 * 1024,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
