-- Product-level approximate tax rates (consumer information) and checkout discount snapshot.
ALTER TABLE "produtos" ADD COLUMN "pRedBC" DECIMAL(7,4);
ALTER TABLE "produtos" ADD COLUMN "cstPis" TEXT;
ALTER TABLE "produtos" ADD COLUMN "cstCofins" TEXT;
ALTER TABLE "produtos" ADD COLUMN "aliqTributosFederais" DECIMAL(7,4);
ALTER TABLE "produtos" ADD COLUMN "aliqTributosEstaduais" DECIMAL(7,4);
ALTER TABLE "produtos" ADD COLUMN "aliqTributosMunicipais" DECIMAL(7,4);
ALTER TABLE "produtos" ADD COLUMN "fonteTributosAproximados" TEXT;
ALTER TABLE "produtos" ADD COLUMN "vigenciaTributosAproximados" TIMESTAMP(3);

ALTER TABLE "pedidos" ADD COLUMN "descontoTotal" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "pedidos" ADD COLUMN "tributosFederaisAproximados" DECIMAL(10,2);
ALTER TABLE "pedidos" ADD COLUMN "tributosEstaduaisAproximados" DECIMAL(10,2);
ALTER TABLE "pedidos" ADD COLUMN "tributosMunicipaisAproximados" DECIMAL(10,2);
ALTER TABLE "pedidos" ADD COLUMN "fontesTributosAproximados" TEXT;

ALTER TABLE "configuracoes_fiscais" ALTER COLUMN "permitirContingencia" SET DEFAULT false;
UPDATE "configuracoes_fiscais" SET "permitirContingencia" = false;
