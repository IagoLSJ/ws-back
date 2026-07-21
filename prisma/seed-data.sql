-- ============================================================
-- PRODUTOS + CATEGORIAS + MODIFICADORES + OPÇÕES
-- Lanchonete Modelo (f253a90a-f480-4777-8acb-ec34c60f59e2)
-- ============================================================

-- 1. CATEGORIAS (9)
INSERT INTO categorias (id, "negocioId", nome, descricao, "iconUrl", ordem, ativo, "criadoEm") VALUES
('batata-cat',          'f253a90a-f480-4777-8acb-ec34c60f59e2', 'Batata Frita',    'Batatas artesanais',                             NULL, 4, true, '2026-07-15 11:12:22.407'),
('bebidas-cat',         'f253a90a-f480-4777-8acb-ec34c60f59e2', 'Bebidas',         'Sucos, vitaminas e refrigerantes',               NULL, 1, true, '2026-07-15 11:04:59.456'),
('bolos-cat',           'f253a90a-f480-4777-8acb-ec34c60f59e2', 'Bolos Decorados', 'Bolos decorados sob encomenda',                  NULL, 7, true, '2026-07-15 11:19:44.453'),
('burger-caseiro-cat',  'f253a90a-f480-4777-8acb-ec34c60f59e2', 'Burger Caseiro',  'Hambúrgueres artesanais',                        NULL, 3, true, '2026-07-15 11:11:07.405'),
('lanches-simples-cat', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'Lanches Simples', 'Lanches artesanais',                             NULL, 2, true, '2026-07-15 11:09:38.633'),
('mini-salgados-cat',   'f253a90a-f480-4777-8acb-ec34c60f59e2', 'Mini Salgados',   'Mini salgados, pasteis, churros e bolo de pote', NULL, 8, true, '2026-07-15 11:23:10.385'),
('pastel10-cat',        'f253a90a-f480-4777-8acb-ec34c60f59e2', 'Pastel 10cm',     'Pasteis de 10cm',                                NULL, 6, true, '2026-07-15 11:16:21.622'),
('pastelao-cat',        'f253a90a-f480-4777-8acb-ec34c60f59e2', 'Pastelão 20cm',   'Pastéis grandes de 20cm',                        NULL, 5, true, '2026-07-15 11:13:41.493'),
('pizza-cat',           'f253a90a-f480-4777-8acb-ec34c60f59e2', 'Pizza Tamanho G', 'Pizzas tamanho grande',                          NULL, 9, true, '2026-07-15 11:26:17.261');

