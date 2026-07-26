ALTER TABLE "impressoras_config" ADD COLUMN IF NOT EXISTS "tipoUso" TEXT NOT NULL DEFAULT 'COZINHA';
ALTER TABLE "impressoras_config" ADD COLUMN IF NOT EXISTS "operadorId" TEXT;
CREATE INDEX IF NOT EXISTS "impressoras_config_negocioId_tipoUso_idx" ON "impressoras_config"("negocioId", "tipoUso");
