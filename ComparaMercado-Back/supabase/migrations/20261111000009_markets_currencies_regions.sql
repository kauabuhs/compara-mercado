-- 0009 · Países, moedas, regiões e mercados comerciais (base multi-país)
--
-- Glossário (importante: "mercado" tem dois sentidos neste projeto)
--   store  (`stores`)   = estabelecimento físico (o "mercado" da interface: Mercado Centro, Atacado…)
--   market (`markets`)  = escopo comercial de preço/promoção: país (+ região opcional), moeda,
--                         fuso e convenção fiscal. Todo `store` pertence a exatamente um `market`.
--
-- Mudanças em tabelas existentes são ADITIVAS ou RELAXAM restrições (NOT NULL → NULL):
-- nenhuma coluna é removida, nenhum dado é apagado.

-- ── Moedas (ISO 4217) ───────────────────────────────────────────────────────
-- `minor_unit` = nº de casas decimais da moeda (BRL 2, JPY 0, KWD 3). Valores monetários do
-- sistema são guardados em UNIDADE MENOR (inteiro) e convertidos com este expoente.
create table public.currencies (
  code        char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name        text not null,
  minor_unit  smallint not null check (minor_unit between 0 and 4),
  symbol      text,
  active      boolean not null default true
);

-- Subconjunto curado (moedas dos países-alvo prováveis). Ampliar por migração.
insert into public.currencies (code, name, minor_unit, symbol) values
  ('BRL', 'Real brasileiro',        2, 'R$'),
  ('USD', 'Dólar americano',        2, '$'),
  ('EUR', 'Euro',                   2, '€'),
  ('GBP', 'Libra esterlina',        2, '£'),
  ('ARS', 'Peso argentino',         2, '$'),
  ('CLP', 'Peso chileno',           0, '$'),
  ('UYU', 'Peso uruguaio',          2, '$U'),
  ('PYG', 'Guarani paraguaio',      0, '₲'),
  ('MXN', 'Peso mexicano',          2, '$'),
  ('COP', 'Peso colombiano',        2, '$'),
  ('PEN', 'Sol peruano',            2, 'S/'),
  ('CAD', 'Dólar canadense',        2, '$'),
  ('JPY', 'Iene japonês',           0, '¥')
on conflict (code) do nothing;

-- ── Países (ISO 3166-1 alfa-2) ──────────────────────────────────────────────
create table public.countries (
  code              char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name              text not null,
  default_currency  char(3) not null references public.currencies (code),
  active            boolean not null default false
);

insert into public.countries (code, name, default_currency, active) values
  ('BR', 'Brasil',          'BRL', true),
  ('US', 'Estados Unidos',  'USD', false),
  ('PT', 'Portugal',        'EUR', false),
  ('ES', 'Espanha',         'EUR', false),
  ('GB', 'Reino Unido',     'GBP', false),
  ('CA', 'Canadá',          'CAD', false),
  ('MX', 'México',          'MXN', false),
  ('AR', 'Argentina',       'ARS', false),
  ('CL', 'Chile',           'CLP', false),
  ('UY', 'Uruguai',         'UYU', false),
  ('PY', 'Paraguai',        'PYG', false),
  ('CO', 'Colômbia',        'COP', false),
  ('PE', 'Peru',            'PEN', false),
  ('JP', 'Japão',           'JPY', false)
on conflict (code) do nothing;

-- ── Regiões (subdivisões administrativas, ISO 3166-2) ───────────────────────
create table public.regions (
  id            uuid primary key default gen_random_uuid(),
  country_code  char(2) not null references public.countries (code),
  parent_id     uuid references public.regions (id),
  code          text not null check (length(code) between 3 and 10),   -- ex.: BR-RS, US-CA
  name          text not null,
  unique (country_code, code)
);

insert into public.regions (country_code, code, name)
select 'BR', 'BR-' || uf, name
from (values
  ('AC','Acre'),('AL','Alagoas'),('AP','Amapá'),('AM','Amazonas'),('BA','Bahia'),('CE','Ceará'),
  ('DF','Distrito Federal'),('ES','Espírito Santo'),('GO','Goiás'),('MA','Maranhão'),
  ('MT','Mato Grosso'),('MS','Mato Grosso do Sul'),('MG','Minas Gerais'),('PA','Pará'),
  ('PB','Paraíba'),('PR','Paraná'),('PE','Pernambuco'),('PI','Piauí'),('RJ','Rio de Janeiro'),
  ('RN','Rio Grande do Norte'),('RS','Rio Grande do Sul'),('RO','Rondônia'),('RR','Roraima'),
  ('SC','Santa Catarina'),('SP','São Paulo'),('SE','Sergipe'),('TO','Tocantins')
) as t (uf, name)
on conflict (country_code, code) do nothing;

