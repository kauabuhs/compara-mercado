-- 0024 · Caminho da foto de uma publicação visível para a comunidade (ADR-0010)
--
-- A API lê a foto no Storage agindo COMO o usuário (sem service_role). Quem não é o autor não lê
-- `price_observations` nem `sources`, então não tem como descobrir o caminho do arquivo. Esta
-- função devolve o caminho SÓ quando a publicação seria mostrada pelo feed (mesma regra de
-- `can_view_community_photo`); a política de Storage faz a segunda checagem na hora do download.

create or replace function public.community_photo_path(p_observation_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select src.file_path
    from public.price_observations o
    join public.sources src on src.id = o.source_id
   where o.id = p_observation_id
     and public.can_view_community_photo(src.file_path)
   limit 1
$$;
revoke all on function public.community_photo_path(uuid) from public, anon;
grant execute on function public.community_photo_path(uuid) to authenticated;
