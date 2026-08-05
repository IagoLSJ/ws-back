import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });

  try {
    await pool.query('BEGIN');

    // Pedidos criados pelo teste de carga (sessão k6-*) e pelo teste manual (teste123)
    const pedidos = await pool.query(
      `SELECT id FROM pedidos WHERE "sessionId" LIKE 'k6-%' OR "sessionId" = 'teste123'`,
    );
    console.log('pedidos de teste:', pedidos.rowCount);

    if ((pedidos.rowCount ?? 0) > 0) {
      const ids = pedidos.rows.map((r) => r.id);
      await pool.query(`DELETE FROM caixa_movimentos WHERE "pedidoId" = ANY($1)`, [ids]);
      await pool.query(`DELETE FROM pedidos WHERE id = ANY($1)`, [ids]);
    }

    // Carrinhos criados pelo teste de carga / teste manual
    const carrinhos = await pool.query(
      `SELECT id FROM carrinhos WHERE "sessionId" LIKE 'k6-%' OR "sessionId" = 'teste123'`,
    );
    console.log('carrinhos de teste:', carrinhos.rowCount);
    if ((carrinhos.rowCount ?? 0) > 0) {
      const ids = carrinhos.rows.map((r) => r.id);
      await pool.query(`DELETE FROM carrinho_itens WHERE "carrinhoId" = ANY($1)`, [ids]);
      await pool.query(`DELETE FROM carrinhos WHERE id = ANY($1)`, [ids]);
    }

    await pool.query('COMMIT');
    console.log('limpeza concluída');
  } catch (e: any) {
    await pool.query('ROLLBACK');
    console.log('ERROR', e.message);
  } finally {
    await pool.end();
  }
}

main();
