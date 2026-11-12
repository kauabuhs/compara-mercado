-- Mercados, moedas e catálogo (família × variante, identificadores, atributos, nutrição).
-- Fixtures próprias; transação revertida ao final.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-5000-4000-8000-000000000001', '9999995', 'Cidade Catálogo', 'RS', true);
insert into public.cities (id, country_code, name, active)
values ('aaaaaaaa-5000-4000-8000-000000000002', 'ES', 'Cidade ES Teste', true);

insert into public.categories (id, name, slug) values
  ('c0000000-5000-4000-8000-000000000001', 'Bebidas Teste', 'bebidas-teste');

insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-5000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cat-admin@test.local'),
  ('cccccccc-5000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cat-user@test.local');
update public.profiles set role = 'admin' where id = 'cccccccc-5000-4000-8000-0000000000c1';

-- ── Mercados e lojas ────────────────────────────────────────────────────────
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-5000-4000-8000-0000000000a1', 'aaaaaaaa-5000-4000-8000-000000000001', 'Loja BR sem mercado informado',
    extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active');

select is(
  (select m.code from public.stores s join public.markets m on m.id = s.market_id where s.id = 'aaaaaaaa-5000-4000-8000-0000000000a1'),
  'br', 'loja sem mercado recebe o mercado padrão do país da cidade');

select throws_ok(
  $$insert into public.stores (city_id, name, location, market_id)
    values ('aaaaaaaa-5000-4000-8000-000000000002', 'Loja ES em mercado BR',
            extensions.st_makepoint(-3.7, 40.4)::extensions.geography,
            (select id from public.markets where code = 'br'))$$,
  '23514', null, 'loja não pode usar mercado de outro país');

select throws_ok(
  $$insert into public.stores (city_id, name, location)
    values ('aaaaaaaa-5000-4000-8000-000000000002', 'Loja ES sem mercado ES',
            extensions.st_makepoint(-3.7, 40.4)::extensions.geography)$$,
  '23502', null, 'país sem mercado configurado rejeita a loja (não adivinha)');

select throws_ok(
  $$insert into public.markets (code, name, country_code, region_id, currency_code, timezone)
    values ('pt-x', 'PT fuso inválido', 'PT', null, 'EUR', 'Mars/Olympus')$$,
  '22023', null, 'fuso horário precisa ser IANA válido');

select throws_ok(
  $$update public.markets set currency_code = 'USD' where code = 'br'$$,
  '42501', null, 'moeda de um mercado é imutável');

select throws_ok(
  $$insert into public.markets (code, name, country_code, currency_code, timezone)
    values ('br-dup', 'BR duplicado', 'BR', 'BRL', 'America/Sao_Paulo')$$,
  '23505', null, 'só um mercado nacional por país');

select is(
  (select count(*)::int from public.regions where country_code = 'BR'), 27,
  'as 27 unidades federativas existem como regiões');

select is(
  (select region_id is not null from public.cities where id = 'aaaaaaaa-5000-4000-8000-000000000001'),
  true, 'cidade brasileira recebe a região pela UF');

select throws_ok(
  $$insert into public.cities (country_code, name) values ('BR', 'Sem IBGE')$$,
  '23514', null, 'cidade brasileira exige código IBGE');

select is((select minor_unit::int from public.currencies where code = 'JPY'), 0, 'JPY tem 0 casas decimais');
select is((select minor_unit::int from public.currencies where code = 'BRL'), 2, 'BRL tem 2 casas decimais');

