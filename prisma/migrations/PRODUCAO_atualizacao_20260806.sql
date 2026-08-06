-- ============================================================
-- ATUALIZAÇÃO DE SCHEMA — PRODUÇÃO
-- Aplicar UMA única vez, em ordem (todo o script é idempotente
-- onde possível). Feito em 06/08/2026.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Conta a receber pode não ter pedido (dívida migrada de
--    sistema antigo sem venda no PDV)
-- ------------------------------------------------------------
ALTER TABLE "contas_receber" ALTER COLUMN "pedidoId" DROP NOT NULL;

-- ------------------------------------------------------------
-- 2) CPF/CNPJ do cliente passa a ser opcional (clientes migrados
--    de contas antigas podem não ter documento)
-- ------------------------------------------------------------
ALTER TABLE "clientes" ALTER COLUMN "cpfCnpj" DROP NOT NULL;

-- ------------------------------------------------------------
-- 3) Cidade da filial — limita a visibilidade do catálogo no PDV
--    (PDV enxerga produtos do próprio negócio ou da mesma cidade)
-- ------------------------------------------------------------
ALTER TABLE "negocios" ADD COLUMN IF NOT EXISTS "cidade" TEXT;

CREATE INDEX IF NOT EXISTS "negocios_cidade_idx" ON "negocios"("cidade");

COMMIT;

-- ============================================================
-- PASSO PÓS-SCRIPT (opcional, mas recomendado)
-- ------------------------------------------------------------
-- Preencher a cidade das filiais existentes, ex.:
--   UPDATE "negocios" SET "cidade" = 'Pedra Branca' WHERE id = '<id-da-filial-pedra-branca>';
--   UPDATE "negocios" SET "cidade" = 'Santa Cruz'   WHERE id = '<id-da-filial-santa-cruz>';
-- Negócios SEM cidade ficam isolados (só veem os próprios produtos).
-- ============================================================
