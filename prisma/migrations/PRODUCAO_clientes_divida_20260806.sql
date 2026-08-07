-- ============================================================
-- MIGRAÇÃO DE CLIENTES COM DÍVIDA (CONTAS A RECEBER) — PRODUÇÃO
-- Origem: banco local (dev), 14 clientes com saldoDevedor > 0
-- Gerado em 06/08/2026
--
-- ATENÇÃO: o negocioId é resolvido por slug ('mercado') para
-- funcionar independente do UUID do negócio em produção.
-- Se o slug do negócio for diferente em produção, ajuste abaixo.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) CLIENTES
-- ------------------------------------------------------------
INSERT INTO "clientes" ("id", "cpfCnpj", "nome", "telefone", "limiteCredito", "saldoDevedor", "observacao", "criadoEm", "atualizadoEm") VALUES
('119756d0-d1cb-4bb5-914b-f44913d9c50f', NULL, 'AGLAYSSE', NULL, 1000.00, 86.91, NULL, '2026-08-06 17:19:51.997', '2026-08-06 18:06:23.377'),
('19a26af7-5c05-43d4-8570-d7a6503d2920', NULL, 'ANA', NULL, 1000.00, 283.82, NULL, '2026-08-06 17:09:13.314', '2026-08-06 18:06:28.854'),
('40028a44-90c7-4bf7-a0b9-e2be04b66896', NULL, 'BACHINHO FUNCIONARIO', NULL, 1000.00, 1008.14, NULL, '2026-08-06 17:19:26.678', '2026-08-06 18:06:36.412'),
('fd754a35-7bfd-49e8-9d0c-0c445d773c54', NULL, 'CACULA', NULL, 1000.00, 30.49, NULL, '2026-08-06 17:16:14.914', '2026-08-06 18:06:41.073'),
('a179434c-aa81-47ad-9fb5-0d22db7c2d7e', NULL, 'DINHO', NULL, 1000.00, 80.18, NULL, '2026-08-06 17:14:16.889', '2026-08-06 18:06:45.037'),
('c71d0d38-599d-446e-bed8-084ecbe4ed58', NULL, 'DYBALA', NULL, 1000.00, 14.00, NULL, '2026-08-06 17:14:44.528', '2026-08-06 18:06:52.064'),
('db6dad26-2cb1-4b47-b9fb-4c891aac91d9', NULL, 'ELY FUNCIONARIO', NULL, 1000.00, 351.28, NULL, '2026-08-06 17:16:47.549', '2026-08-06 18:06:55.882'),
('6cf10c8f-3c2c-40cf-b0f2-5c70c68b4b03', NULL, 'FERNANDO BOTEKO', NULL, 2500.00, 1273.00, NULL, '2026-08-06 17:15:22.212', '2026-08-06 18:07:02.332'),
('838bcfcf-75f8-40ae-b5bf-a1974f8bd9c9', NULL, 'FLAVIANA FUNCIONARIO', NULL, 1000.00, 23.01, NULL, '2026-08-06 17:18:35.728', '2026-08-06 18:07:07.712'),
('663cecdb-5ab0-49a7-af3d-d5b397e3145e', NULL, 'HUGO FUNCIONARIO', NULL, 1000.00, 75.99, NULL, '2026-08-06 17:09:58.118', '2026-08-06 18:07:14.489'),
('aebbabd7-19cc-491a-8faf-c09e1c6ede2c', NULL, 'LAECIO PEDREIRO', NULL, 1000.00, 987.05, NULL, '2026-08-06 17:10:29.58', '2026-08-06 18:07:20.993'),
('b94242de-b9cb-43b1-9e1b-94abf72b4ce1', NULL, 'LUANA FUNCIONARIA', NULL, 1000.00, 864.71, NULL, '2026-08-06 17:11:31.513', '2026-08-06 18:07:26.224'),
('c0231bb4-8e04-433c-9738-a98a668a7327', NULL, 'THOMAS FUNCIONARIO', NULL, 1000.00, 188.21, NULL, '2026-08-06 17:11:08.446', '2026-08-06 18:07:32.265'),
('71f416a8-84c8-4a19-8242-7067225634ef', NULL, 'WILLAME', NULL, 1000.00, 47.00, NULL, '2026-08-06 17:11:52.316', '2026-08-06 18:07:38.234')
ON CONFLICT ("id") DO NOTHING;

