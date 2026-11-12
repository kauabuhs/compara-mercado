-- Busca de produtos: tolerância a erro de digitação, acento e ruído.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.products (id, canonical_name, brand, size_value, size_unit, status) values
  ('eeeeeeee-0000-4000-8000-0000000000e1', 'Leite integral', 'Campo Bom', 1, 'l', 'active'),
  ('eeeeeeee-0000-4000-8000-0000000000e2', 'Arroz branco tipo 1', null, 5, 'kg', 'active'),
  ('eeeeeeee-0000-4000-8000-0000000000e3', 'Feijão preto', null, 1, 'kg', 'active'),
  ('eeeeeeee-0000-4000-8000-0000000000e4', 'Leite arquivado', null, 1, 'l', 'archived');

select is((select canonical_name from public.search_products('leite', 5) limit 1), 'Leite integral',
  'busca exata acha o produto');
select is((select canonical_name from public.search_products('leiet', 5) limit 1), 'Leite integral',
  'letras trocadas ainda acham o produto');
select is((select canonical_name from public.search_products('feijao', 5) limit 1), 'Feijão preto',
  'busca ignora acento');
select is((select canonical_name from public.search_products('arrzo', 5) limit 1), 'Arroz branco tipo 1',
  'letra faltando ainda acha o produto');
select is((select count(*)::int from public.search_products('qwertyui', 5)), 0,
  'termo sem relação não retorna nada');
select is((select count(*)::int from public.search_products('leite arquivado', 5)
  where canonical_name = 'Leite arquivado'), 0, 'produto arquivado não aparece');

select * from finish();
rollback;
