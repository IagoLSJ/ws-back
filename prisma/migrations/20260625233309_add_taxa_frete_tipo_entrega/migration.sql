-- AlterTable
ALTER TABLE "configuracoes_negocio" ADD COLUMN     "taxaFrete" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "taxaFrete" DECIMAL(10,2),
ADD COLUMN     "tipoEntrega" TEXT DEFAULT 'ENTREGA';
