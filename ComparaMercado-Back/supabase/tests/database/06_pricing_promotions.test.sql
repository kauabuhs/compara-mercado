-- Preços por mercado/loja, versionamento, promoções (vigência, expiração, empilhamento, limites).
-- Fixtures próprias; transação revertida. Instantes são relativos a now() (constante na transação).
begin;
create extension if not exists pgtap with schema extensions;
select plan(76);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-6000-4000-8000-000000000001', '9999996', 'Cidade Preço', 'RS', true);
insert into public.markets (id, code, name, country_code, currency_code, timezone)
values ('a1111111-6000-4000-8000-000000000001', 'ca-t', 'Canadá Teste', 'CA', 'CAD', 'America/Toronto');
insert into public.cities (id, country_code, name, active)
values ('aaaaaaaa-6000-4000-8000-000000000002', 'CA', 'Toronto Teste', true);

insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-6000-4000-8000-0000000000a1', 'aaaaaaaa-6000-4000-8000-000000000001', 'Loja 1', extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active'),
  ('aaaaaaaa-6000-4000-8000-0000000000a2', 'aaaaaaaa-6000-4000-8000-000000000001', 'Loja 2', extensions.st_makepoint(-51.19, -29.18)::extensions.geography, 'active'),
  ('aaaaaaaa-6000-4000-8000-0000000000a3', 'aaaaaaaa-6000-4000-8000-000000000002', 'Loja CA', extensions.st_makepoint(-79.38, 43.65)::extensions.geography, 'active');

insert into public.categories (id, parent_id, name, slug) values
  ('c0000000-6000-4000-8000-000000000001', null, 'Pai Teste', 'pai-teste'),
  ('c0000000-6000-4000-8000-000000000002', 'c0000000-6000-4000-8000-000000000001', 'Filho Teste', 'filho-teste');

insert into public.products (id, canonical_name, category_id, size_value, size_unit) values
  ('bbbbbbbb-6000-4000-8000-0000000000b1', 'Produto P1', null, 1, 'kg'),
  ('bbbbbbbb-6000-4000-8000-0000000000b2', 'Produto P2', null, 1, 'kg'),
  ('bbbbbbbb-6000-4000-8000-0000000000b3', 'Produto P3 na subcategoria', 'c0000000-6000-4000-8000-000000000002', 1, 'kg'),
  ('bbbbbbbb-6000-4000-8000-0000000000b4', 'Produto P4 barato', null, 1, 'kg'),
  ('bbbbbbbb-6000-4000-8000-0000000000b5', 'Produto P5 sem preço', null, 1, 'kg');

insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-6000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preco-u1@test.local'),
  ('cccccccc-6000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preco-u2@test.local');

insert into public.price_lists (id, market_id, currency_code, store_id, name)
select 'd0000000-6000-4000-8000-0000000000d1', id, currency_code, null, 'BR base' from public.markets where code = 'br';
insert into public.price_lists (id, market_id, currency_code, store_id, name)
select 'd0000000-6000-4000-8000-0000000000d2', id, currency_code, 'aaaaaaaa-6000-4000-8000-0000000000a2', 'BR loja 2' from public.markets where code = 'br';
insert into public.price_lists (id, market_id, currency_code, store_id, name)
values ('d0000000-6000-4000-8000-0000000000d3', 'a1111111-6000-4000-8000-000000000001', 'CAD', null, 'CA base');

-- ── Listas de preço: moeda e loja coerentes com o mercado ───────────────────
select throws_ok(
  $$insert into public.price_lists (market_id, currency_code, name)
    select id, 'USD', 'moeda errada' from public.markets where code = 'br'$$,
  '23503', null, 'lista de preço precisa ter a moeda do mercado');
select throws_ok(
  $$insert into public.price_lists (market_id, currency_code, store_id, name)
    select id, currency_code, 'aaaaaaaa-6000-4000-8000-0000000000a3', 'loja de outro mercado' from public.markets where code = 'br'$$,
  '23503', null, 'lista exclusiva de loja só vale para loja do mesmo mercado');

