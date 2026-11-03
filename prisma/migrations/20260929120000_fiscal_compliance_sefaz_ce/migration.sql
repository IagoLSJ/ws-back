-- AlterEnum: contingência offline NFC-e (tpEmis=9)
ALTER TYPE "FiscalStatusDocumento" ADD VALUE IF NOT EXISTS 'CONTINGENCIA';

-- AlterTable: campos fiscais do produto (tributação por regime, CEST, origem)
ALTER TABLE "produtos" ADD COLUMN "origem" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "produtos" ADD COLUMN "csosn" TEXT;
ALTER TABLE "produtos" ADD COLUMN "cstIcms" TEXT;
ALTER TABLE "produtos" ADD COLUMN "aliqIcms" DECIMAL(7,4);
ALTER TABLE "produtos" ADD COLUMN "aliqPis" DECIMAL(7,4);
ALTER TABLE "produtos" ADD COLUMN "aliqCofins" DECIMAL(7,4);
ALTER TABLE "produtos" ADD COLUMN "cest" TEXT;

-- AlterTable: configuração fiscal (contingência) e documento fiscal (tentativas, eventos)
ALTER TABLE "configuracoes_fiscais" ADD COLUMN "permitirContingencia" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "documentos_fiscais" ADD COLUMN "tentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "documentos_fiscais" ADD COLUMN "authorizedEm" TIMESTAMP(3);
ALTER TABLE "documentos_fiscais" ADD COLUMN "dhContingencia" TIMESTAMP(3);

-- CreateTable: eventos fiscais (cancelamento, inutilização)
CREATE TABLE "fiscais_eventos" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "documentoId" TEXT,
    "tipo" TEXT NOT NULL,
    "chaveAcesso" TEXT,
    "serie" INTEGER,
    "numeroInicial" INTEGER,
    "numeroFinal" INTEGER,
    "justificativa" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL DEFAULT 1,
    "xmlAssinado" TEXT,
    "xmlResposta" TEXT,
    "cStat" TEXT,
    "xMotivo" TEXT,
    "protocolo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fiscais_eventos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fiscais_eventos_negocioId_criadoEm_idx" ON "fiscais_eventos"("negocioId", "criadoEm");
CREATE INDEX "fiscais_eventos_documentoId_idx" ON "fiscais_eventos"("documentoId");

ALTER TABLE "fiscais_eventos" ADD CONSTRAINT "fiscais_eventos_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos_fiscais"("id") ON DELETE SET NULL ON UPDATE CASCADE;