-- ── Família × variante ──────────────────────────────────────────────────────
insert into public.products (id, canonical_name, brand, category_id, size_value, size_unit, gtin, variant_label) values
  ('bbbbbbbb-5000-4000-8000-0000000000b1', 'Refrigerante Teste', 'Marca Teste', 'c0000000-5000-4000-8000-000000000001', 350, 'ml', '7891000300015', 'Lata 350 ml'),
  ('bbbbbbbb-5000-4000-8000-0000000000b2', 'Refrigerante Teste', 'Marca Teste', 'c0000000-5000-4000-8000-000000000001', 2, 'l',  '7891000300022', 'Garrafa 2 L'),
  ('bbbbbbbb-5000-4000-8000-0000000000b3', 'Refrigerante Teste', 'Marca Teste', 'c0000000-5000-4000-8000-000000000001', 2100, 'ml', '7891000300039', 'Pack 6 latas');
update public.products set pack_quantity = 6 where id = 'bbbbbbbb-5000-4000-8000-0000000000b3';

select is(
  (select count(distinct family_id)::int from public.products where id::text like 'bbbbbbbb-5000-4000-8000-0000000000b%'),
  1, 'três apresentações do mesmo produto dividem UMA família');

select is(
  (select count(*)::int from public.product_families where lower(name) = 'refrigerante teste'),
  1, 'não houve duplicação de identidade');

select ok(
  (select p.brand_id is not null and p.brand = b.name from public.products p join public.brands b on b.id = p.brand_id
   where p.id = 'bbbbbbbb-5000-4000-8000-0000000000b1'),
  'marca textual legada virou marca normalizada e continua espelhada em products.brand');

select throws_ok(
  $$update public.products set brand = 'Outra Marca' where id = 'bbbbbbbb-5000-4000-8000-0000000000b1'$$,
  '23514', null, 'marca é da família: alterar só o produto é erro explícito');

