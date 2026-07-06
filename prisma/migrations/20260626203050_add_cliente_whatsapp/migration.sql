-- CreateTable
CREATE TABLE "clientes_whatsapp" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "nome" TEXT,
    "endereco" JSON,
    "ultimaInteracao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_whatsapp_sessionId_key" ON "clientes_whatsapp"("sessionId");

-- CreateIndex
CREATE INDEX "clientes_whatsapp_negocioId_telefone_idx" ON "clientes_whatsapp"("negocioId", "telefone");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_whatsapp_negocioId_telefone_key" ON "clientes_whatsapp"("negocioId", "telefone");

-- AddForeignKey
ALTER TABLE "clientes_whatsapp" ADD CONSTRAINT "clientes_whatsapp_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
