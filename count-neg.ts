import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });
  const negocioId = process.argv[2];
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE "quantidadeAtual" <= 0)::int AS zerados,
              COUNT(*) FILTER (WHERE "quantidadeAtual" < 0)::int AS negativos,
              COUNT(*) FILTER (WHERE "quantidadeAtual" > 0 AND "quantidadeAtual" <= "estoqueMinimo")::int AS criticos
       FROM estoque_itens WHERE "negocioId" = $1`,
      [negocioId],
    );
    console.log(negocioId, JSON.stringify(r.rows[0]));
  } catch (e: any) {
    console.log('ERROR', e.message);
  } finally {
    await pool.end();
  }
}

main();
