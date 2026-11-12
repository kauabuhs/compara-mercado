-- 0020 · Contribuição de preço com foto: bucket privado, `sources` do dono e foto obrigatória
--
-- Fluxo (MVP): a API (agindo COMO o usuário, sem service_role) grava a foto re-codificada em
-- `contributions/{user_id}/{uuid}.jpg`, registra uma `sources` (kind='label') e então a
-- `price_observations` (pending, source='label_photo') apontando para ela. O admin lê a foto por
-- URL assinada curta. A foto NUNCA é pública e o dono não consegue apagá-la depois de enviar.

-- ── Bucket privado ──────────────────────────────────────────────────────────
-- A API sempre re-codifica para JPEG (remove EXIF/GPS); outros tipos nem chegam ao bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contributions', 'contributions', false, 5 * 1024 * 1024, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Dono: grava e lê apenas dentro da própria pasta `{auth.uid()}/…`. Sem UPDATE nem DELETE:
-- o comprovante de um envio não pode ser trocado ou apagado pelo autor.
create policy contributions_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contributions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy contributions_owner_select on storage.objects for select to authenticated
  using (
    bucket_id = 'contributions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- Admin: lê tudo (revisão com a foto ao lado do dado).
create policy contributions_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'contributions' and (select public.is_admin()));

-- ── `sources`: o usuário registra a própria foto de etiqueta ────────────────
-- Antes só o service_role escrevia aqui. `file_path` é o caminho do objeto no bucket e precisa
-- estar na pasta do próprio usuário; `sha256` único impede reenviar a mesma foto.
grant insert on public.sources to authenticated;
create policy sources_owner_insert on public.sources for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and kind = 'label'
    and status = 'uploaded'
    and store_id is not null
    and file_path like (select auth.uid())::text || '/%'
  );

-- ── Foto obrigatória na barreira final ──────────────────────────────────────
-- Usuário comum só envia preço pendente, por foto de etiqueta, de produto e loja ativos, e a
-- foto (source_id) precisa ser uma fonte dele. Admin continua lançando preço manual sem foto.
drop policy price_obs_insert on public.price_observations;
create policy price_obs_insert on public.price_observations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select public.is_admin())
      or (
        status = 'pending'
        and source = 'label_photo'
        and approved_by is null
        and approved_at is null
        and source_id is not null
        and exists (
          select 1 from public.sources s
          where s.id = source_id
            and s.uploaded_by = (select auth.uid())
            and s.kind = 'label'
        )
        and exists (select 1 from public.stores st where st.id = store_id and st.status = 'active')
        and exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
      )
    )
  );
