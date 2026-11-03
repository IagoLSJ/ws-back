import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);

const filled = (col) => `count(*) FILTER (WHERE "${col}" IS NOT NULL AND btrim("${col}"::text) <> '')::int`;

async function main() {
  const negs = await q(
    `SELECT n.id, n.nome,
            count(pr.id)::int total,
            ${filled('ncm')} com_ncm,
            ${filled('cfop')} com_cfop,
            ${filled('csosn')} com_csosn,
            ${filled('cstPis')} com_cstpis,
            count(*) FILTER (WHERE "aliqTributosFederais" IS NOT NULL
                                AND "aliqTributosEstaduais" IS NOT NULL
                                AND "aliqTributosMunicipais" IS NOT NULL
                                AND "fonteTributosAproximados" IS NOT NULL
                                AND "vigenciaTributosAproximados" IS NOT NULL)::int com_ibpt,
            count(*) FILTER (WHERE "categoriaId" IS NULL)::int sem_categoria
     FROM negocios n
     LEFT JOIN produtos pr ON pr."negocioId" = n.id
     GROUP BY n.id, n.nome
     ORDER BY total DESC`
  );

  for (const n of negs) {
    console.log(`\n=== ${n.nome} (${n.id}) ===`);
    console.log(
      `  total=${n.total} | ncm=${n.com_ncm} | cfop=${n.com_cfop} | csosn=${n.com_csosn} | cstPis=${n.com_cstpis} | ibpt_completo=${n.com_ibpt} | sem_categoria=${n.sem_categoria}`
    );

    const cats = await q(
      `SELECT coalesce(c.nome, '(sem categoria)') nm, count(*)::int n,
              count(*) FILTER (WHERE btrim(coalesce(pr.ncm,'')) <> '')::int com_ncm
       FROM produtos pr LEFT JOIN categorias c ON c.id = pr."categoriaId"
       WHERE pr."negocioId" = $1
       GROUP BY 1 ORDER BY 2 DESC`,
      [n.id]
    );
    console.log('  categorias: ' + cats.map((c) => `${c.nm}=${c.n}(ncm:${c.com_ncm})`).join(', '));

    const cfg = await q(
      `SELECT c.regime, c.ambiente, c.ativo, c.cnpj FROM configuracoes_fiscais c WHERE c."negocioId" = $1`,
      [n.id]
    );
    console.log('  fiscal: ' + (cfg.length ? JSON.stringify(cfg[0]) : 'SEM CONFIGURACAO'));
  }

  const semCat = await q(
    `SELECT n.nome negocio, pr.nome
     FROM produtos pr JOIN negocios n ON n.id = pr."negocioId"
     WHERE pr."categoriaId" IS NULL
     ORDER BY random() LIMIT 45`
  );
  console.log('\n=== AMOSTRA sem categoria (45) ===');
  semCat.forEach((r) => console.log(`  [${r.negocio}] ${r.nome}`));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
