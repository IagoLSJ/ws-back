-- Estoque e movimentações passam a aceitar decimais (ex.: 24,5 kg)
ALTER TABLE "estoque_itens" ALTER COLUMN "quantidadeAtual" TYPE DECIMAL(10,3);
ALTER TABLE "estoque_itens" ALTER COLUMN "quantidadeAtual" SET DEFAULT 0;

ALTER TABLE "estoque_itens" ALTER COLUMN "estoqueMinimo" TYPE DECIMAL(10,3);
ALTER TABLE "estoque_itens" ALTER COLUMN "estoqueMinimo" SET DEFAULT 5;

ALTER TABLE "movimentacoes_estoque" ALTER COLUMN "quantidade" TYPE DECIMAL(10,3);
ALTER TABLE "movimentacoes_estoque" ALTER COLUMN "quantidadeAntes" TYPE DECIMAL(10,3);
ALTER TABLE "movimentacoes_estoque" ALTER COLUMN "quantidadeApos" TYPE DECIMAL(10,3);
