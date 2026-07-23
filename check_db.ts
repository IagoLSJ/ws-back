import "dotenv/config";
import { Client } from "pg";

const url = process.env.DATABASE_URL;

async function main() {
  if (!url) { console.log("❌ DATABASE_URL não configurada"); return; }

  const client = new Client({ connectionString: url });
  await client.connect();
  console.log("✅ Conectado a:", url.replace(/\/\/.*@/, "//user:pass@"));

  const { rows: tabelas } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
  );
  const existentes = new Set(tabelas.map((t: any) => t.table_name));

  const esperadas = [
    "audit_logs", "caixa_movimentos", "caixas", "carrinho_itens",
    "carrinho_itens_opcoes", "carrinhos", "categorias", "clientes",
    "clientes_whatsapp", "configuracoes_negocio", "contas_receber",
    "estoque_itens", "grupos_modificador", "imagens_produto",
    "impressoras_config", "membros_negocio", "mensagens_whatsapp",
    "mesas", "movimentacoes_estoque", "negocios", "opcoes_modificador",
    "pagamentos", "pedido_itens", "pedidos", "produtos",
    "refresh_tokens", "taxas_frete_bairro", "usuarios",
  ];

  console.log("\n=== TABELAS ===");
  for (const t of esperadas) {
    console.log(existentes.has(t) ? "  ✅" : "  ❌", t);
  }

  const { rows: colunas } = await client.query(`
    SELECT table_name, column_name FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND (
        (table_name = 'caixas' AND column_name = 'operadorId')
        OR (table_name = 'impressoras_config' AND column_name IN ('tipoUso','operadorId'))
      )
  `);

  const cols: Record<string, Set<string>> = {};
  for (const c of colunas as any[]) {
    if (!cols[c.table_name]) cols[c.table_name] = new Set();
    cols[c.table_name].add(c.column_name);
  }

  console.log("\n=== COLUNAS CRÍTICAS ===");
  const check = (t: string, c: string) =>
    console.log(`  ${cols[t]?.has(c) ? "✅" : "❌"} ${t}.${c}`);
  check("caixas", "operadorId");
  check("impressoras_config", "tipoUso");
  check("impressoras_config", "operadorId");

  await client.end();
}

main().catch((e) => console.error("Erro:", e.message));
