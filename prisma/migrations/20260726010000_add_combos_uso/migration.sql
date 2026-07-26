-- Add USO to TipoMovimentacao enum
ALTER TYPE "TipoMovimentacao" ADD VALUE IF NOT EXISTS 'USO';

-- Create combos table
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

-- Create combos_itens table
CREATE TABLE IF NOT EXISTS "combos_itens" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "combos_itens_pkey" PRIMARY KEY ("id")
);

-- Add indexes
CREATE INDEX IF NOT EXISTS "combos_negocioId_ativo_idx" ON "combos"("negocioId", "ativo");

-- Add foreign keys
ALTER TABLE "combos" ADD CONSTRAINT IF NOT EXISTS "combos_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combos_itens" ADD CONSTRAINT IF NOT EXISTS "combos_itens_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "combos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combos_itens" ADD CONSTRAINT IF NOT EXISTS "combos_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
