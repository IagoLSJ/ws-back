-- AlterTable: cardapio passa a ter multiplas imagens
ALTER TABLE "configuracoes_negocio" ADD COLUMN IF NOT EXISTS "cardapioImagens" JSONB;

UPDATE "configuracoes_negocio"
SET "cardapioImagens" = jsonb_build_array("cardapioImagemUrl")
WHERE "cardapioImagemUrl" IS NOT NULL
  AND ("cardapioImagens" IS NULL OR jsonb_array_length("cardapioImagens") = 0);

ALTER TABLE "configuracoes_negocio" DROP COLUMN IF EXISTS "cardapioImagemUrl";