-- ── Preços versionados ──────────────────────────────────────────────────────
select public.set_product_price('d0000000-6000-4000-8000-0000000000d1', 'bbbbbbbb-6000-4000-8000-0000000000b1', 1000, now() - interval '10 days');
select public.set_product_price('d0000000-6000-4000-8000-0000000000d1', 'bbbbbbbb-6000-4000-8000-0000000000b1', 1200, now() - interval '5 days');
select public.set_product_price('d0000000-6000-4000-8000-0000000000d1', 'bbbbbbbb-6000-4000-8000-0000000000b1', 900,  now() + interval '5 days');

select is((select count(*)::int from public.product_prices where product_id = 'bbbbbbbb-6000-4000-8000-0000000000b1'),
  3, 'cada mudança de preço gera uma nova versão (histórico = a própria tabela)');
select is((select count(*)::int from public.product_prices where product_id = 'bbbbbbbb-6000-4000-8000-0000000000b1' and valid_to is null),
  1, 'só a última versão fica em aberto');
select is((select amount_minor::int from public.product_prices
           where product_id = 'bbbbbbbb-6000-4000-8000-0000000000b1' and valid_from = now() - interval '10 days'),
  1000, 'o valor antigo foi preservado');
select throws_ok(
  $$insert into public.product_prices (price_list_id, product_id, amount_minor, valid_from, valid_to)
    values ('d0000000-6000-4000-8000-0000000000d1', 'bbbbbbbb-6000-4000-8000-0000000000b1', 777, now() - interval '7 days', now() - interval '3 days')$$,
  '23P01', null, 'períodos de preço do mesmo produto/lista não podem se sobrepor');
select throws_ok(
  $$select public.set_product_price('d0000000-6000-4000-8000-0000000000d1', 'bbbbbbbb-6000-4000-8000-0000000000b1', 5, now() - interval '5 days')$$,
  '23P01', null, 'não cria duas versões com o mesmo início');
select throws_ok(
  $$update public.product_prices set amount_minor = 1 where product_id = 'bbbbbbbb-6000-4000-8000-0000000000b1'$$,
  '42501', null, 'preço gravado é imutável');
select throws_ok(
  $$delete from public.product_prices where product_id = 'bbbbbbbb-6000-4000-8000-0000000000b1'$$,
  '42501', null, 'histórico de preço não se apaga');
select throws_ok(
  $$insert into public.product_prices (price_list_id, product_id, amount_minor) values
    ('d0000000-6000-4000-8000-0000000000d1', 'bbbbbbbb-6000-4000-8000-0000000000b2', -1)$$,
  '23514', null, 'preço negativo é rejeitado');

select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  1200, 'preço vigente agora');
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid], now() + interval '6 days')),
  900, 'preço agendado vale a partir da data');
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid], now() - interval '7 days')),
  1000, 'consulta de preço em data passada');
