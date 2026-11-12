-- Estoque (saldo, reservas, razão, transferências), fornecedores, mídias e registro de jobs.
-- A concorrência real (várias conexões em paralelo) é testada no Vitest; aqui ficam as regras
-- determinísticas. Fixtures próprias; transação revertida.
begin;
create extension if not exists pgtap with schema extensions;
select plan(70);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into public.cities (id, ibge_code, name, uf, active)
values ('aaaaaaaa-7000-4000-8000-000000000001', '9999997', 'Cidade Estoque', 'RS', true);
insert into public.stores (id, city_id, name, location, status) values
  ('aaaaaaaa-7000-4000-8000-0000000000a1', 'aaaaaaaa-7000-4000-8000-000000000001', 'Loja Estoque 1', extensions.st_makepoint(-51.18, -29.17)::extensions.geography, 'active'),
  ('aaaaaaaa-7000-4000-8000-0000000000a2', 'aaaaaaaa-7000-4000-8000-000000000001', 'Loja Estoque 2', extensions.st_makepoint(-51.19, -29.18)::extensions.geography, 'active');

insert into public.products (id, canonical_name, size_value, size_unit, sale_mode) values
  ('bbbbbbbb-7000-4000-8000-0000000000b1', 'Item Unitário', 1, 'un', 'per_unit'),
  ('bbbbbbbb-7000-4000-8000-0000000000b2', 'Item a Peso',   1, 'kg', 'by_weight');

insert into public.warehouses (id, market_id, code, name, kind, store_id)
select 'ee000000-7000-4000-8000-0000000000e1', id, 'dc-teste', 'CD Teste', 'distribution_center', null from public.markets where code = 'br';
insert into public.warehouses (id, market_id, code, name, kind, store_id)
select 'ee000000-7000-4000-8000-0000000000e2', id, 'loja-teste-1', 'Loja Teste 1', 'store_stock', 'aaaaaaaa-7000-4000-8000-0000000000a1' from public.markets where code = 'br';

insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-7000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'est-admin@test.local'),
  ('cccccccc-7000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'est-user@test.local');
update public.profiles set role = 'admin' where id = 'cccccccc-7000-4000-8000-0000000000c1';

-- ── Depósitos ───────────────────────────────────────────────────────────────
select throws_ok(
  $$insert into public.warehouses (market_id, code, name, kind)
    select id, 'loja-sem-loja', 'inválido', 'store_stock' from public.markets where code = 'br'$$,
  '23514', null, 'depósito de loja exige a loja');
select throws_ok(
  $$insert into public.warehouses (market_id, code, name, kind, store_id)
    select id, 'cd-com-loja', 'inválido', 'distribution_center', 'aaaaaaaa-7000-4000-8000-0000000000a2' from public.markets where code = 'br'$$,
  '23514', null, 'centro de distribuição não tem loja');
select throws_ok(
  $$insert into public.warehouses (market_id, code, name, kind, store_id)
    select id, 'loja-teste-dup', 'duplicado', 'store_stock', 'aaaaaaaa-7000-4000-8000-0000000000a1' from public.markets where code = 'br'$$,
  '23505', null, 'uma loja tem no máximo um depósito de loja');

-- ── Entrada, saldo e razão ──────────────────────────────────────────────────
select ok(public.stock_apply_movement('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 'receipt', 100, 'po-1', null, null, 250, 'BRL', 'k-receipt-1') is not null,
  'entrada de mercadoria cria o saldo');
select is((select on_hand::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'),
  100, 'saldo físico = 100');
select is(public.stock_apply_movement('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 'receipt', 100, 'po-1', null, null, 250, 'BRL', 'k-receipt-1'),
  (select id from public.inventory_movements where idempotency_key = 'k-receipt-1'),
  'mesma chave de idempotência devolve a movimentação original');
select is((select on_hand::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'),
  100, '…e não soma de novo');
select throws_ok($$select public.stock_apply_movement('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 'loss', -101)$$,
  'ST001', null, 'saída maior que o saldo é recusada');
select lives_ok($$select public.stock_apply_movement('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 'damage', -3, 'avaria-1', 'caixa molhada')$$,
  'perda/avaria registrada');
select throws_ok($$select public.stock_apply_movement('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 'receipt', 0.5)$$,
  '22023', null, 'produto por unidade não aceita quantidade fracionada');
select lives_ok($$select public.stock_apply_movement('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b2', 'receipt', 12.250)$$,
  'produto vendido por peso aceita fração');
select throws_ok($$select public.stock_apply_movement('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 'receipt', 0)$$,
  '22023', null, 'movimentação zero é recusada');
select throws_ok(
  $$insert into public.inventory_movements (warehouse_id, product_id, kind, quantity_delta, on_hand_after)
    values ('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 'receipt', -1, 10)$$,
  '23514', null, 'o sinal da quantidade tem que combinar com o tipo da movimentação');
select throws_ok($$update public.inventory_movements set note = 'adulterado'$$, '42501', null, 'o razão de movimentações é imutável');
select throws_ok($$delete from public.inventory_movements$$, '42501', null, 'e não se apaga');
select is(
  (select coalesce(sum(quantity_delta), 0)::int from public.inventory_movements
   where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'),
  (select on_hand::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'),
  'a soma do razão confere com o saldo (97)');
select throws_ok(
  $$update public.inventory set on_hand = -1 where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1'$$,
  '23514', null, 'o banco impede saldo negativo mesmo fora das funções');
select throws_ok(
  $$update public.inventory set reserved = on_hand + 1 where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'$$,
  '23514', null, 'o banco impede reservar mais do que o físico');

-- ── Reservas ────────────────────────────────────────────────────────────────
create temp table res (n int, id uuid) on commit drop;
insert into res select 1, public.reserve_stock('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 30, 'cart-1');
insert into res select 2, public.reserve_stock('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 30, 'cart-1');
select is((select count(distinct id)::int from res), 1, 'reservar duas vezes a mesma referência é idempotente');
select is((select reserved::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'),
  30, 'reservado = 30');
select is((select available::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'),
  67, 'disponível = físico − reservado (97 − 30)');
select throws_ok($$select public.reserve_stock('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 68, 'cart-2')$$,
  'ST001', null, 'não reserva além do disponível');
select throws_ok($$select public.stock_apply_movement('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 'loss', -68)$$,
  'ST001', null, 'saída não pode invadir o que está reservado');

create temp table commits (n int, id bigint) on commit drop;
insert into commits select 1, public.commit_reservation((select id from res limit 1), 'order-1');
insert into commits select 2, public.commit_reservation((select id from res limit 1), 'order-1');
select is((select count(distinct id)::int from commits), 1, 'confirmar a mesma reserva duas vezes é idempotente');
select is((select on_hand::int || '/' || reserved::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'),
  '67/0', 'confirmação baixa o físico e libera a reserva (97 → 67, reservado 0)');
select is((select kind::text || ':' || quantity_delta::int from public.inventory_movements where id = (select id from commits limit 1)),
  'sale:-30', 'a venda ficou no razão');
select throws_ok($$select public.release_reservation((select id from res limit 1))$$, 'ST002', null,
  'reserva já confirmada não pode ser liberada');

insert into res select 3, public.reserve_stock('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 10, 'cart-3');
select is(public.release_reservation((select id from res where n = 3)), true, 'liberar devolve o disponível');
select is(public.release_reservation((select id from res where n = 3)), false, 'liberar de novo não faz nada');
select is((select reserved::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'),
  0, 'reservado voltou a zero');

-- reserva vencida: não confirma (vigência na hora) e o job devolve o disponível
insert into res select 4, public.reserve_stock('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 5, 'cart-4', interval '-1 minute');
select throws_ok($$select public.commit_reservation((select id from res where n = 4))$$, 'ST002', null,
  'reserva vencida não pode ser confirmada, mesmo antes do job rodar');
select ok(public.expire_stock_reservations() >= 1, 'job expira reservas vencidas');
select is((select reserved::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'),
  0, '…e devolve a quantidade ao disponível');
select is(public.expire_stock_reservations(), 0, 'job de reservas é idempotente');

-- ── Transferência ───────────────────────────────────────────────────────────
select lives_ok($$select public.transfer_stock('ee000000-7000-4000-8000-0000000000e1', 'ee000000-7000-4000-8000-0000000000e2', 'bbbbbbbb-7000-4000-8000-0000000000b1', 20, 'tr-1')$$,
  'transferência entre depósitos');
select is(
  (select (select on_hand::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1')
       || '+' || (select on_hand::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e2' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1')),
  '47+20', 'origem 67 → 47, destino 0 → 20');
select is((select count(distinct transfer_id)::int from public.inventory_movements where reference = 'tr-1'), 1, 'as duas pernas compartilham o transfer_id');
select throws_ok($$select public.transfer_stock('ee000000-7000-4000-8000-0000000000e1', 'ee000000-7000-4000-8000-0000000000e2', 'bbbbbbbb-7000-4000-8000-0000000000b1', 1000, 'tr-2')$$,
  'ST001', null, 'transferência acima do saldo é recusada');
select is(
  (select (select on_hand::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e1' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1')
       || '+' || (select on_hand::int from public.inventory where warehouse_id = 'ee000000-7000-4000-8000-0000000000e2' and product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1')),
  '47+20', 'transferência recusada não move nada (atomicidade)');
select throws_ok($$select public.transfer_stock('ee000000-7000-4000-8000-0000000000e1', 'ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 1)$$,
  '22023', null, 'origem e destino devem ser diferentes');

-- ── Fornecedores ────────────────────────────────────────────────────────────
insert into public.suppliers (id, name, country_code, tax_id) values
  ('ff000000-7000-4000-8000-0000000000f1', 'Fornecedor A', 'BR', '11111111000191'),
  ('ff000000-7000-4000-8000-0000000000f2', 'Fornecedor B', 'BR', null),
  ('ff000000-7000-4000-8000-0000000000f3', 'Fornecedor C', 'BR', null);
select throws_ok($$insert into public.suppliers (name, country_code, tax_id) values ('Duplicado', 'BR', '11111111000191')$$,
  '23505', null, 'identificador fiscal é único por país');
select throws_ok($$insert into public.suppliers (name, tax_id) values ('Sem país', '123')$$,
  '23514', null, 'identificador fiscal exige o país');
insert into public.supplier_products (supplier_id, product_id, cost_minor, currency_code, is_preferred)
values ('ff000000-7000-4000-8000-0000000000f1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 200, 'BRL', true);
select throws_ok(
  $$insert into public.supplier_products (supplier_id, product_id, cost_minor, currency_code, is_preferred)
    values ('ff000000-7000-4000-8000-0000000000f2', 'bbbbbbbb-7000-4000-8000-0000000000b1', 190, 'BRL', true)$$,
  '23505', null, 'no máximo um fornecedor preferencial por produto');
select throws_ok($$delete from public.suppliers where id = 'ff000000-7000-4000-8000-0000000000f1'$$,
  '42501', null, 'fornecedor não é apagado');

-- ── Mídias ──────────────────────────────────────────────────────────────────
select throws_ok(
  $$insert into public.media_assets (object_key, mime_type, byte_size, sha256, status)
    values ('t/x.jpg', 'image/jpeg', 10, repeat('a', 64), 'ready')$$,
  '23514', null, 'asset não nasce pronto');
insert into public.media_assets (id, object_key, mime_type, byte_size, width, height, sha256, alt_text) values
  ('a0000000-7000-4000-8000-0000000000a1', 't/a1.jpg', 'image/jpeg', 100, 800, 800, repeat('1', 64), 'imagem 1'),
  ('a0000000-7000-4000-8000-0000000000a2', 't/a2.jpg', 'image/jpeg', 100, 800, 800, repeat('2', 64), 'imagem 2'),
  ('a0000000-7000-4000-8000-0000000000a3', 't/a3.jpg', 'image/jpeg', 100, 800, 800, repeat('3', 64), 'pendente');
select throws_ok(
  $$insert into public.media_assets (object_key, mime_type, byte_size, sha256) values ('t/dup.jpg', 'image/jpeg', 1, repeat('1', 64))$$,
  '23505', null, 'a mesma imagem (sha256) não é registrada duas vezes');
select throws_ok(
  $$insert into public.media_assets (object_key, mime_type, byte_size, sha256) values ('t/gif.gif', 'image/gif', 1, repeat('9', 64))$$,
  '23514', null, 'só tipos de imagem permitidos');
select throws_ok($$update public.media_assets set status = 'ready' where id = 'a0000000-7000-4000-8000-0000000000a1'$$,
  '23514', null, 'asset só fica ready com a miniatura gerada');
insert into public.media_renditions (asset_id, variant, format, width, height, byte_size, object_key)
select id, 'thumb', 'webp', 160, 160, 5000, 't/' || id || '/thumb.webp' from public.media_assets where id in ('a0000000-7000-4000-8000-0000000000a1', 'a0000000-7000-4000-8000-0000000000a2');
select lives_ok($$update public.media_assets set status = 'ready' where id in ('a0000000-7000-4000-8000-0000000000a1', 'a0000000-7000-4000-8000-0000000000a2')$$,
  'com a miniatura, o asset fica ready');
insert into public.product_media (product_id, asset_id, position, is_primary)
values ('bbbbbbbb-7000-4000-8000-0000000000b1', 'a0000000-7000-4000-8000-0000000000a1', 0, true);
select throws_ok(
  $$insert into public.product_media (product_id, asset_id, position, is_primary)
    values ('bbbbbbbb-7000-4000-8000-0000000000b1', 'a0000000-7000-4000-8000-0000000000a2', 1, true)$$,
  '23505', null, 'só uma imagem principal por produto');
select lives_ok(
  $$insert into public.product_media (product_id, asset_id, position, is_primary)
    values ('bbbbbbbb-7000-4000-8000-0000000000b1', 'a0000000-7000-4000-8000-0000000000a2', 1, false)$$,
  'galeria: segunda imagem não principal');
select throws_ok(
  $$insert into public.product_media (product_id, asset_id) values ('bbbbbbbb-7000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000dead')$$,
  '23503', null, 'vínculo não aponta para asset inexistente');
select throws_ok($$update public.media_assets set status = 'pending' where id = 'a0000000-7000-4000-8000-0000000000a1'$$,
  '23514', null, 'asset em uso não volta a processar');
select throws_ok($$delete from public.media_assets where id = 'a0000000-7000-4000-8000-0000000000a1'$$,
  '42501', null, 'asset não é apagado fisicamente');
select is((select thumb_key from public.product_thumbnails where product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'),
  't/a0000000-7000-4000-8000-0000000000a1/thumb.webp', 'a listagem lê só a miniatura da imagem principal');

-- ── Jobs ────────────────────────────────────────────────────────────────────
create temp table runs (n int, id uuid) on commit drop;
insert into runs select 1, public.job_run_start('promotions.expire', 'run-key-1');
insert into runs select 2, public.job_run_start('promotions.expire', 'run-key-1');
select is((select count(distinct id)::int from runs), 1, 'mesma chave de execução não duplica o registro');
select lives_ok($$select public.job_run_finish((select id from runs limit 1), 'succeeded', 3)$$, 'finaliza a execução');
select is((select status::text || ':' || affected from public.job_runs where run_key = 'run-key-1'), 'succeeded:3', 'execução registrada');
select throws_ok(
  $$insert into public.job_runs (job_name, status) values ('x', 'succeeded')$$, '23514', null,
  'execução concluída exige finished_at');

-- ── Segurança ───────────────────────────────────────────────────────────────
set local role anon;
select throws_ok($$select count(*) from public.inventory$$, '42501', null, 'público não lê estoque');
select throws_ok($$select count(*) from public.suppliers$$, '42501', null, 'público não lê fornecedores');
select is((select count(*)::int from public.media_assets where id = 'a0000000-7000-4000-8000-0000000000a3'), 0, 'público não vê asset pendente');
select is((select count(*)::int from public.media_assets where id = 'a0000000-7000-4000-8000-0000000000a1'), 1, 'público vê asset pronto');
select is((select count(*)::int from public.product_thumbnails where product_id = 'bbbbbbbb-7000-4000-8000-0000000000b1'), 1, 'público lê miniaturas');
select throws_ok($$select public.reserve_stock('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 1, 'x')$$,
  '42501', null, 'público não reserva estoque');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-7000-4000-8000-0000000000c2","role":"authenticated"}', true);
select is((select count(*)::int from public.inventory), 0, 'usuário comum não enxerga estoque (RLS)');
select throws_ok($$select public.stock_apply_movement('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 'receipt', 1)$$,
  '42501', null, 'usuário comum não movimenta estoque');
select is((select count(*)::int from public.job_runs), 0, 'usuário comum não lê execuções de jobs');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-7000-4000-8000-0000000000c1","role":"authenticated"}', true);
select lives_ok($$select public.stock_apply_movement('ee000000-7000-4000-8000-0000000000e1', 'bbbbbbbb-7000-4000-8000-0000000000b1', 'adjustment', 1, 'inventario-1')$$,
  'admin ajusta estoque');
select ok((select count(*) from public.inventory) >= 1, 'admin enxerga estoque');
reset role;

select * from finish();
rollback;
