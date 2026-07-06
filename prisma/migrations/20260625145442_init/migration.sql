-- CreateEnum
CREATE TYPE "RoleNegocio" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'GERENTE', 'OPERADOR_ESTOQUE', 'VISUALIZADOR');

-- CreateEnum
CREATE TYPE "ProdutoStatus" AS ENUM ('ATIVO', 'PAUSADO', 'ESGOTADO');

-- CreateEnum
CREATE TYPE "TipoMovimentacao" AS ENUM ('ENTRADA', 'SAIDA_VENDA', 'SAIDA_AJUSTE', 'PERDA', 'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SAIDA', 'INVENTARIO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revogado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negocios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "corPrimaria" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "negocios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes_negocio" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "controleEstoqueAtivo" BOOLEAN NOT NULL DEFAULT true,
    "estoqueMinimoPadrao" INTEGER NOT NULL DEFAULT 5,
    "webhookUrl" TEXT,
    "emailAlertas" TEXT,

    CONSTRAINT "configuracoes_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membros_negocio" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "role" "RoleNegocio" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membros_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "iconUrl" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "preco" DECIMAL(10,2) NOT NULL,
    "precoPromocional" DECIMAL(10,2),
    "sku" TEXT,
    "status" "ProdutoStatus" NOT NULL DEFAULT 'ATIVO',
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "controlaEstoque" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imagens_produto" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "imagens_produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos_modificador" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "minSelecao" INTEGER NOT NULL DEFAULT 0,
    "maxSelecao" INTEGER NOT NULL DEFAULT 1,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "grupos_modificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opcoes_modificador" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "precoExtra" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "opcoes_modificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoque_itens" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidadeAtual" INTEGER NOT NULL DEFAULT 0,
    "estoqueMinimo" INTEGER NOT NULL DEFAULT 5,
    "unidade" TEXT NOT NULL DEFAULT 'un',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estoque_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_estoque" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "estoqueItemId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "quantidadeAntes" INTEGER NOT NULL,
    "quantidadeApos" INTEGER NOT NULL,
    "motivo" TEXT,
    "referencia" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "negocioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "payload" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "negocios_slug_key" ON "negocios"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_negocio_negocioId_key" ON "configuracoes_negocio"("negocioId");

-- CreateIndex
CREATE INDEX "membros_negocio_negocioId_idx" ON "membros_negocio"("negocioId");

-- CreateIndex
CREATE UNIQUE INDEX "membros_negocio_usuarioId_negocioId_key" ON "membros_negocio"("usuarioId", "negocioId");

-- CreateIndex
CREATE INDEX "categorias_negocioId_ativo_idx" ON "categorias"("negocioId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_negocioId_nome_key" ON "categorias"("negocioId", "nome");

-- CreateIndex
CREATE INDEX "produtos_negocioId_status_idx" ON "produtos"("negocioId", "status");

-- CreateIndex
CREATE INDEX "produtos_negocioId_categoriaId_idx" ON "produtos"("negocioId", "categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "estoque_itens_produtoId_key" ON "estoque_itens"("produtoId");

-- CreateIndex
CREATE INDEX "estoque_itens_negocioId_idx" ON "estoque_itens"("negocioId");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_negocioId_criadoEm_idx" ON "movimentacoes_estoque"("negocioId", "criadoEm");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_estoqueItemId_criadoEm_idx" ON "movimentacoes_estoque"("estoqueItemId", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_logs_negocioId_criadoEm_idx" ON "audit_logs"("negocioId", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_logs_usuarioId_criadoEm_idx" ON "audit_logs"("usuarioId", "criadoEm");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_negocio" ADD CONSTRAINT "configuracoes_negocio_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_negocio" ADD CONSTRAINT "membros_negocio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_negocio" ADD CONSTRAINT "membros_negocio_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_produto" ADD CONSTRAINT "imagens_produto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_modificador" ADD CONSTRAINT "grupos_modificador_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opcoes_modificador" ADD CONSTRAINT "opcoes_modificador_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "grupos_modificador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_itens" ADD CONSTRAINT "estoque_itens_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_itens" ADD CONSTRAINT "estoque_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_estoqueItemId_fkey" FOREIGN KEY ("estoqueItemId") REFERENCES "estoque_itens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
