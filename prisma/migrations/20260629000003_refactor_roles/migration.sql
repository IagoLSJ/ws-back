-- Migrate ADMIN to GERENTE
UPDATE "membros_negocio" SET "role" = 'GERENTE' WHERE "role" = 'ADMIN';

-- Create new enum type replacing ADMIN with GERENTE (already exists) and renaming OPERADOR_ESTOQUE to OPERADOR
CREATE TYPE "RoleNegocio_new" AS ENUM ('SUPER_ADMIN', 'GERENTE', 'OPERADOR', 'VISUALIZADOR');

-- Alter column to use new type, mapping OPERADOR_ESTOQUE to OPERADOR
ALTER TABLE "membros_negocio" 
  ALTER COLUMN "role" TYPE "RoleNegocio_new" 
  USING (CASE WHEN "role"::text = 'OPERADOR_ESTOQUE' THEN 'OPERADOR'::"RoleNegocio_new" ELSE "role"::text::"RoleNegocio_new" END);

-- Drop old type and rename new one
DROP TYPE "RoleNegocio";
ALTER TYPE "RoleNegocio_new" RENAME TO "RoleNegocio";
