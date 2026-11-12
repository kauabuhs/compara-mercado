-- Seed LOCAL do domínio comercial. Todos os dados são FICTÍCIOS (demonstração): nomes, preços,
-- estoques, fornecedores, chaves de imagem e valores nutricionais ilustrativos. NÃO são dados de
-- mercado e NUNCA devem ser aplicados em staging/produção. Catálogos reais entram por importação
-- (ver docs/database/importacao-de-catalogo.md), não por seed.
--
-- Roda depois de seed.sql (ordem em config.toml). Usa as mesmas funções que a aplicação usa
-- (set_product_price, stock_apply_movement, redeem_promotion…), então também as exercita.

-- ── Mercados e lojas fora do Brasil (demonstram moeda, fuso e país) ─────────
update public.countries set active = true where code in ('US', 'PT');

insert into public.markets (id, code, name, country_code, currency_code, timezone, locale, prices_include_tax) values
  ('50000000-0000-4000-8000-000000000001', 'us', 'Estados Unidos', 'US', 'USD', 'America/New_York', 'en-US', false),
  ('50000000-0000-4000-8000-000000000002', 'pt', 'Portugal',       'PT', 'EUR', 'Europe/Lisbon',    'pt-PT', true);

-- cities.active = habilitada no COMPARADOR (piloto). Estas ficam inativas: existem para demonstrar
-- preço por mercado/moeda, mas não entram na comparação de lista nem na lista de cidades/lojas.
insert into public.cities (id, country_code, name, active) values
  ('10000000-0000-4000-8000-000000000011', 'US', 'Boston', false),
  ('10000000-0000-4000-8000-000000000012', 'PT', 'Lisboa', false);

insert into public.stores (id, city_id, name, address, location, status) values
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011',
   'Boston Market (demo)', 'Exemplo St, 1', extensions.st_makepoint(-71.0589, 42.3601)::extensions.geography, 'active'),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000012',
   'Mercado de Lisboa (demo)', 'Rua Exemplo, 1', extensions.st_makepoint(-9.1393, 38.7223)::extensions.geography, 'active');

-- ── Variantes: uma família, várias apresentações ────────────────────────────
-- 'Refrigerante de cola' (2 L, já no seed base) ganha 350 ml, 600 ml e o pack de 6 latas.
-- O gatilho agrupa todas na MESMA família (mesmo nome, marca e categoria).
update public.products set variant_label = 'Garrafa 2 L' where canonical_name = 'Refrigerante de cola';

insert into public.products (canonical_name, brand, category_id, size_value, size_unit, gtin, variant_label, pack_quantity)
select p.canonical_name, p.brand, p.category_id, v.size_value, 'ml'::public.size_unit, v.gtin, v.label, v.pack
from public.products p
cross join (values
  (350,  '7891000200018', 'Lata 350 ml',          1),
  (600,  '7891000200025', 'Garrafa 600 ml',       1),
  (2100, '7891000200032', 'Pack 6 latas 350 ml',  6)
) as v (size_value, gtin, label, pack)
where p.canonical_name = 'Refrigerante de cola' and p.size_value = 2;

-- itens vendidos por peso
update public.products p set sale_mode = 'by_weight'
from public.categories c
where c.id = p.category_id and c.slug in ('hortifruti', 'carnes') and p.size_unit = 'kg';

insert into public.product_identifiers (product_id, id_type, value, market_id)
select p.id, 'sku', 'COLA-350-LT', null from public.products p where p.gtin = '7891000200018';
insert into public.product_identifiers (product_id, id_type, value, market_id)
select p.id, 'gtin_alt', '7891000299990', null from public.products p where p.gtin = '7891000200025'; -- embalagem antiga
insert into public.product_identifiers (product_id, id_type, value, market_id)
select p.id, 'plu', '4011', m.id from public.products p, public.markets m
where p.canonical_name = 'Banana prata' and m.code = 'br';

-- ── Atributos, alergênicos e nutrição (valores ilustrativos) ────────────────
insert into public.attribute_definitions (code, label, value_type, unit) values
  ('organic',         'Orgânico',            'boolean', null),
  ('shelf_life_days', 'Validade',            'number',  'dias'),
  ('storage',         'Conservação',         'text',    null);

insert into public.family_attribute_values (family_id, attribute_code, value_text, value_number, value_boolean)
select p.family_id, a.code, a.t, a.n, a.b
from public.products p
cross join (values
  ('organic', null::text, null::numeric, false),
  ('shelf_life_days', null, 120, null),
  ('storage', 'Manter refrigerado após aberto', null, null)
) as a (code, t, n, b)
where p.canonical_name = 'Leite integral';

