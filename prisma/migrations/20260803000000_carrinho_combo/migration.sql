-- Suporte a combo no carrinho: agrupa itens de um combo e guarda o preço fechado
ALTER TABLE "carrinho_itens" ADD COLUMN "comboRef" TEXT;
ALTER TABLE "carrinho_itens" ADD COLUMN "comboNome" TEXT;
ALTER TABLE "carrinho_itens" ADD COLUMN "comboPreco" DECIMAL(10,2);
