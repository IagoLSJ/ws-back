-- Campos do PIX: nome do recebedor e cidade (obrigatórios no BR Code)
ALTER TABLE "configuracoes_negocio" ADD COLUMN IF NOT EXISTS "pixNomeRecebedor" TEXT;
ALTER TABLE "configuracoes_negocio" ADD COLUMN IF NOT EXISTS "pixCidade" TEXT;
