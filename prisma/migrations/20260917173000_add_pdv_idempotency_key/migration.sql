ALTER TABLE "pedidos" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "pedidos_negocioId_idempotencyKey_key"
ON "pedidos"("negocioId", "idempotencyKey");
