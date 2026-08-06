import 'dotenv/config';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

// Base local (origem): usa DATABASE_URL do .env
// Base produção (destino): usa PROD_DATABASE_URL
const LOCAL_URL = process.env.DATABASE_URL;
const PROD_URL = process.env.PROD_DATABASE_URL;
const SLUG = process.env.SLUG || 'mercado';
const DRY = process.env.DRY === '1';

if (!PROD_URL) {
  console.error('Defina PROD_DATABASE_URL com a connection string do banco de produção.');
  process.exit(1);
}

const local = new Pool({ connectionString: LOCAL_URL });
const prod = new Pool({ connectionString: PROD_URL });

async function obterNegocioId(pool, label) {
  const { rows } = await pool.query(
    `SELECT id, nome, slug FROM negocios WHERE slug=$1 OR nome ILIKE $2 ORDER BY ativo DESC LIMIT 1`,
    [SLUG, `%${SLUG}%`],
  );
  if (!rows[0]) {
    console.error(`Negócio "${SLUG}" não encontrado na base ${label}.`);
    await pool.end();
    process.exit(1);
  }
  return rows[0];
}

(async () => {
  const negLocal = await obterNegocioId(local, 'LOCAL');
  const negProd = await obterNegocioId(prod, 'PRODUÇÃO');

  console.log(`Negócio local:  ${negLocal.nome} (${negLocal.id})`);
  console.log(`Negócio produção: ${negProd.nome} (${negProd.id})`);
  console.log(`DRY=${DRY ? 'sim' : 'não'} | SLUG=${SLUG}`);

  // 1) Lê categorias + vínculo de produtos na base local
  const catsLocal = await local.query(
    `SELECT id, nome, descricao, "iconUrl", ordem, ativo
       FROM categorias WHERE "negocioId"=$1 ORDER BY ordem, nome`,
    [negLocal.id],
  );

  const prodsLocal = await local.query(
    `SELECT p."codigoBarras", p.nome, c.nome AS categoria
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p."categoriaId"
      WHERE p."negocioId"=$1 AND p."codigoBarras" IS NOT NULL AND p."categoriaId" IS NOT NULL`,
    [negLocal.id],
  );

  console.log(`\nCategorias locais: ${catsLocal.rows.length}`);
  console.log(`Produtos locais com categoria e código de barras: ${prodsLocal.rows.length}`);

  // 2) Mapa categoria (nome) -> id na produção (cria se não existir)
  const catIdMap = new Map();
  for (const c of catsLocal.rows) {
    const existente = await prod.query(
      `SELECT id FROM categorias WHERE "negocioId"=$1 AND nome=$2`,
      [negProd.id, c.nome],
    );
    if (existente.rows[0]) {
      catIdMap.set(c.nome, existente.rows[0].id);
      continue;
    }
    if (DRY) {
      catIdMap.set(c.nome, 'DRY');
      console.log(`  [dry] criaria categoria: ${c.nome}`);
      continue;
    }
    const novo = await prod.query(
      `INSERT INTO categorias (id, "negocioId", nome, descricao, "iconUrl", ordem, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT ("negocioId", nome) DO UPDATE SET ordem=EXCLUDED.ordem, ativo=EXCLUDED.ativo
       RETURNING id`,
      [randomUUID(), negProd.id, c.nome, c.descricao, c.iconUrl, c.ordem, c.ativo],
    );
    catIdMap.set(c.nome, novo.rows[0].id);
    console.log(`  + categoria criada: ${c.nome}`);
  }

  // 3) Aplica categoria nos produtos de produção casando por código de barras
  const porCategoria = {};
  let atualizados = 0;
  let semMatch = 0;
  const semMatchExemplos = new Set();

  for (const p of prodsLocal.rows) {
    const catId = catIdMap.get(p.categoria);
    if (!catId) continue;

    if (DRY) {
      const existe = await prod.query(
        `SELECT 1 FROM produtos WHERE "negocioId"=$1 AND "codigoBarras"=$2`,
        [negProd.id, p.codigoBarras],
      );
      if (existe.rowCount > 0) {
        atualizados++;
        porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1;
      } else {
        semMatch++;
        if (semMatchExemplos.size < 10) semMatchExemplos.add(`${p.codigoBarras} - ${p.nome}`);
      }
      continue;
    }

    const res = await prod.query(
      `UPDATE produtos SET "categoriaId"=$1
        WHERE "negocioId"=$2 AND "codigoBarras"=$3 AND "categoriaId" IS NULL
        RETURNING id`,
      [catId, negProd.id, p.codigoBarras],
    );
    if (res.rowCount > 0) {
      atualizados++;
      porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1;
    } else {
      semMatch++;
      if (semMatchExemplos.size < 10) semMatchExemplos.add(`${p.codigoBarras} - ${p.nome}`);
    }
  }

  console.log('\n===== RESULTADO =====');
  Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).forEach(([cat, qtd]) => {
    console.log(`${cat}: ${qtd}`);
  });
  console.log(`\nProdutos atualizados: ${atualizados}`);
  console.log(`Sem match na produção (produto não existe ou já tem categoria): ${semMatch}`);
  if (semMatchExemplos.size) {
    console.log('Exemplos sem match:', [...semMatchExemplos].join(' | '));
  }
  if (DRY) console.log('\nMODO DRY — nada foi gravado.');

  await local.end();
  await prod.end();
})().catch(async (e) => {
  console.error('ERRO FATAL:', e.message);
  await local.end();
  await prod.end();
  process.exit(1);
});
