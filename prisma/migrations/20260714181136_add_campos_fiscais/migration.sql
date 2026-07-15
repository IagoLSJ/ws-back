-- AlterTable
ALTER TABLE "configuracoes_negocio" ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "ie" TEXT,
ADD COLUMN     "razaoSocial" TEXT;

-- AlterTable
ALTER TABLE "impressoras_config" ALTER COLUMN "conexao" SET DEFAULT 'USB';

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "chaveAcesso" TEXT,
ADD COLUMN     "clienteCpf" TEXT,
ADD COLUMN     "clienteNome" TEXT,
ADD COLUMN     "numeroNfe" TEXT,
ADD COLUMN     "qrCodeUrl" TEXT,
ADD COLUMN     "serieNfe" TEXT,
ADD COLUMN     "tributosAproximados" DECIMAL(10,2),
ADD COLUMN     "troco" DECIMAL(10,2);
