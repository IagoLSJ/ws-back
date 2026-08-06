import 'dotenv/config';
import { Pool } from 'pg';

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

(async () => {
  const negLocal = (await local.query(
    `SELECT id, nome FROM negocios WHERE slug=$1 OR nome ILIKE $2 ORDER BY ativo DESC LIMIT 1`,
    [SLUG, `%${SLUG}%`],
  )).rows[0];
  const negProd = (await prod.query(
    `SELECT id, nome FROM negocios WHERE slug=$1 OR nome ILIKE $2 ORDER BY ativo DESC LIMIT 1`,
    [SLUG, `%${SLUG}%`],
  )).rows[0];

  if (!negLocal) { console.error(`Negócio "${SLUG}" não encontrado na base LOCAL.`); process.exit(1); }
  if (!negProd) { console.error(`Negócio "${SLUG}" não encontrado na base PRODUÇÃO.`); process.exit(1); }

  console.log(`Negócio local:   ${negLocal.nome} (${negLocal.id})`);
  console.log(`Negócio produção: ${negProd.nome} (${negProd.id})`);
  console.log(`DRY=${DRY ? 'sim' : 'não'} | SLUG=${SLUG}`);

  // Lê local: produtos com marca e código de barras
  const prods = (await local.query(
    `SELECT "codigoBarras", nome, marca FROM produtos
      WHERE "negocioId"=$1
        AND "codigoBarras" IS NOT NULL
        AND marca IS NOT NULL AND marca <> ''
      ORDER BY nome`,
    [negLocal.id],
  )).rows;

  console.log(`\nProdutos locais com marca + código de barras: ${prods.length}`);

  const porMarca = {};
  let atualizados = 0;
  let semMatch = 0;
  const semMatchExemplos = new Set();

  for (const p of prods) {
    if (DRY) {
      const existe = await prod.query(
        `SELECT marca FROM produtos WHERE "negocioId"=$1 AND "codigoBarras"=$2`,
        [negProd.id, p.codigoBarras],
      );
      if (existe.rowCount > 0) {
        atualizados++;
        porMarca[p.marca] = (porMarca[p.marca] || 0) + 1;
      } else {
        semMatch++;
        if (semMatchExemplos.size < 10) semMatchExemplos.add(`${p.codigoBarras} - ${p.nome}`);
      }
      continue;
    }

    const res = await prod.query(
      `UPDATE produtos SET marca=$1
        WHERE "negocioId"=$2 AND "codigoBarras"=$3
          AND (marca IS NULL OR marca = '')
        RETURNING id`,
      [p.marca.slice(0, 120), negProd.id, p.codigoBarras],
    );
    if (res.rowCount > 0) {
      atualizados++;
      porMarca[p.marca] = (porMarca[p.marca] || 0) + 1;
    } else {
      semMatch++;
      if (semMatchExemplos.size < 10) semMatchExemplos.add(`${p.codigoBarras} - ${p.nome}`);
    }
  }

  console.log('\n===== RESULTADO =====');
  const top = Object.entries(porMarca).sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [marca, qtd] of top) console.log(`${marca}: ${qtd}`);
  if (top.length < Object.keys(porMarca).length) console.log(`... e mais ${Object.keys(porMarca).length - top.length} marcas`);
  console.log(`\nProdutos com marca aplicada: ${atualizados}`);
  console.log(`Sem match na produção (produto não existe ou já tem marca): ${semMatch}`);
  if (semMatchExemplos.size) console.log('Exemplos sem match:', [...semMatchExemplos].join(' | '));
  if (DRY) console.log('\nMODO DRY — nada foi gravado.');

  await local.end();
  await prod.end();
})().catch(async (e) => {
  console.error('ERRO FATAL:', e.message);
  await local.end();
  await prod.end();
  process.exit(1);
});
