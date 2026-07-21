-- Add vendaPorPeso column to produtos
ALTER TABLE "produtos" ADD COLUMN "vendaPorPeso" BOOLEAN NOT NULL DEFAULT false;

-- Change quantidade from Int to Decimal in carrinho_itens
ALTER TABLE "carrinho_itens" ALTER COLUMN "quantidade" TYPE DECIMAL(10,3);
ALTER TABLE "carrinho_itens" ALTER COLUMN "quantidade" SET DEFAULT 1;

-- Change quantidade from Int to Decimal in pedido_itens
ALTER TABLE "pedido_itens" ALTER COLUMN "quantidade" TYPE DECIMAL(10,3);
ALTER TABLE "pedido_itens" ALTER COLUMN "quantidade" SET DEFAULT 1;