select is((select count(*)::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b2'::uuid])),
  0, 'produto sem preço publicado não aparece');

-- preço por loja e por mercado
select public.set_product_price('d0000000-6000-4000-8000-0000000000d2', 'bbbbbbbb-6000-4000-8000-0000000000b1', 1100, now() - interval '1 day');
select public.set_product_price('d0000000-6000-4000-8000-0000000000d3', 'bbbbbbbb-6000-4000-8000-0000000000b1', 1599, now() - interval '1 day');
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a2', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  1100, 'a tabela exclusiva da loja vence a do mercado');
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  1200, 'outra loja do mercado continua na tabela base');
select is((select currency_code::text || ':' || final_price_minor::text from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a3', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  'CAD:1599', 'mesmo produto, outro mercado: moeda e preço próprios');
update public.price_lists set status = 'archived' where id = 'd0000000-6000-4000-8000-0000000000d2';
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a2', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  1200, 'lista arquivada é ignorada');

select public.set_product_price('d0000000-6000-4000-8000-0000000000d1', 'bbbbbbbb-6000-4000-8000-0000000000b2', 5000, now() - interval '30 days');
select public.set_product_price('d0000000-6000-4000-8000-0000000000d1', 'bbbbbbbb-6000-4000-8000-0000000000b3', 2000, now() - interval '30 days');
select public.set_product_price('d0000000-6000-4000-8000-0000000000d1', 'bbbbbbbb-6000-4000-8000-0000000000b4', 100,  now() - interval '30 days');

-- ── Arredondamento ──────────────────────────────────────────────────────────
select is(public.money_round(0.5), 1::bigint, 'arredonda meio para longe do zero (0,5 → 1)');
select is(public.money_round(2.5), 3::bigint, 'arredonda meio para longe do zero (2,5 → 3)');
select is(public.apply_promotion_unit('percent_off', 12.5, null, null, 799), 699::bigint,
  '12,5% de 799 = 99,875 → desconto 100 → 699');
select is(public.apply_promotion_unit('amount_off', null, 500, null, 100), 0::bigint, 'desconto nunca deixa o preço negativo');
select is(public.apply_promotion_unit('fixed_price', null, null, 5000, 1200), 1200::bigint, 'promoção nunca eleva o preço');

-- ── Promoções: integridade ──────────────────────────────────────────────────
select throws_ok(
  $$insert into public.promotions (name, kind, discount_percent, discount_amount_minor, starts_at)
    values ('forma errada', 'percent_off', 10, 50, now())$$,
  '23514', null, 'cada tipo de promoção exige exatamente os seus campos');
select throws_ok(
  $$insert into public.promotions (name, kind, discount_percent, starts_at, ends_at)
    values ('fim antes do início', 'percent_off', 10, now(), now() - interval '1 day')$$,
  '23514', null, 'término depois do início');
select throws_ok(
  $$insert into public.promotions (name, kind, discount_percent, starts_at, status)
    values ('nasce ativa', 'percent_off', 10, now(), 'active')$$,
  '23514', null, 'promoção nasce como rascunho');
select throws_ok(
  $$insert into public.promotions (name, kind, discount_percent, starts_at, usage_limit_total, usage_count)
    values ('uso acima do teto', 'percent_off', 10, now(), 1, 5)$$,
  '23514', null, 'uso inicial não pode ser lançado');

insert into public.promotions (id, name, kind, discount_percent, starts_at)
values ('e0000000-6000-4000-8000-0000000000f0', 'sem escopo', 'percent_off', 10, now());
select throws_ok(
  $$update public.promotions set status = 'active' where id = 'e0000000-6000-4000-8000-0000000000f0'$$,
  '23514', null, 'não ativa promoção sem escopo de mercado');
insert into public.promotion_scopes (promotion_id, market_id)
select 'e0000000-6000-4000-8000-0000000000f0', id from public.markets where code = 'br';
select throws_ok(
  $$update public.promotions set status = 'active' where id = 'e0000000-6000-4000-8000-0000000000f0'$$,
  '23514', null, 'não ativa promoção sem produtos nem alvos');

-- moeda da promoção × moeda do mercado
insert into public.promotions (id, name, kind, currency_code, discount_amount_minor, starts_at)
values ('e0000000-6000-4000-8000-0000000000f1', 'em reais', 'amount_off', 'BRL', 100, now());
select throws_ok(
  $$insert into public.promotion_scopes (promotion_id, market_id) values
    ('e0000000-6000-4000-8000-0000000000f1', 'a1111111-6000-4000-8000-000000000001')$$,
  '23514', null, 'promoção em BRL não vale em mercado com outra moeda');

-- ── Promoções: vigência ─────────────────────────────────────────────────────
-- PA: 20% em P1, todo o mercado BR, de ontem até amanhã
-- PB: 50% em P1, já ENCERRADA (terminou ontem) mas ainda marcada active (job parado)
-- PC: 25% em P1, FUTURA (começa em 2 dias)
insert into public.promotions (id, name, kind, discount_percent, starts_at, ends_at, priority) values
  ('e0000000-6000-4000-8000-0000000000a1', 'PA 20%', 'percent_off', 20, now() - interval '1 day',  now() + interval '1 day', 0),
  ('e0000000-6000-4000-8000-0000000000b1', 'PB 50% encerrada', 'percent_off', 50, now() - interval '10 days', now() - interval '1 day', 0),
  ('e0000000-6000-4000-8000-0000000000c1', 'PC 25% futura', 'percent_off', 25, now() + interval '2 days', now() + interval '9 days', 0);
insert into public.promotion_products (promotion_id, product_id)
select p, 'bbbbbbbb-6000-4000-8000-0000000000b1'
from unnest(array['e0000000-6000-4000-8000-0000000000a1','e0000000-6000-4000-8000-0000000000b1','e0000000-6000-4000-8000-0000000000c1']::uuid[]) p;
insert into public.promotion_scopes (promotion_id, market_id)
select p, m.id from public.markets m,
  unnest(array['e0000000-6000-4000-8000-0000000000a1','e0000000-6000-4000-8000-0000000000b1','e0000000-6000-4000-8000-0000000000c1']::uuid[]) p
where m.code = 'br';
update public.promotions set status = 'active'
where id in ('e0000000-6000-4000-8000-0000000000a1','e0000000-6000-4000-8000-0000000000b1','e0000000-6000-4000-8000-0000000000c1');

select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  960, 'promoção vigente aplica: 1200 − 20% = 960');
select is((select applied_promotion_ids from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  array['e0000000-6000-4000-8000-0000000000a1']::uuid[],
  'só a promoção vigente é aplicada: a encerrada (ainda "active") e a futura são ignoradas');
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid],
           (select starts_at from public.promotions where id = 'e0000000-6000-4000-8000-0000000000a1'))),
  960, 'no instante exato do início a promoção já vale');
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid],
           (select ends_at from public.promotions where id = 'e0000000-6000-4000-8000-0000000000a1'))),
  1200, 'no instante exato do término a promoção já não vale (intervalo [início, fim))');
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid], now() + interval '3 days')),
  900, 'promoção futura passa a valer na data de início (1200 − 25% = 900)');
