-- Seed LOCAL com dados FICTÍCIOS (nomes, preços e coordenadas aproximadas são de demonstração).
-- Roda apenas em `supabase db reset`. Nunca é aplicado em staging ou produção.

-- ── Cidade piloto ───────────────────────────────────────────────────────────
insert into public.cities (id, ibge_code, name, uf, active) values
  ('10000000-0000-4000-8000-000000000001', '4305108', 'Caxias do Sul', 'RS', true),
  ('10000000-0000-4000-8000-000000000002', '4314803', 'Passo Fundo',    'RS', false);

-- ── 6 mercados fictícios (lon, lat) ─────────────────────────────────────────
insert into public.stores (id, city_id, name, address, neighborhood, location, status, opening_hours) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Mercado Centro (demo)',     'Rua Exemplo, 100', 'Centro',        extensions.st_makepoint(-51.1794, -29.1678)::extensions.geography, 'active', '{"seg-sab":"08:00-20:00","dom":"09:00-13:00"}'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Super Econômico (demo)',    'Av. Exemplo, 200', 'Exposição',     extensions.st_makepoint(-51.1620, -29.1590)::extensions.geography, 'active', '{"seg-sab":"07:30-21:00","dom":"08:00-14:00"}'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Atacado Serra (demo)',      'Rod. Exemplo, km 3', 'Cinquentenário', extensions.st_makepoint(-51.2010, -29.1850)::extensions.geography, 'active', '{"seg-sab":"07:00-19:00"}'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Mercadão Popular (demo)',   'Rua Exemplo, 300', 'Panazzolo',     extensions.st_makepoint(-51.1900, -29.1500)::extensions.geography, 'active', '{"seg-sab":"08:00-20:00","dom":"08:00-12:00"}'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'Empório São Pelegrino (demo)', 'Rua Exemplo, 400', 'São Pelegrino', extensions.st_makepoint(-51.1700, -29.1760)::extensions.geography, 'active', '{"seg-sab":"09:00-19:00"}'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'Mini Mercado Rizzo (demo)', 'Rua Exemplo, 500', 'Desvio Rizzo',  extensions.st_makepoint(-51.2200, -29.1400)::extensions.geography, 'active', '{"seg-dom":"08:00-20:00"}');

-- ── Categorias ──────────────────────────────────────────────────────────────
insert into public.categories (id, name, slug) values
  ('30000000-0000-4000-8000-000000000001', 'Mercearia',  'mercearia'),
  ('30000000-0000-4000-8000-000000000002', 'Laticínios', 'laticinios'),
  ('30000000-0000-4000-8000-000000000003', 'Hortifruti', 'hortifruti'),
  ('30000000-0000-4000-8000-000000000004', 'Carnes',     'carnes'),
  ('30000000-0000-4000-8000-000000000005', 'Padaria',    'padaria'),
  ('30000000-0000-4000-8000-000000000006', 'Bebidas',    'bebidas'),
  ('30000000-0000-4000-8000-000000000007', 'Limpeza',    'limpeza'),
  ('30000000-0000-4000-8000-000000000008', 'Higiene',    'higiene');

-- ── Produtos canônicos (cesta básica + itens comuns) ────────────────────────
-- Marcas fictícias; hortifruti e carnes não têm marca.
with raw (name, size_value, size_unit, cat, base_cents) as (values
  ('Arroz branco tipo 1',            5,    'kg', 'mercearia', 2790),
  ('Arroz parboilizado',             5,    'kg', 'mercearia', 2890),
  ('Feijão preto',                   1,    'kg', 'mercearia',  799),
  ('Feijão carioca',                 1,    'kg', 'mercearia',  849),
  ('Açúcar refinado',                1,    'kg', 'mercearia',  449),
  ('Sal refinado',                   1,    'kg', 'mercearia',  229),
  ('Óleo de soja',                 900,    'ml', 'mercearia',  749),
  ('Farinha de trigo',               1,    'kg', 'mercearia',  479),
  ('Macarrão espaguete',           500,    'g',  'mercearia',  399),
  ('Molho de tomate',              340,    'g',  'mercearia',  349),
  ('Café torrado e moído',         500,    'g',  'mercearia', 1890),
  ('Farinha de mandioca',          500,    'g',  'mercearia',  599),
  ('Fubá',                           1,    'kg', 'mercearia',  489),
  ('Bolacha maria',                400,    'g',  'mercearia',  429),
  ('Leite integral',                 1,    'l',  'laticinios', 549),
  ('Manteiga',                     200,    'g',  'laticinios', 1090),
  ('Queijo mussarela fatiado',     500,    'g',  'laticinios', 2490),
  ('Iogurte natural',              170,    'g',  'laticinios',  249),
  ('Requeijão cremoso',            200,    'g',  'laticinios',  699),
  ('Margarina',                    500,    'g',  'laticinios',  899),
  ('Ovos brancos (dúzia)',          12,    'un', 'laticinios', 1190),
  ('Banana prata',                   1,    'kg', 'hortifruti',  599),
  ('Batata inglesa',                 1,    'kg', 'hortifruti',  549),
  ('Cebola',                         1,    'kg', 'hortifruti',  499),
  ('Tomate',                         1,    'kg', 'hortifruti',  699),
  ('Maçã gala',                      1,    'kg', 'hortifruti',  899),
  ('Cenoura',                        1,    'kg', 'hortifruti',  449),
  ('Laranja',                        1,    'kg', 'hortifruti',  399),
  ('Alface crespa',                  1,    'un', 'hortifruti',  349),
  ('Frango inteiro congelado',       1,    'kg', 'carnes',     1099),
  ('Carne bovina moída',             1,    'kg', 'carnes',     3290),
  ('Linguiça toscana',               1,    'kg', 'carnes',     2190),
  ('Peito de frango',                1,    'kg', 'carnes',     1790),
  ('Pão de forma tradicional',     500,    'g',  'padaria',     899),
  ('Pão francês',                    1,    'kg', 'padaria',    1490),
  ('Refrigerante de cola',           2,    'l',  'bebidas',     899),
  ('Suco de uva integral',           1,    'l',  'bebidas',    1190),
  ('Cerveja lata',                 350,    'ml', 'bebidas',     399),
  ('Água mineral sem gás',         1.5,    'l',  'bebidas',     249),
  ('Vinho tinto de mesa',          750,    'ml', 'bebidas',    2290),
  ('Detergente líquido',           500,    'ml', 'limpeza',     249),
  ('Sabão em pó',                    1,    'kg', 'limpeza',    1290),
  ('Água sanitária',                 1,    'l',  'limpeza',     379),
  ('Papel higiênico (12 rolos)',    12,    'un', 'limpeza',    1890),
  ('Amaciante de roupas',            2,    'l',  'limpeza',    1190),
  ('Sabonete',                      85,    'g',  'higiene',     199),
  ('Creme dental',                  90,    'g',  'higiene',     349),
  ('Shampoo',                      350,    'ml', 'higiene',    1190)
)
insert into public.products (canonical_name, brand, category_id, size_value, size_unit, gtin)
select r.name,
       case when r.cat in ('hortifruti', 'carnes', 'padaria') then null
            else (array['Serra Verde', 'Campo Bom', 'Sabor da Colônia'])[1 + abs(hashtext(r.name)) % 3] end,
       c.id, r.size_value, r.size_unit::public.size_unit,
       case when r.name = 'Leite integral' then '7891000100103' end  -- GTIN válido de demonstração (scanner)
