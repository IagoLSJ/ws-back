-- CPF/CNPJ passa a ser opcional (clientes migrados de contas antigas podem não ter)
ALTER TABLE "clientes" ALTER COLUMN "cpfCnpj" DROP NOT NULL;
