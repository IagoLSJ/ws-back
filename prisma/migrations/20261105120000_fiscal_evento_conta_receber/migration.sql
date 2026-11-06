--.AddColumn
ALTER TABLE "fiscais_eventos" ADD COLUMN IF NOT EXISTS "contaReceberId" TEXT;
ALTER TABLE "fiscais_eventos" ADD COLUMN IF NOT EXISTS "valor" DECIMAL(10,2);
ALTER TABLE "fiscais_eventos" ADD COLUMN IF NOT EXISTS "dataPagamento" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fiscais_eventos_contaReceberId_idx" ON "fiscais_eventos"("contaReceberId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fiscais_eventos_contaReceberId_fkey'
  ) THEN
    ALTER TABLE "fiscais_eventos" ADD CONSTRAINT "fiscais_eventos_contaReceberId_fkey"
      FOREIGN KEY ("contaReceberId") REFERENCES "contas_receber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