update public.brands set name = 'Marca Teste Renomeada' where slug = 'marca-teste';
select is(
  (select brand from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b2'),
  'Marca Teste Renomeada', 'renomear a marca propaga para todas as variantes');

select throws_ok(
  $$update public.products set pack_quantity = 0 where id = 'bbbbbbbb-5000-4000-8000-0000000000b1'$$,
  '23514', null, 'embalagem tem ao menos 1 unidade');

select throws_ok(
  $$delete from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b1'$$,
  '42501', null, 'produto nunca é apagado fisicamente (nem pelo dono do banco)');

select throws_ok(
  $$delete from public.product_families where id = (select family_id from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b1')$$,
  '42501', null, 'família nunca é apagada fisicamente');

-- ── Identificadores ─────────────────────────────────────────────────────────
select lives_ok(
  $$insert into public.product_identifiers (product_id, id_type, value) values
    ('bbbbbbbb-5000-4000-8000-0000000000b1', 'sku', 'REFRI-350')$$,
  'SKU cadastrado');
select throws_ok(
  $$insert into public.product_identifiers (product_id, id_type, value) values
    ('bbbbbbbb-5000-4000-8000-0000000000b2', 'sku', 'REFRI-350')$$,
  '23505', null, 'SKU é único');
select throws_ok(
  $$insert into public.product_identifiers (product_id, id_type, value) values
    ('bbbbbbbb-5000-4000-8000-0000000000b2', 'gtin_alt', '7891000300015')$$,
  '23505', null, 'GTIN alternativo não pode ser o principal de outro produto');
select throws_ok(
  $$update public.products set gtin = '7891000300998' where id = 'bbbbbbbb-5000-4000-8000-0000000000b2';
    insert into public.product_identifiers (product_id, id_type, value) values
    ('bbbbbbbb-5000-4000-8000-0000000000b1', 'gtin_alt', '7891000300998')$$,
  '23505', null, 'vale nas duas direções do GTIN');
select lives_ok(
  $$insert into public.product_identifiers (product_id, id_type, value, market_id)
    select 'bbbbbbbb-5000-4000-8000-0000000000b1', 'plu', '1234', id from public.markets where code = 'br'$$,
  'PLU por mercado');
select throws_ok(
  $$insert into public.product_identifiers (product_id, id_type, value, market_id)
    select 'bbbbbbbb-5000-4000-8000-0000000000b2', 'plu', '1234', id from public.markets where code = 'br'$$,
  '23505', null, 'o mesmo PLU não repete no mesmo mercado');
select throws_ok(
  $$insert into public.product_identifiers (product_id, id_type, value) values
    ('bbbbbbbb-5000-4000-8000-0000000000b1', 'gtin_alt', 'ABC')$$,
  '23514', null, 'GTIN alternativo tem formato válido');

-- ── Atributos, alergênicos e nutrição ───────────────────────────────────────
insert into public.attribute_definitions (code, label, value_type) values ('vegano_t', 'Vegano', 'boolean');
select lives_ok(
  $$insert into public.family_attribute_values (family_id, attribute_code, value_boolean)
    select family_id, 'vegano_t', true from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b1'$$,
  'atributo booleano com valor booleano');
select throws_ok(
  $$insert into public.family_attribute_values (family_id, attribute_code, value_text)
    select family_id, 'vegano_t', 'sim' from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b2'$$,
  '23514', null, 'valor incompatível com o tipo do atributo é rejeitado');
select throws_ok(
  $$insert into public.family_attribute_values (family_id, attribute_code, value_text, value_boolean)
    select family_id, 'vegano_t', 'x', true from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b2'$$,
  '23514', null, 'exatamente um valor por atributo');
select throws_ok(
  $$insert into public.family_nutrition (family_id, basis, carbohydrate_g, sugars_g)
    select family_id, 'per_100ml', 5, 9 from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b1'$$,
  '23514', null, 'açúcares não podem exceder carboidratos');
select lives_ok(
  $$insert into public.family_allergens (family_id, allergen_code, presence)
    select family_id, 'milk', 'may_contain' from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b1'$$,
  'alergênico declarado');

-- ── Publicação e segurança ─────────────────────────────────────────────────
insert into public.products (id, canonical_name, size_value, size_unit, status) values
  ('bbbbbbbb-5000-4000-8000-0000000000b9', 'Rascunho Teste', 1, 'kg', 'draft');

set local role anon;
select is((select count(*)::int from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b9'), 0,
  'público não vê produto em rascunho');
select is((select count(*)::int from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b1'), 1,
  'público vê produto ativo');
select is((select count(*)::int from public.product_families where name = 'Rascunho Teste'), 0,
  'público não vê família em rascunho');
select is((select count(*)::int from public.family_allergens where family_id = (select family_id from public.products where id = 'bbbbbbbb-5000-4000-8000-0000000000b1')), 1, 'público lê alergênicos de famílias ativas');
select throws_ok($$select count(*) from public.product_identifiers$$, '42501', null,
  'público não lê identificadores internos (SKU)');
select throws_ok($$insert into public.brands (name, slug) values ('X', 'x')$$, '42501', null,
  'público não escreve marcas');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-5000-4000-8000-0000000000c2","role":"authenticated"}', true);
select throws_ok($$insert into public.brands (name, slug) values ('Y', 'y')$$, '42501', null,
  'usuário comum não cria marcas (RLS)');
select is((select count(*)::int from public.product_identifiers where product_id in ('bbbbbbbb-5000-4000-8000-0000000000b1','bbbbbbbb-5000-4000-8000-0000000000b2')), 0, 'usuário comum não enxerga identificadores');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-5000-4000-8000-0000000000c1","role":"authenticated"}', true);
select lives_ok($$insert into public.brands (name, slug) values ('Marca Admin', 'marca-admin')$$, 'admin cria marca');
select is((select count(*)::int from public.product_identifiers where product_id in ('bbbbbbbb-5000-4000-8000-0000000000b1','bbbbbbbb-5000-4000-8000-0000000000b2')), 2, 'admin enxerga identificadores');
select throws_ok($$delete from public.brands where slug = 'marca-admin'$$, '42501', null,
  'nem admin apaga marca (sem privilégio de DELETE)');
reset role;

select * from finish();
rollback;
