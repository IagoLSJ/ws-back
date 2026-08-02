-- Taxas de cartão por negócio (repasse automático no PDV)
ALTER TABLE "configuracoes_negocio" ADD COLUMN "taxaCredito" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "configuracoes_negocio" ADD COLUMN "taxaDebito" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Valor da taxa de cartão aplicada na venda
ALTER TABLE "pedidos" ADD COLUMN "taxaCartao" DECIMAL(10,2) NOT NULL DEFAULT 0;
