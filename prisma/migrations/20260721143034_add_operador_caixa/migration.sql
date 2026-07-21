-- AlterTable
ALTER TABLE "caixas" ADD COLUMN IF NOT EXISTS "operadorId" TEXT;
ALTER TABLE "caixas" ADD CONSTRAINT "caixas_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