from raw r join public.categories c on c.slug = r.cat;

-- ── Preços: 6 mercados × ~50 itens, variação determinística por mercado ─────
-- ~10% dos pares sem preço (cobertura realista); ~12% em promoção; idade de 0 a 9 dias.
with base (name, base_cents) as (values
  ('Arroz branco tipo 1', 2790), ('Arroz parboilizado', 2890), ('Feijão preto', 799),
  ('Feijão carioca', 849), ('Açúcar refinado', 449), ('Sal refinado', 229), ('Óleo de soja', 749),
  ('Farinha de trigo', 479), ('Macarrão espaguete', 399), ('Molho de tomate', 349),
  ('Café torrado e moído', 1890), ('Farinha de mandioca', 599), ('Fubá', 489), ('Bolacha maria', 429),
  ('Leite integral', 549), ('Manteiga', 1090), ('Queijo mussarela fatiado', 2490),
  ('Iogurte natural', 249), ('Requeijão cremoso', 699), ('Margarina', 899), ('Ovos brancos (dúzia)', 1190),
  ('Banana prata', 599), ('Batata inglesa', 549), ('Cebola', 499), ('Tomate', 699), ('Maçã gala', 899),
  ('Cenoura', 449), ('Laranja', 399), ('Alface crespa', 349), ('Frango inteiro congelado', 1099),
  ('Carne bovina moída', 3290), ('Linguiça toscana', 2190), ('Peito de frango', 1790),
  ('Pão de forma tradicional', 899), ('Pão francês', 1490), ('Refrigerante de cola', 899),
  ('Suco de uva integral', 1190), ('Cerveja lata', 399), ('Água mineral sem gás', 249),
  ('Vinho tinto de mesa', 2290), ('Detergente líquido', 249), ('Sabão em pó', 1290),
  ('Água sanitária', 379), ('Papel higiênico (12 rolos)', 1890), ('Amaciante de roupas', 1190),
  ('Sabonete', 199), ('Creme dental', 349), ('Shampoo', 1190)
),
pairs as (
  select s.id as store_id, p.id as product_id, b.base_cents,
         abs(hashtext(s.id::text || p.canonical_name))        as h1,
         abs(hashtext(p.canonical_name || s.id::text || 'p')) as h2,
         abs(hashtext(s.id::text || 'd' || p.canonical_name)) as h3
  from public.stores s
  cross join public.products p
  join base b on b.name = p.canonical_name
)
insert into public.price_observations
  (store_id, product_id, price_cents, unit_price_cents, promo, valid_from, valid_to,
   observed_at, source, confidence, status, approved_at)
select store_id, product_id,
       greatest(50, round(base_cents * (0.88 + (h1 % 25) / 100.0)
                                     * case when h2 % 100 < 12 then 0.85 else 1 end))::integer,
       1,  -- recalculado pelo trigger a partir do tamanho do produto
       h2 % 100 < 12,
       null,
       case when h2 % 100 < 12 then now() + interval '4 days' end,
       now() - make_interval(days => h3 % 10),
       'manual', 1, 'approved', now()
from pairs
where h1 % 10 <> 0;

refresh materialized view public.current_prices;

-- ── Admin local para desenvolvimento (admin@local.test / admin123456) ───────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-0000000000a1',
  'authenticated', 'authenticated', 'admin@local.test',
  extensions.crypt('admin123456', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Admin Local"}', now(), now(),
  '', '', '', ''
);
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), '40000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1',
  jsonb_build_object('sub', '40000000-0000-4000-8000-0000000000a1', 'email', 'admin@local.test'),
  'email', now(), now(), now()
);
update public.profiles set role = 'admin' where id = '40000000-0000-4000-8000-0000000000a1';
