-- Cidade da filial, usada para limitar a visibilidade do catálogo no PDV
ALTER TABLE "negocios" ADD COLUMN IF NOT EXISTS "cidade" TEXT;

CREATE INDEX IF NOT EXISTS "negocios_cidade_idx" ON "negocios"("cidade");
