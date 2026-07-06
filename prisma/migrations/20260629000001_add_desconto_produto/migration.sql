-- AlterTable: Replace precoPromocional with tipoDesconto + valorDesconto
ALTER TABLE "produtos" DROP COLUMN "precoPromocional";
ALTER TABLE "produtos" ADD COLUMN "tipoDesconto" TEXT;
ALTER TABLE "produtos" ADD COLUMN "valorDesconto" DECIMAL(10,2);
