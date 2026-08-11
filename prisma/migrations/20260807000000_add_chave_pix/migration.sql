-- Chave PIX do negócio, usada para gerar QR Code dinâmico no PDV
ALTER TABLE "configuracoes_negocio" ADD COLUMN IF NOT EXISTS "chavePix" TEXT;
