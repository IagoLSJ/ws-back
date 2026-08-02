ALTER TYPE "TipoMovimentacao" ADD VALUE IF NOT EXISTS 'USO';

CREATE TABLE IF NOT EXISTS "combos" (
    "id" TEXT PRIMARY KEY,
    "negocioId" TEXT NOT NULL REFERENCES "negocios"("id") ON DELETE CASCADE,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "preco" DECIMAL(10,2) NOT NULL,
    "imagemUrl" TEXT,
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP NOT NULL DEFAULT NOW(),
    "atualizadoEm" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_combos_negocio_ativo ON "combos"("negocioId", "ativo");

CREATE TABLE IF NOT EXISTS "combos_itens" (
    "id" TEXT PRIMARY KEY,
    "comboId" TEXT NOT NULL REFERENCES "combos"("id") ON DELETE CASCADE,
    "produtoId" TEXT NOT NULL REFERENCES "produtos"("id"),
    "quantidade" INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "ncm" TEXT;
ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "cfop" TEXT;
