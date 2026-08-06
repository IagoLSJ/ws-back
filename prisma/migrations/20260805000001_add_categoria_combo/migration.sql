-- Combo passa a ter categoria (para aparecer filtrado nas categorias da vitrine)
ALTER TABLE "combos" ADD COLUMN IF NOT EXISTS "categoriaId" TEXT;

ALTER TABLE "combos" ADD CONSTRAINT "combos_categoriaId_fkey"
  FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