insert into public.family_allergens (family_id, allergen_code, presence)
select p.family_id, 'milk', 'contains' from public.products p where p.canonical_name = 'Leite integral';

insert into public.family_nutrition (family_id, basis, serving_size, energy_kcal, fat_g, saturated_fat_g,
                                     carbohydrate_g, sugars_g, protein_g, sodium_mg)
select p.family_id, 'per_100ml', 200, 61, 3.3, 2.1, 4.6, 4.6, 3.2, 50
from public.products p where p.canonical_name = 'Leite integral';

update public.product_families f set ingredients = 'Leite integral.'
from public.products p where p.family_id = f.id and p.canonical_name = 'Leite integral';

-- ── Listas de preço ─────────────────────────────────────────────────────────
insert into public.price_lists (id, market_id, currency_code, store_id, name, priority)
select '60000000-0000-4000-8000-000000000001', m.id, m.currency_code, null, 'Tabela base Brasil', 0 from public.markets m where m.code = 'br';
insert into public.price_lists (id, market_id, currency_code, store_id, name, priority)
select '60000000-0000-4000-8000-000000000002', m.id, m.currency_code, '20000000-0000-4000-8000-000000000002', 'Super Econômico — tabela da loja', 0
from public.markets m where m.code = 'br';
insert into public.price_lists (id, market_id, currency_code, store_id, name, priority)
select '60000000-0000-4000-8000-000000000003', m.id, m.currency_code, null, 'Tabela base EUA', 0 from public.markets m where m.code = 'us';
insert into public.price_lists (id, market_id, currency_code, store_id, name, priority)
select '60000000-0000-4000-8000-000000000004', m.id, m.currency_code, null, 'Tabela base Portugal', 0 from public.markets m where m.code = 'pt';

-- base Brasil: média dos preços observados aprovados (centavos), válida há 60 dias
insert into public.product_prices (price_list_id, product_id, amount_minor, valid_from)
select '60000000-0000-4000-8000-000000000001', cp.product_id, round(avg(cp.price_cents))::bigint, now() - interval '60 days'
from public.current_prices cp
group by cp.product_id;
-- variantes novas do refrigerante (sem observações): preço base direto
insert into public.product_prices (price_list_id, product_id, amount_minor, valid_from)
select '60000000-0000-4000-8000-000000000001', p.id, v.cents, now() - interval '60 days'
from public.products p join (values
  ('7891000200018', 399), ('7891000200025', 549), ('7891000200032', 2190)) as v (gtin, cents) on v.gtin = p.gtin;

-- histórico de reajuste: o café subiu há 20 dias, o leite há 10 (o mesmo caminho que o admin usa)
select public.set_product_price('60000000-0000-4000-8000-000000000001', p.id, 1990, now() - interval '20 days')
from public.products p where p.canonical_name = 'Café torrado e moído';
select public.set_product_price('60000000-0000-4000-8000-000000000001', p.id, 579, now() - interval '10 days')
from public.products p where p.canonical_name = 'Leite integral';

-- tabela exclusiva do Super Econômico: 5% abaixo da base em alguns itens (vence a tabela do mercado)
insert into public.product_prices (price_list_id, product_id, amount_minor, valid_from)
select '60000000-0000-4000-8000-000000000002', pp.product_id, round(pp.amount_minor * 0.95)::bigint, now() - interval '30 days'
from public.product_prices pp join public.products p on p.id = pp.product_id
where pp.price_list_id = '60000000-0000-4000-8000-000000000001' and pp.valid_to is null
  and p.canonical_name in ('Arroz branco tipo 1', 'Feijão preto', 'Açúcar refinado', 'Óleo de soja',
                           'Farinha de trigo', 'Macarrão espaguete');

-- EUA (USD, 2 casas) e Portugal (EUR): poucos itens, cada um na sua moeda
insert into public.product_prices (price_list_id, product_id, amount_minor, valid_from)
select '60000000-0000-4000-8000-000000000003', p.id, v.cents, now() - interval '30 days'
from public.products p join (values
  ('Leite integral', 349), ('Café torrado e moído', 1099), ('Ovos brancos (dúzia)', 459)) as v (name, cents)
  on v.name = p.canonical_name;
