-- CreateTable
CREATE TABLE "taxas_frete_bairro" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "taxa" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxas_frete_bairro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "taxas_frete_bairro_negocioId_ativo_idx" ON "taxas_frete_bairro"("negocioId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "taxas_frete_bairro_negocioId_bairro_key" ON "taxas_frete_bairro"("negocioId", "bairro");

-- AddForeignKey
ALTER TABLE "taxas_frete_bairro" ADD CONSTRAINT "taxas_frete_bairro_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