select is((select valid_until from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  now() + interval '1 day', 'valid_until informa quando o resultado muda (fim da promoção)');

select is((select count(*)::int from public.promotions where id = 'e0000000-6000-4000-8000-0000000000b1' and status = 'active'), 1,
  'antes do job: a oferta vencida segue marcada como active');
select ok(public.expire_promotions() >= 1, 'job de expiração marca a oferta vencida');
select is((select status::text from public.promotions where id = 'e0000000-6000-4000-8000-0000000000b1'), 'expired', 'status passou a expired');
select ok((select expired_at is not null from public.promotions where id = 'e0000000-6000-4000-8000-0000000000b1'), 'expired_at registrado');
select is(public.expire_promotions(), 0, 'job é idempotente: rodar de novo não altera nada');
select is((select count(*)::int from public.promotions where id = 'e0000000-6000-4000-8000-0000000000b1'), 1,
  'oferta expirada NÃO é apagada (histórico preservado)');
select is((select status::text from public.promotions where id = 'e0000000-6000-4000-8000-0000000000a1'), 'active',
  'promoção ainda vigente não é tocada pelo job');
select throws_ok(
  $$update public.promotions set status = 'active' where id = 'e0000000-6000-4000-8000-0000000000b1'$$,
  '23514', null, 'expirada é estado final (não reativa)');
select throws_ok($$delete from public.promotions where id = 'e0000000-6000-4000-8000-0000000000b1'$$,
  '42501', null, 'promoção não é apagada fisicamente');
select throws_ok(
  $$update public.promotions set discount_percent = 99 where id = 'e0000000-6000-4000-8000-0000000000a1'$$,
  '42501', null, 'desconto de promoção publicada é imutável');
select throws_ok(
  $$insert into public.promotion_products (promotion_id, product_id) values
    ('e0000000-6000-4000-8000-0000000000a1', 'bbbbbbbb-6000-4000-8000-0000000000b2')$$,
  '42501', null, 'elegibilidade de promoção publicada é imutável');

update public.promotions set status = 'paused' where id = 'e0000000-6000-4000-8000-0000000000a1';
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  1200, 'promoção pausada não aplica');
update public.promotions set status = 'active' where id = 'e0000000-6000-4000-8000-0000000000a1';