insert into public.product_prices (price_list_id, product_id, amount_minor, valid_from)
select '60000000-0000-4000-8000-000000000004', p.id, v.cents, now() - interval '30 days'
from public.products p join (values
  ('Leite integral', 89), ('Café torrado e moído', 649), ('Ovos brancos (dúzia)', 279)) as v (name, cents)
  on v.name = p.canonical_name;

-- ── Promoções (criadas como rascunho, configuradas e ativadas) ──────────────
insert into public.promotions (id, name, description, kind, currency_code, discount_percent, discount_amount_minor,
                               fixed_price_minor, starts_at, ends_at, stackable, priority, usage_limit_total) values
  ('70000000-0000-4000-8000-000000000001', 'Café com 20% (demo)', 'Semana do café', 'percent_off', null, 20, null, null,
     now() - interval '1 day', now() + interval '7 days', false, 10, null),
  ('70000000-0000-4000-8000-000000000002', 'Leite a R$ 4,99 no Super Econômico (demo)', 'Só nesta loja', 'fixed_price', 'BRL', null, null, 499,
     now() - interval '1 day', now() + interval '2 days', false, 5, 100),
  ('70000000-0000-4000-8000-000000000003', 'Arroz 15% — ENCERRADA (demo)', 'Venceu ontem e ainda está "active": prova da vigência calculada', 'percent_off', null, 15, null, null,
     now() - interval '10 days', now() - interval '1 day', false, 0, null),
  ('70000000-0000-4000-8000-000000000004', 'Feijão −R$ 1,00 — FUTURA (demo)', 'Começa em 3 dias', 'amount_off', 'BRL', null, 100, null,
     now() + interval '3 days', now() + interval '10 days', false, 0, null),
  ('70000000-0000-4000-8000-000000000005', 'Marca Serra Verde −5% acumulável (demo)', 'Acumula com outras ofertas', 'percent_off', null, 5, null, null,
     now() - interval '1 day', now() + interval '30 days', true, 1, null),
  ('70000000-0000-4000-8000-000000000006', 'Coffee 10% off (demo)', 'US market', 'percent_off', null, 10, null, null,
     now() - interval '1 day', now() + interval '14 days', false, 0, null);

insert into public.promotion_products (promotion_id, product_id)
select v.pid::uuid, p.id from public.products p join (values
  ('70000000-0000-4000-8000-000000000001', 'Café torrado e moído'),
  ('70000000-0000-4000-8000-000000000002', 'Leite integral'),
  ('70000000-0000-4000-8000-000000000003', 'Arroz branco tipo 1'),
  ('70000000-0000-4000-8000-000000000004', 'Feijão preto'),
  ('70000000-0000-4000-8000-000000000006', 'Café torrado e moído')) as v (pid, name) on v.name = p.canonical_name;

insert into public.promotion_rules (promotion_id, kind, brand_id)
select '70000000-0000-4000-8000-000000000005', 'target_brand', b.id from public.brands b where b.slug = 'serra-verde';

insert into public.promotion_scopes (promotion_id, market_id, store_id)
select v.pid::uuid, m.id, v.store::uuid from public.markets m join (values
  ('70000000-0000-4000-8000-000000000001', 'br', null),
  ('70000000-0000-4000-8000-000000000002', 'br', '20000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000003', 'br', null),
  ('70000000-0000-4000-8000-000000000004', 'br', null),
  ('70000000-0000-4000-8000-000000000005', 'br', null),
  ('70000000-0000-4000-8000-000000000006', 'us', null)) as v (pid, code, store) on v.code = m.code;

update public.promotions set status = 'active' where id::text like '70000000-0000-4000-8000-00000000000%';

-- um resgate de demonstração (idempotente por pedido)
select public.redeem_promotion('70000000-0000-4000-8000-000000000002', 'demo-order-1',
                               '20000000-0000-4000-8000-000000000002', null, 80);

-- ── Fornecedores ────────────────────────────────────────────────────────────
insert into public.suppliers (id, name, legal_name, country_code, email) values
  ('80000000-0000-4000-8000-000000000001', 'Distribuidora Exemplo (demo)', null, 'BR', 'compras@exemplo.invalid'),
  ('80000000-0000-4000-8000-000000000002', 'Laticínios Modelo (demo)',     null, 'BR', 'vendas@modelo.invalid');

