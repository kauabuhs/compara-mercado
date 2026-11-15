-- Biblioteca de cidades (ADR-0014): municípios do IBGE, busca, leitura pública e ativação por cobertura.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ── Dados da biblioteca ─────────────────────────────────────────────────────
select cmp_ok((select count(*)::int from public.cities where country_code = 'BR'), '>=', 5500,
  'a biblioteca traz os municípios do IBGE');
select is((select count(distinct uf)::int from public.cities where country_code = 'BR' and ibge_code ~ '^\d{7}$'),
  27, 'as 27 UFs estão representadas');
select is((select region_id is not null from public.cities where ibge_code = '4305108'), true,
  'a região (UF) é resolvida na carga');

-- ── Leitura pública ─────────────────────────────────────────────────────────
set local role anon;
select is((select count(*)::int from public.cities where ibge_code = '4314100'), 1,
  'visitante enxerga uma cidade ainda desabilitada');
select throws_ok(
  $$update public.cities set active = true where ibge_code = '4314100'$$,
  '42501', null, 'visitante não habilita cidade');
reset role;

-- ── Busca ───────────────────────────────────────────────────────────────────
select is((select name from public.search_cities('caxias do sul') limit 1), 'Caxias do Sul',
  'busca por nome');
select is((select name from public.search_cities('CAXIAS', 'RS') limit 1), 'Caxias do Sul',
  'ignora caixa e acha por prefixo');
select is((select name from public.search_cities('sao paulo', 'SP') limit 1), 'São Paulo',
  'ignora acento');
select is((select name from public.search_cities('xaxias do sul') limit 1), 'Caxias do Sul',
  'tolera erro de digitação');
select is((select count(*)::int from public.search_cities('porto', 'RS') where uf <> 'RS'), 0,
  'filtra por UF');
select is((select count(*)::int from public.search_cities('a', null, 50) where store_count = 0), 0,
  'uma letra só não busca no nome: equivale a sem texto (só cidades com mercados)');

-- Sem texto: atalhos = cidades que já têm mercados.
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-1600-4000-8000-0000000000a1', (select id from public.cities where ibge_code = '4314100'),
   'Loja Passo Fundo', extensions.st_makepoint(-52.41, -28.26)::extensions.geography, 'active');
select is((select store_count from public.search_cities('') where ibge_code = '4314100'), 1,
  'sem texto, devolve as cidades com mercados e a contagem');
select ok((select active from public.cities where ibge_code = '4314100'),
  'a primeira loja ativa habilita a cidade');

-- Não habilita por loja que não é ativa.
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-1600-4000-8000-0000000000a2', (select id from public.cities where ibge_code = '4313904'),
   'Loja Panambi (pendente)', extensions.st_makepoint(-53.5, -28.29)::extensions.geography, 'pending');
select ok(not (select active from public.cities where ibge_code = '4313904'),
  'loja pendente não habilita a cidade');

-- Sem texto + UF: a UF inteira, respeitando o limite pedido e o teto de 50.
select is((select count(*)::int from public.search_cities('', 'RS', 5)), 5,
  'sem texto com UF devolve a lista da UF, no limite pedido');
select is((select count(*)::int from public.search_cities('', 'RS', 5) where uf <> 'RS'), 0,
  'sem texto com UF só devolve cidades da UF');
select is((select count(*)::int from public.search_cities('', 'RS', 1000)), 50,
  'o limite é travado em 50');
-- Curingas do LIKE são tratados como texto: "%%" não casa com tudo.
select is((select count(*)::int from public.search_cities('%%')), 0,
  'curinga % no texto é escapado');

-- Cidade de outro país não é habilitada por loja ativa (continua manual).
insert into public.markets (code, name, country_code, currency_code, timezone, locale)
values ('es-teste', 'Espanha (teste)', 'ES', 'EUR', 'Europe/Madrid', 'es-ES');
insert into public.cities (id, name, country_code, active)
values ('aaaaaaaa-1600-4000-8000-000000000099', 'Madri', 'ES', false);
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-1600-4000-8000-0000000000a3', 'aaaaaaaa-1600-4000-8000-000000000099',
   'Tienda Madri', extensions.st_makepoint(-3.70, 40.41)::extensions.geography, 'active');
select ok(not (select active from public.cities where id = 'aaaaaaaa-1600-4000-8000-000000000099'),
  'loja ativa em cidade fora do Brasil não habilita a cidade');

select * from finish();
rollback;