-- ── Acumulação e conflito ───────────────────────────────────────────────────
-- PD: 30% (não acumulável)  → vence PA (20%).  PE: 10% acumulável → aplica depois.
insert into public.promotions (id, name, kind, discount_percent, starts_at, ends_at, stackable) values
  ('e0000000-6000-4000-8000-0000000000d1', 'PD 30%', 'percent_off', 30, now() - interval '1 day', now() + interval '3 days', false),
  ('e0000000-6000-4000-8000-0000000000e1', 'PE 10% acumulável', 'percent_off', 10, now() - interval '1 day', now() + interval '3 days', true);
insert into public.promotion_products (promotion_id, product_id)
select p, 'bbbbbbbb-6000-4000-8000-0000000000b1' from unnest(array['e0000000-6000-4000-8000-0000000000d1','e0000000-6000-4000-8000-0000000000e1']::uuid[]) p;
insert into public.promotion_scopes (promotion_id, market_id)
select p, m.id from public.markets m, unnest(array['e0000000-6000-4000-8000-0000000000d1','e0000000-6000-4000-8000-0000000000e1']::uuid[]) p where m.code = 'br';
update public.promotions set status = 'active' where id = 'e0000000-6000-4000-8000-0000000000d1';

select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  840, 'entre não acumuláveis vence a de menor preço (30% > 20%): 1200 → 840');
update public.promotions set status = 'active' where id = 'e0000000-6000-4000-8000-0000000000e1';
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  756, 'acumulável aplica depois da melhor: 840 − 10% = 756');
select is((select cardinality(applied_promotion_ids)::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])),
  2, 'no máximo uma não acumulável + as acumuláveis');
select ok(exists (select 1 from public.promotion_conflicts('e0000000-6000-4000-8000-0000000000a1')
                  where other_promotion_id = 'e0000000-6000-4000-8000-0000000000d1'),
  'promotion_conflicts aponta a sobreposição de PA com PD no mesmo produto/mercado');

-- ── Elegibilidade por categoria (com subcategorias) e por quantidade mínima ──
insert into public.promotions (id, name, kind, discount_percent, starts_at) values
  ('e0000000-6000-4000-8000-0000000000f2', 'categoria pai 10%', 'percent_off', 10, now() - interval '1 day'),
  ('e0000000-6000-4000-8000-0000000000f3', 'leve 3 → 50%', 'percent_off', 50, now() - interval '1 day');
insert into public.promotion_rules (promotion_id, kind, category_id)
values ('e0000000-6000-4000-8000-0000000000f2', 'target_category', 'c0000000-6000-4000-8000-000000000001');
insert into public.promotion_products (promotion_id, product_id)
values ('e0000000-6000-4000-8000-0000000000f3', 'bbbbbbbb-6000-4000-8000-0000000000b2');
insert into public.promotion_rules (promotion_id, kind, quantity)
values ('e0000000-6000-4000-8000-0000000000f3', 'min_quantity', 3);
insert into public.promotion_scopes (promotion_id, market_id)
select p, m.id from public.markets m, unnest(array['e0000000-6000-4000-8000-0000000000f2','e0000000-6000-4000-8000-0000000000f3']::uuid[]) p where m.code = 'br';
update public.promotions set status = 'active' where id in ('e0000000-6000-4000-8000-0000000000f2','e0000000-6000-4000-8000-0000000000f3');