-- 2. PRODUTOS (58)
INSERT INTO produtos (id, "negocioId", "categoriaId", nome, descricao, preco, "codigoBarras", plu, "precoCusto", status, destaque, ordem, "controlaEstoque", "tipoDesconto", "valorDesconto") VALUES
('9afb03c4-2282-42f1-a138-644592270ced', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        '4 Queijo',                   'Mussarela, queijo coalho, catupiry e cheddar',                                                                  17.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('a675f4fb-c51a-4c47-a828-8083550650ee', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Bacon',                      NULL,                                                                                                             13.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('8e76f75a-cd8b-4862-b96b-453ba305ccf0', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'batata-cat',          'Batata Completa',            'Batata frita com calabresa, catupiry, bacon e cheddar',                                                        20.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('c51ca7b5-07f9-4e11-938b-a454699183a3', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'batata-cat',          'Batata Família',             '600gm - Batata, queijo mussarela, bacon, calabresa, boi, frango, catupiry, cheddar, salada',                   85.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('e6efbe93-671f-422f-8c16-a87285e42edc', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'batata-cat',          'Batata Frita',               'Batata frita crocante',                                                                                        10.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('e3a51d77-a9e9-49ea-a705-9b0fe7424dea', 'f253a90a-f480-4777-8acb-ec34c60f59e2', NULL,                  'Batata Frita',               'Porção de batata frita crocante 300g',                                                                         15.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('2e9575ea-8fcc-4993-a34a-95b04dfc6ae1', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'batata-cat',          'Batata com Bacon',           'Batata frita com bacon',                                                                                       14.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('e78e0899-ab6b-4637-b821-3e10d09242ce', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'batata-cat',          'Batata com Bacon e Cheddar', 'Batata frita com bacon e cheddar',                                                                             17.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('48d65876-1e7f-4633-ab63-d05f1ab05e83', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'batata-cat',          'Batata com Calabresa',       'Batata frita com calabresa',                                                                                   14.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('57ed4e5c-0460-4688-980c-600eec675c65', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'bolos-cat',           'Bolo Decorado',              'Bolo decorado sob encomenda - agendamento com 50% de entrada',                                                 60.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('45d2dbed-8c20-4f21-ad43-4ff447f48ed3', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'mini-salgados-cat',   'Bolo de Pote',               'Bolo de pote 200ml',                                                                                           8.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('45a3e1f2-5a03-4dbc-9cc4-9153f070b48e', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'burger-caseiro-cat',  'Burger Caseiro',             'Carne de 90g, Queijo, Presunto, Alface e tomate',                                                              13.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('e78eac4c-35cb-4d33-b99f-9990dd4f3364', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'burger-caseiro-cat',  'Burger WS Gigante',          '2 carnes de 120g, Queijo cheddar, Calabresa, Bacon, Cebola roxa, Salada e molho da casa',                      20.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('3bf26b35-8663-4bfe-9799-f3627b396955', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'bebidas-cat',         'Cajuina 1L',                 'Cajuina em garrafa de 1 litro',                                                                                10.00, NULL, NULL, NULL, 'ATIVO', false, 0, true, NULL, NULL),
('63765be7-c2fd-4212-a055-fed84161af30', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Calabresa',                  NULL,                                                                                                             13.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('c473b18e-310b-4910-bb79-6a35cea36cef', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pizza-cat',           'Calabresa',                  'Calabresa e mussarela',                                                                                        40.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('f422c6d4-f75b-4471-bc1b-3e13a0ba9499', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'lanches-simples-cat', 'Calabresa Defumada',         'Carne, Calabresa, Queijo, Alface e tomate',                                                                    13.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('2281f159-1f41-48e2-a76b-7b1f14429993', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Carne',                      NULL,                                                                                                             11.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('90a1079a-5aa2-4347-9f42-20e1b33b8186', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pizza-cat',           'Carne de Sol',               'Carne de sol, mussarela, pimentao, tomate e cebola',                                                           48.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('a9173ff1-7fcb-4aea-a6df-009321f458b6', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Carne de Sol',               NULL,                                                                                                             15.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('9f42c88a-8404-457d-b611-29aff18db007', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Chocolate',                  'Pastel doce de chocolate',                                                                                     14.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('7f4a0bea-c4ff-4772-8e9a-c5f1901dfb53', 'f253a90a-f480-4777-8acb-ec34c60f59e2', NULL,                  'Coca-Cola Lata',             'Refrigerante Coca-Cola 350ml',                                                                                 6.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('2972d8fa-bd1a-4149-87fa-203fe81d6422', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'lanches-simples-cat', 'Egg-Burger',                 'Carne, Ovo, Queijo, Presunto, Alface e tomate',                                                                15.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('b4a0d8b6-c640-4409-9efe-11b737702c4e', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Familia 1',                  'Carne ou frango, queijo, presunto, catupiry, calabresa e milho',                                               48.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('8320449c-ba63-4345-856d-813dd921f4f7', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Familia 2',                  'Carne ou frango, queijo, presunto, catupiry, calabresa, milho, bacon e mussarela',                             58.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('d3070b04-86f7-428e-8464-7be4923197f2', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Frango',                     NULL,                                                                                                             11.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('2f16f91a-a7f7-4352-91b3-9b60200b473c', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'burger-caseiro-cat',  'Frango no Pão Árabe',        'Frango trinchado, Queijo cheddar, Salada, Cebola roxa e molho da casa',                                        14.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('40385a68-11f5-48d3-8a58-df677ac4ad95', 'f253a90a-f480-4777-8acb-ec34c60f59e2', NULL,                  'Leite',                      NULL,                                                                                                             1.00, '7891033482825', NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('aa07313c-0ed8-48cf-89d7-2b6de1928446', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'bebidas-cat',         'Limão',                      'Suco de limão',                                                                                                8.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('a521671a-6908-4515-bcaf-1a8538fce163', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Master 1',                   'Frango, queijo, presunto, catupiry e milho',                                                                   15.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('604b6127-ada2-488c-b532-05c68da09c98', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Master 2',                   'Frango, queijo, presunto, catupiry, bacon e mussarela',                                                        20.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('9dfa8acf-6c81-43c7-b166-d43cc6f2e882', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'mini-salgados-cat',   'Mini Churros (20 unid)',     'Mini churros com recheio',                                                                                     10.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('b839db32-567d-4a5e-9d31-307a5a25c4e3', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'mini-salgados-cat',   'Mini Pasteis',               'Mini pasteis fritos',                                                                                          30.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('350983fe-5c2a-41bb-9a02-8eef80daadc6', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'mini-salgados-cat',   'Mini Salgados Variados',     'Mini salgados sortidos',                                                                                       14.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('9b37c975-1f2b-4996-9a93-de6b56a0fd15', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pizza-cat',           'Mista',                      'Mussarela e presunto',                                                                                         40.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('38118b77-97c7-437a-8383-262f73213ad9', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pizza-cat',           'Mussarela',                  'Mussarela',                                                                                                    40.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('650e3872-1d27-40b2-abd7-0baed71a19b1', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pizza-cat',           'Nordestina',                 'Carne de sol, mussarela, catupiry, milho, cheiro verde, cebola e pimentao',                                    58.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('a2f8bfb2-5434-49e0-93c0-b46797e8aeaf', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastel10-cat',        'Pastel 10cm',                'Pastel de 10cm com recheio a escolher',                                                                        6.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('e1be7c78-9057-4d2f-9623-09a249bb6e4f', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pizza-cat',           'Paulista',                   'Frango, mussarela, catupiry e milho',                                                                          45.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('e688e5a6-2a29-4941-86a3-df825c92516f', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Pizza',                      'Presunto, queijo, mussarela e orégano',                                                                        16.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('1e1755dd-dc52-4805-99c7-6e745f7dda58', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pizza-cat',           'Portuguesa',                 'Mussarela, presunto, ovo, azeitona, cebola e tomate',                                                          46.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('46e927db-1f4a-46c9-9508-135bf3980fee', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'pastelao-cat',        'Presunto',                   NULL,                                                                                                             11.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('d40be334-0129-4640-9415-85df93771a9d', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'bebidas-cat',         'Refrigerante 1L',            'Refrigerante em garrafa de 1 litro',                                                                           10.00, NULL, NULL, NULL, 'ATIVO', false, 0, true, NULL, NULL),
('dfec0068-835d-4c31-beaa-cca8a742a5a5', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'bebidas-cat',         'Refrigerante 2L',            'Refrigerante em garrafa de 2 litros',                                                                          13.00, NULL, NULL, NULL, 'ATIVO', false, 0, true, NULL, NULL),
('08c2ea76-bba8-4680-9a3e-67819e2809ac', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'bebidas-cat',         'Refrigerante 350ml',         'Refrigerante em lata 350ml',                                                                                   5.00, NULL, NULL, NULL, 'ATIVO', false, 0, true, NULL, NULL),
('b65a4c2b-5897-43ee-860d-350a899b2ac0', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'burger-caseiro-cat',  'Smash Burger',               'Carne de 90g, Queijo cheddar e cebola roxa',                                                                   13.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('84a9b2fa-cab0-488a-9c02-3720013ba892', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'burger-caseiro-cat',  'Smash Burger WS',            '2 carnes de 90g, Queijo cheddar, Bacon, Cebola roxa, Salada e molho da casa',                                  18.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('7009aadb-7513-4ca5-93fb-4efdda09f255', 'f253a90a-f480-4777-8acb-ec34c60f59e2', NULL,                  'Suco Natural',               'Suco de laranja natural 500ml',                                                                                8.50, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('c3bb6470-2801-48b8-ac65-1d4c63fb441d', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'bebidas-cat',         'Suco ou Vitamina',           'Escolha o sabor e o tipo',                                                                                     5.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('da00b2d2-3ae2-4892-aaee-27735b99fd4e', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'lanches-simples-cat', 'X-Bacon',                    'Carne, Bacon, Queijo, Alface e tomate',                                                                        14.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('9c7e1fbe-537e-4c7f-8fbe-685391658dd7', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'burger-caseiro-cat',  'X-Boi no Pão Árabe',         'Carne bovina trinchada, Queijo cheddar, Calabresa, Bacon, Cebola roxa, Salada e molho da casa',                18.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('ad10aebb-397b-4d91-909d-cbfb2229a96d', 'f253a90a-f480-4777-8acb-ec34c60f59e2', NULL,                  'X-Burger',                   'Hambúrguer artesanal 180g, queijo cheddar, alface, tomate',                                                    25.90, NULL, NULL, NULL, 'ATIVO', true,  0, false, NULL, NULL),
('61c3f9c8-a96d-4316-8517-4770baec29fc', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'burger-caseiro-cat',  'X-Burger Caseiro',           'Carne de 120g, Queijo, Presunto, Alface e tomate',                                                             15.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('1cd50bbd-c827-4427-be6f-29f1f93d38b5', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'burger-caseiro-cat',  'X-Frango',                   'Frango desfiado, queijo, presunto, milho e catupiry',                                                          15.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('bb8c5193-9185-4911-81c6-9e092a651a2a', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'lanches-simples-cat', 'X-Salada',                   'Carne, Queijo, Alface e tomate',                                                                               10.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('88e60d18-4da7-4181-a0eb-996a6b12d348', 'f253a90a-f480-4777-8acb-ec34c60f59e2', NULL,                  'X-Salada',                   'Hambúrguer 150g, queijo, alface, tomate, maionese',                                                            22.90, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('9d86505e-aab6-464b-b470-dd4099595b90', 'f253a90a-f480-4777-8acb-ec34c60f59e2', 'lanches-simples-cat', 'X-Simples',                  'Queijo, Presunto, Alface e tomate',                                                                            8.00, NULL, NULL, NULL, 'ATIVO', false, 0, false, NULL, NULL),
('2c724f1e-81d0-45bc-9df5-0819b53cf05c', 'f253a90a-f480-4777-8acb-ec34c60f59e2', NULL,                  'teste',                      NULL,                                                                                                             10.00, NULL, NULL, NULL, 'ATIVO', false, 0, true,  NULL, NULL);

-- 3. GRUPOS MODIFICADORES (41)
INSERT INTO grupos_modificador (id, "produtoId", nome, obrigatorio, "minSelecao", "maxSelecao", ordem) VALUES
('27554143-5073-47e5-af60-9ece8e7b90b9', '2281f159-1f41-48e2-a76b-7b1f14429993', 'Adicionais',    false, 0, 10, 1),
('08cc91ca-73ba-43ca-843c-256e0422aac2', '2e9575ea-8fcc-4993-a34a-95b04dfc6ae1', 'Tamanho',       true,  1, 1,  1),
('f8baa8bf-3d28-4f02-b007-81c604d84318', '350983fe-5c2a-41bb-9a02-8eef80daadc6', 'Quantidade',    true,  1, 1,  1),
('892b3ea4-5c39-4cc8-9557-b3fc3cebd956', '350983fe-5c2a-41bb-9a02-8eef80daadc6', 'Sabores',       false, 0, 14, 2),
('08e1bac5-35a6-47bc-a3aa-a9c3371ca861', '45d2dbed-8c20-4f21-ad43-4ff447f48ed3', 'Opcao',         true,  1, 1,  1),
('a8e23254-9668-47ab-b5a2-d05c552100a9', '46e927db-1f4a-46c9-9508-135bf3980fee', 'Adicionais',    false, 0, 10, 1),
('ff8c5c8f-e4c8-412f-a0fd-04a95313210a', '48d65876-1e7f-4633-ab63-d05f1ab05e83', 'Tamanho',       true,  1, 1,  1),
('c59c1733-29d7-4218-9363-67145b91eb6a', '57ed4e5c-0460-4688-980c-600eec675c65', 'Cobertura',     true,  1, 1,  2),
('58202171-e7ae-4ef4-b37f-43f985775779', '57ed4e5c-0460-4688-980c-600eec675c65', 'Extras',        false, 0, 10, 5),
('28b3ad8f-96c2-4014-9eb6-32bfaf9c0bae', '57ed4e5c-0460-4688-980c-600eec675c65', 'Massa',         true,  1, 1,  3),
('909655d3-7218-4a7e-9c95-3d3a3e2299a8', '57ed4e5c-0460-4688-980c-600eec675c65', 'Recheio',       true,  1, 1,  4),
('99a31699-df52-4977-b15b-7bff1441bd84', '57ed4e5c-0460-4688-980c-600eec675c65', 'Tamanho',       true,  1, 1,  1),
('4f0ca737-a542-4fbd-a34f-7b1086a62c07', '604b6127-ada2-488c-b532-05c68da09c98', 'Adicionais',    false, 0, 10, 1),
('8ec8e87c-892e-4689-aeea-3fb8f53893eb', '604b6127-ada2-488c-b532-05c68da09c98', 'Adicionais',    false, 0, 10, 1),
('3513a60b-af05-471d-abfe-2042b3e05ca7', '63765be7-c2fd-4212-a055-fed84161af30', 'Adicionais',    false, 0, 10, 1),
('95ab559f-c081-4864-9524-1c8455c31200', '8320449c-ba63-4345-856d-813dd921f4f7', 'Adicionais',    false, 0, 10, 1),
('bf63c89a-a2c8-472d-b87b-dea95fb2275a', '8320449c-ba63-4345-856d-813dd921f4f7', 'Tipo de Carne', true,  1, 1,  1),
('436883c2-4601-429e-98c4-a90894c06a77', '8e76f75a-cd8b-4862-b96b-453ba305ccf0', 'Tamanho',       true,  1, 1,  1),
('69f5cf67-77e5-486b-84f3-f52d6f1ab0e1', '9afb03c4-2282-42f1-a138-644592270ced', 'Adicionais',    false, 0, 10, 1),
('dc2b41e4-1505-4475-9a60-e01a95de8bd0', '9afb03c4-2282-42f1-a138-644592270ced', 'Adicionais',    false, 0, 10, 1),
('b31b426a-b028-47a0-b37d-2e3914593587', '9dfa8acf-6c81-43c7-b166-d43cc6f2e882', 'Recheio',       true,  1, 1,  1),
('39c7c606-2610-475f-a360-cfe6994376d2', 'a2f8bfb2-5434-49e0-93c0-b46797e8aeaf', 'Recheio',       true,  1, 1,  1),
('c25e243c-72e6-43a2-9bc8-f90d35d22652', 'a521671a-6908-4515-bcaf-1a8538fce163', 'Adicionais',    false, 0, 10, 1),
('d1e5fa52-c1dc-4cb3-85b7-5d6e3e11a314', 'a521671a-6908-4515-bcaf-1a8538fce163', 'Adicionais',    false, 0, 10, 1),
('88ef7a12-f954-40a4-a954-375c26a6643b', 'a675f4fb-c51a-4c47-a828-8083550650ee', 'Adicionais',    false, 0, 10, 1),
('25ac4b14-b185-440d-bac5-eac0e4b994c3', 'a9173ff1-7fcb-4aea-a6df-009321f458b6', 'Adicionais',    false, 0, 10, 1),
('dd6bf44f-9e85-48e8-969c-fb028d73cce8', 'ad10aebb-397b-4d91-909d-cbfb2229a96d', 'Adicionais',    false, 0, 3,  0),
('56d6ddb8-0318-447d-ac0a-5c7ec1757f49', 'ad10aebb-397b-4d91-909d-cbfb2229a96d', 'Tamanho',       true,  1, 1,  0),
('0fb5545f-497a-49e3-9a54-865fcd7de4f9', 'b4a0d8b6-c640-4409-9efe-11b737702c4e', 'Adicionais',    false, 0, 10, 1),
('10e7ed3a-79ad-460e-9dbc-00f73ed90167', 'b4a0d8b6-c640-4409-9efe-11b737702c4e', 'Tipo de Carne', true,  1, 1,  1),
('0c1e56bf-600e-477d-90c0-d535b0c9ae01', 'b839db32-567d-4a5e-9d31-307a5a25c4e3', 'Quantidade',    true,  1, 1,  1),
('a4f39d5f-a7c1-4d1e-b29b-26ec9b80edc1', 'b839db32-567d-4a5e-9d31-307a5a25c4e3', 'Sabor',         true,  1, 1,  2),
('f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'c3bb6470-2801-48b8-ac65-1d4c63fb441d', 'Sabor',         true,  1, 1,  1),
('cfc922e5-0b86-40ed-877e-c82ff31d4262', 'c3bb6470-2801-48b8-ac65-1d4c63fb441d', 'Tipo',          true,  1, 1,  2),
('9a46ad54-d4e5-4420-9e07-11a4187be5dc', 'd3070b04-86f7-428e-8464-7be4923197f2', 'Adicionais',    false, 0, 10, 1),
('23b3a9d8-628f-4360-ad44-6d823a2c7410', 'd40be334-0129-4640-9415-85df93771a9d', 'Sabor',         true,  1, 1,  1),
('713d0537-c681-428b-b136-c4ddf68488c2', 'dfec0068-835d-4c31-beaa-cca8a742a5a5', 'Sabor',         true,  1, 1,  1),
('972459bd-2be6-41a8-8673-6f9045cef99c', 'e688e5a6-2a29-4941-86a3-df825c92516f', 'Adicionais',    false, 0, 10, 1),
('e499932d-e44d-4f9f-920d-2a379ae388c5', 'e688e5a6-2a29-4941-86a3-df825c92516f', 'Adicionais',    false, 0, 10, 1),
('0600139b-05ac-45cc-92c4-9a38a61bc37e', 'e6efbe93-671f-422f-8c16-a87285e42edc', 'Tamanho',       true,  1, 1,  1),
('610a3837-6846-40f2-b684-dd3ea538e4da', 'e78e0899-ab6b-4637-b821-3e10d09242ce', 'Tamanho',       true,  1, 1,  1);

-- 4. OPÇÕES DOS MODIFICADORES
-- (same content as before - all the opcoes_modificador INSERTs)
-- 4a. Bolo Decorado - Tamanho
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('09a720f8-b681-408e-9dce-42113c23d2c4', '99a31699-df52-4977-b15b-7bff1441bd84', 'Mini 10cm (5 fatias)',     0.00, true, 1),
('96d5cc10-d524-4f58-814a-2e1c18331660', '99a31699-df52-4977-b15b-7bff1441bd84', 'PP 14cm (8-12 fatias)',    30.00, true, 2),
('2bd64431-98f1-464f-9ff1-006be4dfa26d', '99a31699-df52-4977-b15b-7bff1441bd84', 'P1 16cm (12-18 fatias)',   52.50, true, 3),
('38d8c705-360a-40f3-85b6-5868b21a6e8f', '99a31699-df52-4977-b15b-7bff1441bd84', 'P2 18cm (18-24 fatias)',   75.00, true, 4),
('34d676db-07a9-4ccb-9be9-2f0a35f9624c', '99a31699-df52-4977-b15b-7bff1441bd84', 'M 22cm (25-30 fatias)',    112.50, true, 5),
('ec2cbdb3-22b1-4d7f-bd23-3fc88e7551a2', '99a31699-df52-4977-b15b-7bff1441bd84', 'G 26cm (30-40 fatias)',    202.50, true, 6),
('f68c5712-78c0-401c-83f7-4f89fd526000', '99a31699-df52-4977-b15b-7bff1441bd84', 'GG 30cm (50 fatias)',      270.00, true, 7);

-- 4b. Bolo Decorado - Cobertura
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('c33a963c-a448-4210-915c-54d068080163', 'c59c1733-29d7-4218-9363-67145b91eb6a', 'Chantininho',              0.00, true, 1),
('4210fcff-c786-49c3-a0b8-34dcea1932b4', 'c59c1733-29d7-4218-9363-67145b91eb6a', 'Chantilly Puro',           0.00, true, 2);

-- 4c. Bolo Decorado - Massa
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('86c1bb99-3798-439a-8aba-71b03dae16f8', '28b3ad8f-96c2-4014-9eb6-32bfaf9c0bae', 'Branca',                  0.00, true, 1),
('27ed6efb-28b4-4464-908a-27b75e242a5f', '28b3ad8f-96c2-4014-9eb6-32bfaf9c0bae', 'Chocolate',               0.00, true, 2),
('d6195d38-ce21-4886-acdd-f00a776b4da3', '28b3ad8f-96c2-4014-9eb6-32bfaf9c0bae', 'Mesclado',                0.00, true, 3);

-- 4d. Bolo Decorado - Recheio
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('06c814db-d07e-451c-8380-cd435a4b2465', '909655d3-7218-4a7e-9c95-3d3a3e2299a8', 'Chocolate 50%',           0.00, true, 1),
('52e8baba-56fc-429b-8fe7-a814fad55676', '909655d3-7218-4a7e-9c95-3d3a3e2299a8', 'Beijinho',                0.00, true, 2),
('8b9067a6-84f7-4f63-8b4d-1156f8c068ed', '909655d3-7218-4a7e-9c95-3d3a3e2299a8', 'Ninho',                   0.00, true, 3),
('6cd163c3-50ef-4525-9359-956173343429', '909655d3-7218-4a7e-9c95-3d3a3e2299a8', 'Maracuja',                0.00, true, 4),
('61742f47-e311-426a-b7bf-389f1de2851a', '909655d3-7218-4a7e-9c95-3d3a3e2299a8', 'Oreo',                    0.00, true, 5),
('312e679e-96da-45df-b4ff-cb5e7d9019db', '909655d3-7218-4a7e-9c95-3d3a3e2299a8', 'Abacaxi com Coco',        0.00, true, 6),
('7fce8d27-8d9d-40b2-b978-d56cc5ca9157', '909655d3-7218-4a7e-9c95-3d3a3e2299a8', 'Ninho com Morango',       0.00, true, 7);

-- 4e. Bolo Decorado - Extras
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('458d1c82-da01-41f8-9d33-8ec6a7430bf0', '58202171-e7ae-4ef4-b37f-43f985775779', 'Topo Simples',             15.00, true, 1),
('8fcff142-9c68-4d11-a9f8-524826813fcb', '58202171-e7ae-4ef4-b37f-43f985775779', 'Glitter/Po Decorativo',    15.00, true, 2);

-- 4f. Bolo de Pote - Opcao
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('62bf5dd3-5fef-47fb-bb0c-11858453e7e3', '08e1bac5-35a6-47bc-a3aa-a9c3371ca861', 'Chocolate c/ Ninho',       0.00, true, 1),
('015a5a76-8a71-444a-b752-7273a53804c9', '08e1bac5-35a6-47bc-a3aa-a9c3371ca861', 'Chocolate c/ Chocolate',   0.00, true, 2);

-- 4g. Mini Salgados Variados - Quantidade
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('9d4eb9d3-eb13-4143-823f-f0fc8c685e87', 'f8baa8bf-3d28-4f02-b007-81c604d84318', '25 unidades',             0.00, true, 1),
('716b3287-f0f3-4bb7-af7f-0f1645b808b3', 'f8baa8bf-3d28-4f02-b007-81c604d84318', '50 unidades',             13.00, true, 2),
('e91dc10a-9f85-48c5-8940-13381f97a3e1', 'f8baa8bf-3d28-4f02-b007-81c604d84318', '100 unidades',            39.00, true, 3);

-- 4h. Mini Salgados Variados - Sabores
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('585f3500-f1ad-4d34-a96d-0f7bcf489310', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Pastel de Carne',          0.00, true, 1),
('8b27541c-8476-4270-9fd1-b41eae7ab0a7', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Pastel de Queijo',         0.00, true, 2),
('f715c575-9d6a-4c64-8fac-f9478c758d55', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Pastel de Carne de Sol',   0.00, true, 3),
('5c652a32-b5dd-43e6-a3d3-17713d72f201', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Pastel de Chocolate',      0.00, true, 4),
('1f42758f-e800-4656-9ec1-a319539f5e8d', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Pastel de Nutela',         0.00, true, 5),
('e57b92ca-791b-4cd1-8e0f-ea0ff7a525a0', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Bolinha de Peixe',         0.00, true, 6),
('d666c7d5-1f05-47fa-8502-7cf93389cf52', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Canudinho Pate de Frango', 0.00, true, 7),
('22149d77-4c6c-452d-9f36-f14c90116ca9', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Travesseirinho Pizza',     0.00, true, 8),
('2cd3f46e-6bb5-43d0-bc12-6b17bc673b24', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Coxinha de Frango',        0.00, true, 9),
('dff36eda-e1f5-4d08-ba9e-1b6793d7dbf6', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Coxinha de Costela',       0.00, true, 10),
('621ee83c-4f04-4552-b77e-7cb3127cafb3', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Croquete de Mussarela',    0.00, true, 11),
('28c5123e-509a-4270-901d-763ea743c996', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Risole de Carne de Sol',   0.00, true, 12),
('da7e79a3-ac4a-4b9e-a90d-88604112ab97', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Bolinha de Queijo',        0.00, true, 13),
('43c2c73f-7d24-40bd-90bf-742ec84cef73', '892b3ea4-5c39-4cc8-9557-b3fc3cebd956', 'Nordestino',               0.00, true, 14);

-- 4i. Mini Pasteis - Quantidade
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('c294d9ed-fbc4-45eb-b121-e62bf39203e8', '0c1e56bf-600e-477d-90c0-d535b0c9ae01', '50 unidades',             0.00, true, 1),
('8e999fd1-20c8-4695-86a9-c84fb5e5b2de', '0c1e56bf-600e-477d-90c0-d535b0c9ae01', '100 unidades',            30.00, true, 2);

-- 4j. Mini Pasteis - Sabor
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('f51598af-971d-40b6-8593-05a9451be436', 'a4f39d5f-a7c1-4d1e-b29b-26ec9b80edc1', 'Carne',                   0.00, true, 1),
('5024878f-c31b-4a0b-b0e2-464c501bb9ca', 'a4f39d5f-a7c1-4d1e-b29b-26ec9b80edc1', 'Queijo',                  0.00, true, 2),
('b7b0700c-2c3e-465d-92a3-815c3ddd0822', 'a4f39d5f-a7c1-4d1e-b29b-26ec9b80edc1', 'Carne de Sol',            0.00, true, 3),
('c2cdfa56-f631-4f85-8bc1-9ac62b861e6e', 'a4f39d5f-a7c1-4d1e-b29b-26ec9b80edc1', 'Chocolate',               0.00, true, 4),
('240a96fb-0314-40ee-a64d-a75261563efe', 'a4f39d5f-a7c1-4d1e-b29b-26ec9b80edc1', 'Nutela',                  0.00, true, 5);

-- 4k. Mini Churros - Recheio
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('0be15bac-c1c1-497c-b3de-1c31fd9846b4', 'b31b426a-b028-47a0-b37d-2e3914593587', 'Doce de Leite',           0.00, true, 1),
('512c3e45-c8b0-4222-b48b-cbebab91ea45', 'b31b426a-b028-47a0-b37d-2e3914593587', 'Chocolate',               0.00, true, 2);

-- 4l. Pastel 10cm - Recheio
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('077708f5-9f9b-4886-96da-6e8c3b7c1a5a', '39c7c606-2610-475f-a360-cfe6994376d2', 'Carne',                   0.00, true, 1),
('89c13478-fcf4-4146-889b-7d8154d17c08', '39c7c606-2610-475f-a360-cfe6994376d2', 'Frango',                  0.00, true, 2),
('c7f0e286-9d2e-4de0-baa0-a2dda20656ac', '39c7c606-2610-475f-a360-cfe6994376d2', 'Queijo',                  0.00, true, 3),
('d3aedbb2-2587-4495-b23b-c830e847857a', '39c7c606-2610-475f-a360-cfe6994376d2', 'Presunto',                0.00, true, 4),
('c1865b2f-7e30-40c9-949e-e2b37e8a603f', '39c7c606-2610-475f-a360-cfe6994376d2', 'Frango e Catupiry',       2.00, true, 5),
('f2219603-c290-405a-b32e-da6c0c2f8962', '39c7c606-2610-475f-a360-cfe6994376d2', 'Carne e Queijo',          2.00, true, 6),
('d60635db-0d55-443f-aab1-202ca328fa09', '39c7c606-2610-475f-a360-cfe6994376d2', 'Presunto e Queijo',       2.00, true, 7),
('6e121f20-dd13-4752-8b27-b4fb147fe88b', '39c7c606-2610-475f-a360-cfe6994376d2', 'Carne de Sol',            3.00, true, 8),
('afcfb5d8-2d6f-452a-81b2-8140c65c5640', '39c7c606-2610-475f-a360-cfe6994376d2', 'Calabresa',               3.00, true, 9),
('8ee296e6-1693-481b-b45e-2b421ef93370', '39c7c606-2610-475f-a360-cfe6994376d2', 'Bacon',                   3.00, true, 10),
('ab8427d7-29be-4211-8af6-c201f80ad40f', '39c7c606-2610-475f-a360-cfe6994376d2', 'Pizza',                   3.00, true, 11),
('435577c6-4928-4f81-a271-9afe186ad002', '39c7c606-2610-475f-a360-cfe6994376d2', 'Chocolate',               3.00, true, 12),
('35ac9356-b9f0-4ad6-88ef-77329488a6ed', '39c7c606-2610-475f-a360-cfe6994376d2', 'Calabresa e Mussarela',   5.00, true, 13),
('9e3f8853-9947-4db5-a39f-e408c9927c12', '39c7c606-2610-475f-a360-cfe6994376d2', 'Frango e Bacon',          5.00, true, 14),
('e86a3bd4-d2d3-470c-bb4e-b9a99462d5d9', '39c7c606-2610-475f-a360-cfe6994376d2', '4 Queijos',               5.00, true, 15);

-- 4m. Suco ou Vitamina - Sabor
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('eea0f3c5-259f-4385-94ac-bc0a1b4146c3', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Acerola',                 0.00, true, 1),
('5dc4d49a-e125-4f94-9e35-2df88891c686', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Abacaxi',                 0.00, true, 2),
('c02a694f-7abf-4775-bf38-af122edd4665', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Cajá',                    0.00, true, 3),
('30a5b6d7-db83-469b-9adf-5fc9c6f78b38', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Caju',                    0.00, true, 4),
('a9f81845-160f-45dc-a6a9-457a24342829', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Goiaba',                  0.00, true, 5),
('54eaa8d9-5244-49b7-8da6-b68fd8017a8b', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Graviola',                0.00, true, 6),
('830a8add-a65c-41d1-a9d5-df6c94ebdc09', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Manga',                   0.00, true, 7),
('93e367d4-7f7c-4d47-9540-db4f3af9d877', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Maracujá',                0.00, true, 8),
('8fb1e7dd-839d-45ff-9825-3273ca303fbb', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Morango',                 0.00, true, 9),
('5f66dd66-0f4c-40bd-9273-e7913f57595e', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Açaí',                    0.00, true, 10),
('a427b073-69bc-4955-b5d9-eded819926ac', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Ciriguela',               0.00, true, 11),
('d4ea4853-4a89-466c-b19a-8cff46372345', 'f5c709de-a18c-4363-bfbd-7a1811aa99b5', 'Abacaxi com Hortelã',     0.00, true, 12);

-- 4n. Suco ou Vitamina - Tipo
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('ecd0d9fb-36c7-4f62-8ce7-abde581454a7', 'cfc922e5-0b86-40ed-877e-c82ff31d4262', 'Suco',                    0.00, true, 1),
('ddf436e0-54b9-4ebc-9463-57310909b5ef', 'cfc922e5-0b86-40ed-877e-c82ff31d4262', 'Vitamina',                3.00, true, 2);

-- 4o. Refrigerante 1L - Sabor
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('aec9a622-3846-4df6-a505-b4a8cb01df1c', '23b3a9d8-628f-4360-ad44-6d823a2c7410', 'Coca Cola',               0.00, true, 1),
('9882346c-705e-40c6-940a-b17d9db6ac0c', '23b3a9d8-628f-4360-ad44-6d823a2c7410', 'Fanta Laranja',           0.00, true, 2),
('53c035f6-27d4-4c4c-aa3d-031f3a0cbeb7', '23b3a9d8-628f-4360-ad44-6d823a2c7410', 'Uva',                     0.00, true, 3),
('ce112114-b826-47f1-bec8-b0cfe26de539', '23b3a9d8-628f-4360-ad44-6d823a2c7410', 'Guaraná',                 0.00, true, 4);

-- 4p. Refrigerante 2L - Sabor
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('d01cdd82-f3d5-47b9-8577-7a163fce248b', '713d0537-c681-428b-b136-c4ddf68488c2', 'Coca Cola',               0.00, true, 1),
('12510086-60a7-44d0-b1b5-220f989ac0a2', '713d0537-c681-428b-b136-c4ddf68488c2', 'Cajuína',                 0.00, true, 2),
('dfcd22f7-32c0-41fc-9c87-729a1265a969', '713d0537-c681-428b-b136-c4ddf68488c2', 'Fanta Laranja',           0.00, true, 3),
('d276165a-d9c2-41b6-bf7a-6d1a29701fc1', '713d0537-c681-428b-b136-c4ddf68488c2', 'Uva',                     0.00, true, 4),
('77541fb5-7314-4bd8-b3ef-c10535d6e181', '713d0537-c681-428b-b136-c4ddf68488c2', 'Guaraná',                 0.00, true, 5);

-- 4q. X-Burger - Adicionais
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('d80862d4-cc44-43b3-aedb-efd37c47e9b0', 'dd6bf44f-9e85-48e8-969c-fb028d73cce8', 'Bacon',        3.50, true, 0),
('c0238ea7-8010-42b1-b534-52fffa59a276', 'dd6bf44f-9e85-48e8-969c-fb028d73cce8', 'Cheddar extra', 2.00, true, 0),
('61c32abb-5c22-43a2-99dc-f74603afc5e2', 'dd6bf44f-9e85-48e8-969c-fb028d73cce8', 'Ovo',           2.50, true, 0);

-- 4r. X-Burger - Tamanho
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem) VALUES
('4fed8f61-c4e5-416c-ad87-2a2ac16646ca', '56d6ddb8-0318-447d-ac0a-5c7ec1757f49', 'Tradicional',   0.00, true, 0),
('fa36ad74-1418-4329-a087-e8739ed7cffa', '56d6ddb8-0318-447d-ac0a-5c7ec1757f49', 'Grande',        5.00, true, 0);

-- 4s. Tamanhos
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem)
SELECT gen_random_uuid()::text, g.id, x.nome, x.preco, true, x.ordem
FROM grupos_modificador g
CROSS JOIN (VALUES ('200gm', 0.00, 1), ('400gm', 7.00, 2)) AS x(nome, preco, ordem)
WHERE g.id = '0600139b-05ac-45cc-92c4-9a38a61bc37e';

INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem)
SELECT gen_random_uuid()::text, g.id, x.nome, x.preco, true, x.ordem
FROM grupos_modificador g
CROSS JOIN (VALUES ('200gm', 0.00, 1), ('400gm', 6.00, 2)) AS x(nome, preco, ordem)
WHERE g.id = '610a3837-6846-40f2-b684-dd3ea538e4da';

INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem)
SELECT gen_random_uuid()::text, g.id, x.nome, x.preco, true, x.ordem
FROM grupos_modificador g
CROSS JOIN (VALUES ('200gm', 0.00, 1), ('400gm', 4.00, 2)) AS x(nome, preco, ordem)
WHERE g.id IN ('08cc91ca-73ba-43ca-843c-256e0422aac2', 'ff8c5c8f-e4c8-412f-a0fd-04a95313210a');

INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem)
SELECT gen_random_uuid()::text, g.id, x.nome, x.preco, true, x.ordem
FROM grupos_modificador g
CROSS JOIN (VALUES ('200gm', 0.00, 1), ('400gm', 9.00, 2)) AS x(nome, preco, ordem)
WHERE g.id = '436883c2-4601-429e-98c4-a90894c06a77';

-- 4t. Tipo de Carne
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem)
SELECT gen_random_uuid()::text, g.id, x.nome, 0.00, true, x.ordem
FROM grupos_modificador g
CROSS JOIN (VALUES ('Carne', 1), ('Frango', 2)) AS x(nome, ordem)
WHERE g.id IN ('10e7ed3a-79ad-460e-9dbc-00f73ed90167', 'bf63c89a-a2c8-472d-b87b-dea95fb2275a');

-- 4u. Adicionais padronizados
INSERT INTO opcoes_modificador (id, "grupoId", nome, "precoExtra", ativo, ordem)
SELECT gen_random_uuid()::text, g.id, x.nome, x.preco, true, x.ordem
FROM grupos_modificador g
CROSS JOIN (VALUES
  ('Carne',        3.00, 1),
  ('Frango',       3.00, 2),
  ('Cheddar',      3.00, 3),
  ('Queijo',       3.00, 4),
  ('Milho',        3.00, 5),
  ('Catupiry',     3.00, 6),
  ('Presunto',     3.00, 7),
  ('Carne de Sol', 4.00, 8),
  ('Calabresa',    4.00, 9),
  ('Bacon',        4.00, 10)
) AS x(nome, preco, ordem)
WHERE g.id IN (
  '27554143-5073-47e5-af60-9ece8e7b90b9',
  'a8e23254-9668-47ab-b5a2-d05c552100a9',
  '3513a60b-af05-471d-abfe-2042b3e05ca7',
  '95ab559f-c081-4864-9524-1c8455c31200',
  '69f5cf67-77e5-486b-84f3-f52d6f1ab0e1',
  'dc2b41e4-1505-4475-9a60-e01a95de8bd0',
  'c25e243c-72e6-43a2-9bc8-f90d35d22652',
  'd1e5fa52-c1dc-4cb3-85b7-5d6e3e11a314',
  '88ef7a12-f954-40a4-a954-375c26a6643b',
  '25ac4b14-b185-440d-bac5-eac0e4b994c3',
  '0fb5545f-497a-49e3-9a54-865fcd7de4f9',
  '4f0ca737-a542-4fbd-a34f-7b1086a62c07',
  '8ec8e87c-892e-4689-aeea-3fb8f53893eb',
  '972459bd-2be6-41a8-8673-6f9045cef99c',
  'e499932d-e44d-4f9f-920d-2a379ae388c5',
  '9a46ad54-d4e5-4420-9e07-11a4187be5dc'
);