insert into public.supplier_products (supplier_id, product_id, supplier_sku, cost_minor, currency_code, lead_time_days, is_preferred)
select v.sid::uuid, p.id, v.sku, v.cost, 'BRL', v.lead, true
from public.products p join (values
  ('80000000-0000-4000-8000-000000000002', 'Leite integral',         'LM-LEITE-1L', 410, 2),
  ('80000000-0000-4000-8000-000000000001', 'Café torrado e moído',   'DE-CAFE-500', 1450, 5),
  ('80000000-0000-4000-8000-000000000001', 'Arroz branco tipo 1',    'DE-ARROZ-5K', 2100, 5)) as v (sid, name, sku, cost, lead)
  on v.name = p.canonical_name;

-- ── Depósitos e estoque (tudo via funções: razão de movimentações coerente) ──
insert into public.warehouses (id, market_id, code, name, kind, store_id)
select '90000000-0000-4000-8000-000000000001', m.id, 'dc-caxias', 'Centro de Distribuição (demo)', 'distribution_center', null
from public.markets m where m.code = 'br';
insert into public.warehouses (id, market_id, code, name, kind, store_id)
select '90000000-0000-4000-8000-000000000002', m.id, 'loja-centro', 'Estoque Mercado Centro (demo)', 'store_stock', '20000000-0000-4000-8000-000000000001'
from public.markets m where m.code = 'br';

select public.stock_apply_movement('90000000-0000-4000-8000-000000000001', p.id, 'receipt', 500,
         'demo-po-1', null, '80000000-0000-4000-8000-000000000001', 1000, 'BRL', 'seed:receipt:' || p.id)
from public.products p
where p.canonical_name in ('Café torrado e moído', 'Arroz branco tipo 1', 'Leite integral', 'Feijão preto', 'Açúcar refinado');

select public.transfer_stock('90000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', p.id, 60, 'demo-transfer-1')
from public.products p where p.canonical_name in ('Café torrado e moído', 'Leite integral');

update public.inventory set min_level = 80, max_level = 400
where warehouse_id = '90000000-0000-4000-8000-000000000002';

select public.reserve_stock('90000000-0000-4000-8000-000000000002', p.id, 5, 'demo-cart-1')
from public.products p where p.canonical_name = 'Leite integral';

-- ── Mídias (metadados fictícios: as chaves NÃO apontam para arquivos reais) ─
insert into public.media_assets (id, object_key, mime_type, byte_size, width, height, sha256, alt_text)
select v.id::uuid, 'demo/' || v.slug || '/original.jpg', 'image/jpeg', 180000, 1600, 1600,
       encode(extensions.digest('demo-' || v.slug, 'sha256'), 'hex'), v.alt
from (values
  ('a0000000-0000-4000-8000-000000000001', 'leite-integral', 'Caixa de leite integral 1 litro'),
  ('a0000000-0000-4000-8000-000000000002', 'cafe-500g',      'Pacote de café torrado e moído 500 g'),
  ('a0000000-0000-4000-8000-000000000003', 'serra-verde',    'Logotipo Serra Verde'),
  ('a0000000-0000-4000-8000-000000000004', 'pendente',       'Imagem aguardando processamento')
) as v (id, slug, alt);

insert into public.media_renditions (asset_id, variant, format, width, height, byte_size, object_key)
select a.id, r.variant::public.media_variant, r.format::public.media_format, r.w, r.w, r.bytes,
       'demo/' || split_part(split_part(a.object_key, '/', 2), '/', 1) || '/' || r.variant || '.' || r.format
from public.media_assets a cross join (values
  ('thumb', 'webp', 160, 6000), ('thumb', 'avif', 160, 4000),
  ('small', 'webp', 320, 14000), ('medium', 'webp', 800, 52000), ('large', 'webp', 1600, 160000)) as r (variant, format, w, bytes)
where a.id::text in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
                     'a0000000-0000-4000-8000-000000000003');

update public.media_assets set status = 'ready'
where id::text in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
                   'a0000000-0000-4000-8000-000000000003');

insert into public.product_media (product_id, asset_id, position, is_primary)
select p.id, v.asset::uuid, 0, true from public.products p join (values
  ('Leite integral', 'a0000000-0000-4000-8000-000000000001'),
  ('Café torrado e moído', 'a0000000-0000-4000-8000-000000000002')) as v (name, asset) on v.name = p.canonical_name;
insert into public.brand_media (brand_id, asset_id, position, is_primary)
select b.id, 'a0000000-0000-4000-8000-000000000003', 0, true from public.brands b where b.slug = 'serra-verde';