-- ── Mercados comerciais ─────────────────────────────────────────────────────
create table public.markets (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[a-z0-9-]+$'),
  name                text not null check (length(trim(name)) > 0),
  country_code        char(2) not null references public.countries (code),
  region_id           uuid references public.regions (id),   -- null = mercado do país inteiro
  currency_code       char(3) not null references public.currencies (code),
  timezone            text not null,                          -- IANA; validado por gatilho
  locale              text not null default 'pt-BR' check (locale ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  prices_include_tax  boolean not null default true,          -- convenção de exibição do país
  status              public.record_status not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- alvo de chaves estrangeiras compostas: garante que lista de preço e mercado têm a MESMA moeda
  unique (id, currency_code)
);
-- Um mercado de país inteiro por país (regionais podem coexistir). Resolve o mercado padrão de uma loja.
create unique index markets_country_default_uq on public.markets (country_code) where region_id is null;

create or replace function public.markets_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'fuso horário IANA inválido: %', new.timezone using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.currency_code is distinct from old.currency_code then
    -- trocar a moeda de um mercado reinterpretaria todos os preços já gravados
    raise exception 'a moeda de um mercado é imutável; crie outro mercado' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger markets_bi_bu before insert or update on public.markets
  for each row execute function public.markets_validate();
create trigger markets_updated_at before update on public.markets
  for each row execute function public.set_updated_at();

-- Mercado base (necessário para classificar as lojas já existentes).
insert into public.markets (code, name, country_code, currency_code, timezone, locale)
values ('br', 'Brasil', 'BR', 'BRL', 'America/Sao_Paulo', 'pt-BR')
on conflict (code) do nothing;

-- ── cities: deixa de ser exclusiva do Brasil ────────────────────────────────
alter table public.cities
  add column country_code char(2) not null default 'BR' references public.countries (code),
  add column region_id uuid references public.regions (id),
  alter column ibge_code drop not null,
  alter column uf drop not null;
alter table public.cities
  add constraint cities_br_requires_ibge check (country_code <> 'BR' or ibge_code is not null);

update public.cities c
set region_id = r.id
from public.regions r
where r.country_code = c.country_code and r.code = 'BR-' || c.uf and c.region_id is null;

-- Evita a mesma cidade duplicada fora do Brasil (no Brasil o IBGE já é único).
alter table public.cities
  add constraint cities_country_region_name_uq unique nulls not distinct (country_code, region_id, name);

create or replace function public.cities_resolve_region()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.region_id is null and new.country_code = 'BR' and new.uf is not null then
    select id into new.region_id from public.regions where country_code = 'BR' and code = 'BR-' || new.uf;
  end if;
  return new;
end $$;
create trigger cities_bi_region before insert or update of uf, country_code on public.cities
  for each row execute function public.cities_resolve_region();

-- ── stores: pertencem a um mercado ──────────────────────────────────────────
alter table public.stores add column market_id uuid references public.markets (id);
-- alvo de FK composta (store_id, market_id) usada por listas de preço, promoções e depósitos
alter table public.stores add constraint stores_id_market_uq unique (id, market_id);

update public.stores s
set market_id = (select m.id from public.markets m where m.code = 'br')
where s.market_id is null;

alter table public.stores alter column market_id set not null;
create index stores_market_idx on public.stores (market_id) where status = 'active';

create or replace function public.stores_resolve_market()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_city_country char(2);
  v_market_country char(2);
begin
  select country_code into v_city_country from public.cities where id = new.city_id;
  if new.market_id is null then
    -- compatibilidade: quem não informa o mercado recebe o mercado padrão do país da cidade
    select m.id into new.market_id
    from public.markets m
    where m.country_code = v_city_country and m.region_id is null and m.status <> 'archived'
    order by m.created_at, m.id
    limit 1;
    if new.market_id is null then
      raise exception 'não há mercado comercial para o país %', v_city_country using errcode = '23502';
    end if;
  end if;
  select country_code into v_market_country from public.markets where id = new.market_id;
  if v_market_country is distinct from v_city_country then
    raise exception 'o mercado da loja (%) não é do mesmo país da cidade (%)',
      v_market_country, v_city_country using errcode = '23514';
  end if;
  return new;
end $$;
create trigger stores_bi_market before insert or update of market_id, city_id on public.stores
  for each row execute function public.stores_resolve_market();

-- ── Segurança: leitura pública de referência; escrita só admin; sem DELETE ──
alter table public.currencies enable row level security;
alter table public.countries  enable row level security;
alter table public.regions    enable row level security;
alter table public.markets    enable row level security;

grant select on public.currencies, public.countries, public.regions, public.markets to anon, authenticated;
grant insert, update on public.currencies, public.countries, public.regions, public.markets to authenticated;

create policy currencies_read on public.currencies for select to anon, authenticated using (true);
create policy countries_read  on public.countries  for select to anon, authenticated using (true);
create policy regions_read    on public.regions    for select to anon, authenticated using (true);
create policy markets_read    on public.markets    for select to anon, authenticated
  using (status = 'active' or (select public.is_admin()));

create policy currencies_admin_ins on public.currencies for insert to authenticated with check ((select public.is_admin()));
create policy currencies_admin_upd on public.currencies for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy countries_admin_ins on public.countries for insert to authenticated with check ((select public.is_admin()));
create policy countries_admin_upd on public.countries for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy regions_admin_ins on public.regions for insert to authenticated with check ((select public.is_admin()));
create policy regions_admin_upd on public.regions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy markets_admin_ins on public.markets for insert to authenticated with check ((select public.is_admin()));
create policy markets_admin_upd on public.markets for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create trigger audit_markets after insert or update or delete on public.markets
  for each row execute function public.audit_changes();