select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b3'::uuid])),
  1800, 'promoção na categoria pai vale para produto da subcategoria');
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b2'::uuid], now(), 1)),
  5000, 'quantidade abaixo do mínimo: sem desconto');
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b2'::uuid], now(), 3)),
  2500, 'quantidade mínima atingida: 50%');

insert into public.promotions (id, name, kind, currency_code, discount_amount_minor, starts_at)
values ('e0000000-6000-4000-8000-0000000000f4', 'desconto maior que o preço', 'amount_off', 'BRL', 500, now() - interval '1 day');
insert into public.promotion_products values ('e0000000-6000-4000-8000-0000000000f4', 'bbbbbbbb-6000-4000-8000-0000000000b4', 1);
insert into public.promotion_scopes (promotion_id, market_id) select 'e0000000-6000-4000-8000-0000000000f4', id from public.markets where code = 'br';
update public.promotions set status = 'active' where id = 'e0000000-6000-4000-8000-0000000000f4';
select is((select final_price_minor::int from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b4'::uuid])),
  0, 'resultado nunca fica negativo');

-- ── Resgate: limites atômicos, idempotência, escopo ─────────────────────────
insert into public.promotions (id, name, kind, discount_percent, starts_at, ends_at, usage_limit_total, usage_limit_per_customer) values
  ('e0000000-6000-4000-8000-0000000000a9', 'teto 2 usos', 'percent_off', 10, now() - interval '1 day', now() + interval '1 day', 2, null),
  ('e0000000-6000-4000-8000-0000000000aa', 'só loja 2',   'percent_off', 10, now() - interval '1 day', now() + interval '1 day', null, null),
  ('e0000000-6000-4000-8000-0000000000ab', '1 por cliente','percent_off', 10, now() - interval '1 day', now() + interval '1 day', null, 1);
insert into public.promotion_products (promotion_id, product_id)
select p, 'bbbbbbbb-6000-4000-8000-0000000000b5' from unnest(array['e0000000-6000-4000-8000-0000000000a9','e0000000-6000-4000-8000-0000000000aa','e0000000-6000-4000-8000-0000000000ab']::uuid[]) p;
insert into public.promotion_scopes (promotion_id, market_id, store_id)
select 'e0000000-6000-4000-8000-0000000000a9', id, null from public.markets where code = 'br';
insert into public.promotion_scopes (promotion_id, market_id, store_id)
select 'e0000000-6000-4000-8000-0000000000aa', id, 'aaaaaaaa-6000-4000-8000-0000000000a2' from public.markets where code = 'br';
insert into public.promotion_scopes (promotion_id, market_id, store_id)
select 'e0000000-6000-4000-8000-0000000000ab', id, null from public.markets where code = 'br';
update public.promotions set status = 'active' where id in
  ('e0000000-6000-4000-8000-0000000000a9','e0000000-6000-4000-8000-0000000000aa','e0000000-6000-4000-8000-0000000000ab');

create temp table redeem_ids (n int, id uuid) on commit drop;
insert into redeem_ids select 1, public.redeem_promotion('e0000000-6000-4000-8000-0000000000a9', 'ord-1', 'aaaaaaaa-6000-4000-8000-0000000000a1', null, 50);
insert into redeem_ids select 2, public.redeem_promotion('e0000000-6000-4000-8000-0000000000a9', 'ord-1', 'aaaaaaaa-6000-4000-8000-0000000000a1', null, 50);
select is((select count(distinct id)::int from redeem_ids), 1, 'resgatar o mesmo pedido duas vezes é idempotente');
select is((select usage_count from public.promotions where id = 'e0000000-6000-4000-8000-0000000000a9'), 1, 'e não consome o limite duas vezes');
select lives_ok($$select public.redeem_promotion('e0000000-6000-4000-8000-0000000000a9', 'ord-2', 'aaaaaaaa-6000-4000-8000-0000000000a1', null, 50)$$, 'segundo pedido ainda cabe no teto');
select throws_ok($$select public.redeem_promotion('e0000000-6000-4000-8000-0000000000a9', 'ord-3', 'aaaaaaaa-6000-4000-8000-0000000000a1', null, 50)$$,
  'PR001', null, 'terceiro pedido estoura o teto total');
select throws_ok($$select public.redeem_promotion('e0000000-6000-4000-8000-0000000000aa', 'ord-4', 'aaaaaaaa-6000-4000-8000-0000000000a1', null, 50)$$,
  'PR003', null, 'promoção da loja 2 não vale na loja 1');
select lives_ok($$select public.redeem_promotion('e0000000-6000-4000-8000-0000000000ab', 'ord-5', 'aaaaaaaa-6000-4000-8000-0000000000a1', 'cccccccc-6000-4000-8000-0000000000c1', 50)$$, 'primeiro uso do cliente');
select throws_ok($$select public.redeem_promotion('e0000000-6000-4000-8000-0000000000ab', 'ord-6', 'aaaaaaaa-6000-4000-8000-0000000000a1', 'cccccccc-6000-4000-8000-0000000000c1', 50)$$,
  'PR002', null, 'limite por cliente');
select lives_ok($$select public.redeem_promotion('e0000000-6000-4000-8000-0000000000ab', 'ord-7', 'aaaaaaaa-6000-4000-8000-0000000000a1', 'cccccccc-6000-4000-8000-0000000000c2', 50)$$, 'outro cliente ainda pode');
select throws_ok($$select public.redeem_promotion('e0000000-6000-4000-8000-0000000000ab', 'ord-8', 'aaaaaaaa-6000-4000-8000-0000000000a1', null, 50)$$,
  'PR002', null, 'limite por cliente exige cliente identificado');
select throws_ok($$select public.redeem_promotion('e0000000-6000-4000-8000-0000000000b1', 'ord-9', 'aaaaaaaa-6000-4000-8000-0000000000a1', null, 50)$$,
  'PR001', null, 'promoção encerrada não é resgatada, mesmo com escopo válido');
select throws_ok($$update public.promotion_usage set discount_minor = 0$$, '42501', null, 'resgates são somente inclusão');

-- ── Fuso local → UTC ────────────────────────────────────────────────────────
select is(public.market_local_to_utc((select id from public.markets where code = 'br'), timestamp '2026-01-01 12:00'),
  timestamptz '2026-01-01 15:00+00', 'meio-dia em São Paulo = 15:00 UTC');

-- ── Segurança ───────────────────────────────────────────────────────────────
set local role anon;
select throws_ok($$select count(*) from public.promotions$$, '42501', null, 'público não lê a tabela de promoções');
select throws_ok($$select count(*) from public.product_prices$$, '42501', null, 'público não lê a tabela de preços');
select lives_ok($$select * from public.resolve_prices('aaaaaaaa-6000-4000-8000-0000000000a1', array['bbbbbbbb-6000-4000-8000-0000000000b1'::uuid])$$,
  'público consulta preços resolvidos');
select ok((select count(*) from public.list_live_promotions('aaaaaaaa-6000-4000-8000-0000000000a1')) >= 1, 'público lista ofertas vigentes');
select ok(not exists (select 1 from public.list_live_promotions('aaaaaaaa-6000-4000-8000-0000000000a1') where id = 'e0000000-6000-4000-8000-0000000000b1'),
  'ofertas vencidas não aparecem na listagem pública');
select throws_ok($$select public.redeem_promotion('e0000000-6000-4000-8000-0000000000a9', 'x', 'aaaaaaaa-6000-4000-8000-0000000000a1', null, 1)$$,
  '42501', null, 'público não resgata promoção');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-6000-4000-8000-0000000000c2","role":"authenticated"}', true);
select is((select count(*)::int from public.promotions), 0, 'usuário comum não enxerga promoções (RLS)');
select throws_ok($$select public.set_product_price('d0000000-6000-4000-8000-0000000000d1', 'bbbbbbbb-6000-4000-8000-0000000000b2', 1, now())$$,
  '42501', null, 'usuário comum não altera preços');
reset role;

select * from finish();
rollback;
