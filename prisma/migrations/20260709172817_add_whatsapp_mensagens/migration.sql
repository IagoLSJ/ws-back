-- CreateEnum
CREATE TYPE "TipoMensagemWhatsApp" AS ENUM ('CLIENTE', 'BOT', 'ADMIN');

-- AlterTable
ALTER TABLE "clientes_whatsapp" ADD COLUMN     "modoHumano" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "configuracoes_negocio" ADD COLUMN     "chatbotAtivo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mensagemBoasVindas" TEXT,
ADD COLUMN     "mensagemFallback" TEXT;

-- CreateTable
CREATE TABLE "mensagens_whatsapp" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" "TipoMensagemWhatsApp" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_clienteId_criadoEm_idx" ON "mensagens_whatsapp"("clienteId", "criadoEm");

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes_whatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
