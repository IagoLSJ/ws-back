-- Tabela de tokens OAuth do Mercado Livre (para importar imagens)
CREATE TABLE IF NOT EXISTS "integracoes_mercadolivre" (
    "id" TEXT PRIMARY KEY,
    "negocioId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integracoes_mercadolivre_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "integracoes_mercadolivre_negocioId_key" ON "integracoes_mercadolivre"("negocioId");
