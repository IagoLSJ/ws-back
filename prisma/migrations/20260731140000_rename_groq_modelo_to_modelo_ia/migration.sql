-- Renomeia o campo de modelo da IA (agora usado apenas com Gemini)
ALTER TABLE "configuracoes_negocio" RENAME COLUMN "groqModelo" TO "modeloIa";

UPDATE "configuracoes_negocio" SET "modeloIa" = 'gemini-2.0-flash';

ALTER TABLE "configuracoes_negocio" ALTER COLUMN "modeloIa" SET DEFAULT 'gemini-2.0-flash';
