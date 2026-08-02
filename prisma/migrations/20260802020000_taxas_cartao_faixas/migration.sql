-- Tabela de faixas da taxa de cartão (ex.: 0-20 -> R$1; 20-50 -> R$2; 50-100 -> R$3)
-- Substitui as colunas de percentual (taxaCredito/taxaDebito) por uma lista de faixas compartilhada
ALTER TABLE "configuracoes_negocio" ADD COLUMN "taxaCartaoFaixas" JSON;
ALTER TABLE "configuracoes_negocio" DROP COLUMN IF EXISTS "taxaCredito";
ALTER TABLE "configuracoes_negocio" DROP COLUMN IF EXISTS "taxaDebito";