-- ------------------------------------------------------------
-- 2) CONTAS A RECEBER (dívidas migradas do sistema antigo)
--    pedidoId = NULL (não existe venda no PDV)
--    negocioId resolvido pelo slug do negócio
-- ------------------------------------------------------------
INSERT INTO "contas_receber" ("id", "clienteId", "negocioId", "pedidoId", "valorTotal", "valorPago", "dataVencimento", "dataPagamento", "status", "observacao", "criadoEm", "atualizadoEm") VALUES
('71d014ef-cbfc-4238-939e-5ffb5e726096', '119756d0-d1cb-4bb5-914b-f44913d9c50f', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 86.91, 0.00, '2026-08-06 17:19:51.999', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:19:51.999', '2026-08-06 17:19:51.999'),
('209234eb-f6dc-4fe0-a712-b6963c88252e', '19a26af7-5c05-43d4-8570-d7a6503d2920', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 283.82, 0.00, '2026-08-06 17:09:13.316', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:09:13.319', '2026-08-06 17:09:13.319'),
('4942c6be-d3ec-4bf4-a5de-38d934bfc321', '40028a44-90c7-4bf7-a0b9-e2be04b66896', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 1008.14, 0.00, '2026-08-06 17:19:26.681', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:19:26.682', '2026-08-06 17:19:26.682'),
('784438cd-ed38-4d13-8a6a-5c1317ba9dc4', 'fd754a35-7bfd-49e8-9d0c-0c445d773c54', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 30.49, 0.00, '2026-08-06 17:16:14.916', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:16:14.917', '2026-08-06 17:16:14.917'),
('adf8b855-3c57-491c-9e90-fe12beea1d05', 'a179434c-aa81-47ad-9fb5-0d22db7c2d7e', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 80.18, 0.00, '2026-08-06 17:14:16.89', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:14:16.891', '2026-08-06 17:14:16.891'),
('7652cfe1-f3d0-4503-a162-3bef6d8b9f40', 'c71d0d38-599d-446e-bed8-084ecbe4ed58', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 14.00, 0.00, '2026-08-06 17:14:44.53', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:14:44.531', '2026-08-06 17:14:44.531'),
('04d0e932-46a3-4e8c-968e-0b386b194c86', 'db6dad26-2cb1-4b47-b9fb-4c891aac91d9', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 351.28, 0.00, '2026-08-06 17:16:47.552', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:16:47.553', '2026-08-06 17:16:47.553'),
('837854a2-3d41-45e2-88a7-01e930ff4139', '6cf10c8f-3c2c-40cf-b0f2-5c70c68b4b03', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 1273.00, 0.00, '2026-08-06 17:15:22.214', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:15:22.214', '2026-08-06 17:15:22.214'),
('a1a5e241-d196-43af-9704-965af909c4d6', '838bcfcf-75f8-40ae-b5bf-a1974f8bd9c9', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 23.01, 0.00, '2026-08-06 17:18:35.731', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:18:35.731', '2026-08-06 17:18:35.731'),
('8dfa3ecc-fd53-4fd4-923b-dba7a61396df', '663cecdb-5ab0-49a7-af3d-d5b397e3145e', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 75.99, 0.00, '2026-08-06 17:09:58.12', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:09:58.121', '2026-08-06 17:09:58.121'),
('7e20038e-7b4d-4648-a281-ccaabca61d0d', 'aebbabd7-19cc-491a-8faf-c09e1c6ede2c', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 987.05, 0.00, '2026-08-06 17:10:29.582', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:10:29.583', '2026-08-06 17:10:29.583'),
('0f11b5ac-f3ca-4ce1-adbd-c5ce71df0b7b', 'b94242de-b9cb-43b1-9e1b-94abf72b4ce1', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 864.71, 0.00, '2026-08-06 17:11:31.514', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:11:31.515', '2026-08-06 17:11:31.515'),
('d32a7f56-b320-4caa-9d38-9faf48531bb4', 'c0231bb4-8e04-433c-9738-a98a668a7327', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 188.21, 0.00, '2026-08-06 17:11:08.448', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:11:08.449', '2026-08-06 17:11:08.449'),
('c2316dac-ff5d-42ea-8381-a147331f2edb', '71f416a8-84c8-4a19-8242-7067225634ef', (SELECT id FROM "negocios" WHERE "slug" = 'mercado' LIMIT 1), NULL, 47.00, 0.00, '2026-08-06 17:11:52.318', NULL, 'PENDENTE', 'Dívida migrada do sistema antigo', '2026-08-06 17:11:52.319', '2026-08-06 17:11:52.319')
ON CONFLICT ("id") DO NOTHING;

COMMIT;

-- ============================================================
-- VALIDAÇÃO (opcional, rodar depois):
--   SELECT count(*) FROM "clientes" WHERE "saldoDevedor" > 0;  -- esperado: 14
--   SELECT count(*) FROM "contas_receber";                     -- esperado: 14
-- ============================================================
