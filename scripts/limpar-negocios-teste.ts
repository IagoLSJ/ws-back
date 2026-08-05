import 'dotenv/config';
import { Pool } from 'pg';

// Negócios claramente de teste (E2E / CRUD / Multi / Teste)
const PADRAO = `
  n.nome ILIKE '%E2E%' OR n.slug ILIKE '%e2e%'
  OR n.nome LIKE 'Multi %'
  OR n.nome LIKE 'Negocio CRUD%'
  OR n.nome IN ('Teste', 'Teste Mercado')
`;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });

  try {
    await pool.query('BEGIN');

    const { rows: testes } = await pool.query(`SELECT id, nome FROM negocios n WHERE ${PADRAO}`);
    console.log('negócios de teste encontrados:', testes.length);

    const ids = testes.map((t) => t.id);

    // Descobre produtos dos negócios de teste que são referenciados por pedidos de negócios REAIS
    const refsReais = await pool.query(
      `SELECT DISTINCT pi."produtoId", pe."negocioId" AS "pedidoNegocio"
       FROM pedido_itens pi
       JOIN pedidos pe ON pe.id = pi."pedidoId"
       JOIN produtos pr ON pr.id = pi."produtoId"
       WHERE pr."negocioId" = ANY($1)
         AND pe."negocioId" <> ALL($1)`,
      [ids],
    );
    if ((refsReais.rowCount ?? 0) > 0) {
      console.log('⚠️ produtos de teste referenciados por pedidos REAIS:', refsReais.rowCount);
      for (const r of refsReais.rows) {
        console.log(`   produto ${r.produtoId.slice(0, 8)} usado por negócio real ${r.pedidoNegocio.slice(0, 8)}`);
      }
      // Mantém (desativa) os negócios de teste cujo produto está em pedido real
      const idsProtegidos = await pool.query(
        `SELECT DISTINCT pr."negocioId" FROM pedido_itens pi
         JOIN pedidos pe ON pe.id = pi."pedidoId"
         JOIN produtos pr ON pr.id = pi."produtoId"
         WHERE pr."negocioId" = ANY($1) AND pe."negocioId" <> ALL($1)`,
        [ids],
      );
      const protegidos = idsProtegidos.rows.map((r) => r.negocioId);
      await pool.query(`UPDATE negocios SET ativo = false WHERE id = ANY($1)`, [protegidos]);
      console.log('negócios protegidos (desativados):', protegidos.length);
      const finalIds = ids.filter((i) => !protegidos.includes(i));
      await deletar(pool, finalIds, testes, protegidos);
    } else {
      await deletar(pool, ids, testes, []);
    }

    await pool.query('COMMIT');
  } catch (e: any) {
    await pool.query('ROLLBACK');
    console.log('ERROR', e.message);
  } finally {
    await pool.end();
  }
}

async function deletar(pool: any, ids: string[], testes: any[], protegidos: string[]) {
  if (!ids.length) {
    console.log('nada a deletar');
    return;
  }

  // Carrinhos
  const c = await pool.query(`SELECT id FROM carrinhos WHERE "negocioId" = ANY($1)`, [ids]);
  const cIds = c.rows.map((r: any) => r.id);
  if (cIds.length) {
    await pool.query(`DELETE FROM carrinho_itens WHERE "carrinhoId" = ANY($1)`, [cIds]);
    await pool.query(`DELETE FROM carrinhos WHERE id = ANY($1)`, [cIds]);
  }

  // Caixa movimentos + pedidos (itens e pagamentos em cascata)
  const p = await pool.query(`SELECT id FROM pedidos WHERE "negocioId" = ANY($1)`, [ids]);
  const pIds = p.rows.map((r: any) => r.id);
  if (pIds.length) {
    await pool.query(`DELETE FROM caixa_movimentos WHERE "pedidoId" = ANY($1)`, [pIds]);
    await pool.query(`DELETE FROM pedido_itens WHERE "pedidoId" = ANY($1)`, [pIds]);
    await pool.query(`DELETE FROM pagamentos WHERE "pedidoId" = ANY($1)`, [pIds]);
    await pool.query(`DELETE FROM pedidos WHERE id = ANY($1)`, [pIds]);
  }

  // Movimentações de estoque
  await pool.query(`DELETE FROM movimentacoes_estoque WHERE "negocioId" = ANY($1)`, [ids]);

  // Contas a receber (se houver)
  await pool.query(`DELETE FROM contas_receber WHERE "negocioId" = ANY($1)`, [ids]);

  const neg = await pool.query(`DELETE FROM negocios WHERE id = ANY($1)`, [ids]);
  console.log('negócios deletados:', neg.rowCount);
  if (protegidos.length) console.log('negócios desativados (não deletados por referência real):', protegidos.length);
}

main();
