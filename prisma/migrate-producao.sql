-- ============================================================
-- MIGRAÇÃO COMPLETA PARA PRODUÇÃO
-- Todas as alterações de schema feitas após a última migração
-- ============================================================

-- 1. Adicionar colunas tipoUso e operadorId na tabela impressoras_config
ALTER TABLE "impressoras_config" ADD COLUMN IF NOT EXISTS "tipoUso" TEXT NOT NULL DEFAULT 'COZINHA';
ALTER TABLE "impressoras_config" ADD COLUMN IF NOT EXISTS "operadorId" TEXT;
CREATE INDEX IF NOT EXISTS "impressoras_config_negocioId_tipoUso_idx" ON "impressoras_config"("negocioId", "tipoUso");

-- 2. Adicionar USO ao enum TipoMovimentacao
ALTER TYPE "TipoMovimentacao" ADD VALUE IF NOT EXISTS 'USO';

-- 3. Criar tabela combos
CREATE TABLE IF NOT EXISTS "combos" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "preco" DECIMAL(10,2) NOT NULL,
    "imagemUrl" TEXT,
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "combos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "combos_negocioId_ativo_idx" ON "combos"("negocioId", "ativo");
ALTER TABLE "combos" ADD CONSTRAINT IF NOT EXISTS "combos_negocioId_fkey"
    FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Criar tabela combos_itens
CREATE TABLE IF NOT EXISTS "combos_itens" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "combos_itens_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "combos_itens" ADD CONSTRAINT IF NOT EXISTS "combos_itens_comboId_fkey"
    FOREIGN KEY ("comboId") REFERENCES "combos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combos_itens" ADD CONSTRAINT IF NOT EXISTS "combos_itens_produtoId_fkey"
    FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Adicionar colunas NCM e CFOP na tabela produtos (faltantes na migração)
ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "ncm" TEXT;
ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "cfop" TEXT;

-- 6. Registrar migrações no Prisma (se quiser que o Prisma reconheça)
-- INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
-- VALUES
--   ('20260725010000_add_impressora_tipouso_operador', '*', NOW(), '20260725010000_add_impressora_tipouso_operador', NULL, NOW(), 1),
--   ('20260726010000_add_combos_uso', '*', NOW(), '20260726010000_add_combos_uso', NULL, NOW(), 1);
