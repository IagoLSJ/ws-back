-- DropForeignKey
ALTER TABLE "movimentacoes_estoque" DROP CONSTRAINT "movimentacoes_estoque_usuarioId_fkey";

-- AlterTable
ALTER TABLE "movimentacoes_estoque" ALTER COLUMN "usuarioId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
