-- CreateEnum
CREATE TYPE "FiscalAmbiente" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "FiscalRegime" AS ENUM ('SIMPLES_NACIONAL', 'REGIME_NORMAL', 'MEI');

-- CreateEnum
CREATE TYPE "FiscalStatusDocumento" AS ENUM ('PENDENTE', 'PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA', 'PENDENTE_CONSULTA', 'ERRO');

-- CreateTable
CREATE TABLE "configuracoes_fiscais" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "ambiente" "FiscalAmbiente" NOT NULL DEFAULT 'HOMOLOGACAO',
    "regime" "FiscalRegime" NOT NULL DEFAULT 'SIMPLES_NACIONAL',
    "cnpj" TEXT NOT NULL,
    "ie" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "endereco" JSONB NOT NULL,
    "serie" INTEGER NOT NULL DEFAULT 1,
    "proximoNumero" INTEGER NOT NULL DEFAULT 1,
    "cscId" TEXT,
    "cscCriptografado" TEXT,
    "certificadoA1Criptografado" TEXT,
    "certificadoSenhaCriptografada" TEXT,
    "certificadoNome" TEXT,
    "certificadoValidade" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "configuracoes_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_fiscais" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "configuracaoId" TEXT NOT NULL,
    "ambiente" "FiscalAmbiente" NOT NULL,
    "modelo" TEXT NOT NULL DEFAULT '65',
    "status" "FiscalStatusDocumento" NOT NULL DEFAULT 'PENDENTE',
    "numero" INTEGER,
    "serie" INTEGER,
    "chaveAcesso" TEXT,
    "protocolo" TEXT,
    "recibo" TEXT,
    "xmlAssinado" TEXT,
    "xmlAutorizado" TEXT,
    "qrCodeUrl" TEXT,
    "codigoStatus" TEXT,
    "mensagem" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "documentos_fiscais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracoes_fiscais_negocioId_key" ON "configuracoes_fiscais"("negocioId");
CREATE UNIQUE INDEX "documentos_fiscais_pedidoId_key" ON "documentos_fiscais"("pedidoId");
CREATE UNIQUE INDEX "documentos_fiscais_chaveAcesso_key" ON "documentos_fiscais"("chaveAcesso");
CREATE INDEX "documentos_fiscais_negocioId_status_idx" ON "documentos_fiscais"("negocioId", "status");
CREATE INDEX "documentos_fiscais_negocioId_criadoEm_idx" ON "documentos_fiscais"("negocioId", "criadoEm");

ALTER TABLE "configuracoes_fiscais" ADD CONSTRAINT "configuracoes_fiscais_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_configuracaoId_fkey" FOREIGN KEY ("configuracaoId") REFERENCES "configuracoes_fiscais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
