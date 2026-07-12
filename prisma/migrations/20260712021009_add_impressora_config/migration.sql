-- CreateTable
CREATE TABLE "impressoras_config" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'TERMICA',
    "conexao" TEXT NOT NULL DEFAULT 'REDE',
    "enderecoIp" TEXT,
    "porta" INTEGER NOT NULL DEFAULT 9100,
    "papelLargura" INTEGER NOT NULL DEFAULT 80,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "impressoras_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "impressoras_config_negocioId_ativo_idx" ON "impressoras_config"("negocioId", "ativo");

-- AddForeignKey
ALTER TABLE "impressoras_config" ADD CONSTRAINT "impressoras_config_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
