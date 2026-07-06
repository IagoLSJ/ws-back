-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('PENDENTE', 'CONFIRMADO', 'PREPARANDO', 'PRONTO', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'PIX', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO', 'ESTORNADO');

-- CreateTable
CREATE TABLE "carrinhos" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrinhos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrinho_itens" (
    "id" TEXT NOT NULL,
    "carrinhoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrinho_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrinho_itens_opcoes" (
    "id" TEXT NOT NULL,
    "carrinhoItemId" TEXT NOT NULL,
    "opcaoId" TEXT NOT NULL,

    CONSTRAINT "carrinho_itens_opcoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "status" "StatusPedido" NOT NULL DEFAULT 'PENDENTE',
    "total" DECIMAL(10,2) NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_itens" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "produtoNome" TEXT NOT NULL,
    "precoUnitario" DECIMAL(10,2) NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "modificadores" JSON,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "metodo" "MetodoPagamento" NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'PENDENTE',
    "transacaoId" TEXT,
    "dadosPagamento" JSON,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carrinhos_negocioId_sessionId_idx" ON "carrinhos"("negocioId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "carrinhos_negocioId_sessionId_key" ON "carrinhos"("negocioId", "sessionId");

-- CreateIndex
CREATE INDEX "carrinho_itens_carrinhoId_idx" ON "carrinho_itens"("carrinhoId");

-- CreateIndex
CREATE UNIQUE INDEX "carrinho_itens_opcoes_carrinhoItemId_opcaoId_key" ON "carrinho_itens_opcoes"("carrinhoItemId", "opcaoId");

-- CreateIndex
CREATE INDEX "pedidos_negocioId_criadoEm_idx" ON "pedidos"("negocioId", "criadoEm");

-- CreateIndex
CREATE INDEX "pedidos_sessionId_idx" ON "pedidos"("sessionId");

-- CreateIndex
CREATE INDEX "pedido_itens_pedidoId_idx" ON "pedido_itens"("pedidoId");

-- CreateIndex
CREATE INDEX "pagamentos_pedidoId_idx" ON "pagamentos"("pedidoId");

-- AddForeignKey
ALTER TABLE "carrinhos" ADD CONSTRAINT "carrinhos_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrinhos" ADD CONSTRAINT "carrinhos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrinho_itens" ADD CONSTRAINT "carrinho_itens_carrinhoId_fkey" FOREIGN KEY ("carrinhoId") REFERENCES "carrinhos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrinho_itens" ADD CONSTRAINT "carrinho_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrinho_itens_opcoes" ADD CONSTRAINT "carrinho_itens_opcoes_carrinhoItemId_fkey" FOREIGN KEY ("carrinhoItemId") REFERENCES "carrinho_itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrinho_itens_opcoes" ADD CONSTRAINT "carrinho_itens_opcoes_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES "opcoes_modificador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
