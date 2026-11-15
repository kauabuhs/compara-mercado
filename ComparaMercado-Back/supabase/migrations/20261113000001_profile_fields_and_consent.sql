-- 0021 · Dados da conta: telefone, cidade preferida e registro de consentimento (ADR-0009)
-- Dados mínimos (LGPD): só o que o serviço usa. Sem CPF, data de nascimento ou endereço.
-- O aceite dos termos é gravado no cadastro pela trigger (nunca editável pelo usuário depois).

alter table public.profiles
  add column phone             text
    constraint profiles_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column city_id           uuid references public.cities (id) on delete set null,
  add column terms_accepted_at timestamptz,
  add column terms_version     text
    constraint profiles_terms_version_format check (terms_version is null or terms_version ~ '^\d{4}-\d{2}(-\d{2})?$'),
  add column updated_at        timestamptz not null default now();

create index profiles_city_idx on public.profiles (city_id) where city_id is not null;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- O usuário edita só nome, telefone e cidade. `role`, `reputation` e `terms_*` seguem fora do
-- alcance dele (o grant de coluna barra `terms_*`; `profiles_guard` barra papel e reputação).
grant update (display_name, phone, city_id) on public.profiles to authenticated;

-- Cadastro: cria o perfil com o nome informado e registra o aceite dos termos.
-- Os metadados vêm do cliente, então tudo é validado: o nome é aparado e limitado, o aceite só vale
-- se a versão tiver o formato `AAAA-MM[-DD]`, e o papel NUNCA vem de metadados (sempre `user`).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name  text := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 40), '');
  v_terms text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), '');
begin
  if v_name is not null and length(v_name) < 2 then
    v_name := null;
  end if;
  if v_terms is not null and v_terms !~ '^\d{4}-\d{2}(-\d{2})?$' then
    v_terms := null;
  end if;

  insert into public.profiles (id, display_name, terms_version, terms_accepted_at)
  values (new.id, v_name, v_terms, case when v_terms is not null then now() end);
  return new;
end $$;
