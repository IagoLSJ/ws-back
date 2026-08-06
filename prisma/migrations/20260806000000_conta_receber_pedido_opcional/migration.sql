-- Conta a receber de migração de dívidas antigas pode não ter pedido
ALTER TABLE "contas_receber" ALTER COLUMN "pedidoId" DROP NOT NULL;
