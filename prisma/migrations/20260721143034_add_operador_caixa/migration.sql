-- CreateTable (recriado aqui porque a tabela "caixas" era criada via db push e nao existia no historico de migracao)
CREATE TABLE IF NOT EXISTS "caixas" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "usuarioAberturaId" TEXT NOT NULL,
    "operadorId" TEXT,
    "usuarioFechamentoId" TEXT,
    "saldoInicial" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "saldoFinal" DECIMAL(10,2),
    "totalTroco" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalVendas" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalDinheiro" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalDebito" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalCredito" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalPix" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalOutros" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalSangrias" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalSuprimentos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dataAbertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFechamento" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "observacao" TEXT,

    CONSTRAINT "caixas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "caixas_negocioId_status_idx" ON "caixas"("negocioId", "status");

-- AlterTable
ALTER TABLE "caixas" ADD COLUMN IF NOT EXISTS "operadorId" TEXT;
ALTER TABLE "caixas" ADD CONSTRAINT "caixas_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
