/**
 * Importador em massa de imagens de produtos usando Open Food Facts (Brasil).
 *
 * Uso:
 *   npm run imagens:importar -- <slugOuIdDoNegocio> [--limite N] [--delay MS]
 *
 * O script:
 *   1. Busca produtos do negócio SEM imagem.
 *   2. Tenta achar a foto pelo código de barras (EAN) no Open Food Facts.
 *   3. Se não achar (ou não houver EAN), busca pelo NOME do produto.
 *   4. Baixa a foto da frente do produto e sobe no Supabase Storage.
 *   5. Vincula em imagens_produto (principal = true).
 */
import 'dotenv/config';
import { Pool } from 'pg';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = 'walker-salgados-pos/1.0 (imagens de catalogo)';

async function fetchJson(url: string): Promise<any | null> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) return null;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) return null;
  return res.json();
}

async function imagemPorCodigo(codigo: string): Promise<string | null> {
  const data = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${codigo}.json`);
  return data?.product?.image_front_url || data?.product?.image_url || null;
}

async function imagemPorNome(nome: string): Promise<string | null> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(nome)}&search_simple=1&action=process&json=1&fields=image_front_url,image_url&page_size=1`;
  const data = await fetchJson(url);
  const p = data?.products?.[0];
  return p?.image_front_url || p?.image_url || null;
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args[0];
  let limite = Infinity;
  let msDelay = 1500;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limite') limite = parseInt(args[i + 1], 10) || Infinity;
    if (args[i] === '--delay') msDelay = parseInt(args[i + 1], 10) || 1500;
  }

  if (!slug) {
    console.error('Uso: npm run imagens:importar -- <slugOuIdDoNegocio> [--limite N] [--delay MS]');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });

  const bucket = process.env.SUPABASE_BUCKET || process.env.MINIO_BUCKET || 'multinegocio';
  const endpoint = process.env.SUPABASE_S3_ENDPOINT || process.env.MINIO_ENDPOINT_URL || '';
  const region = process.env.SUPABASE_S3_REGION || process.env.MINIO_REGION || 'us-east-1';
  const projectUrl = process.env.SUPABASE_URL || '';
  const publicUrlBase = `${projectUrl}/storage/v1/object/public/${bucket}`;

  const s3 = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || '',
      secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || '',
    },
    forcePathStyle: true,
  });

  const negocio = await pool.query(
    `SELECT id FROM negocios WHERE slug = $1 OR id = $1`,
    [slug],
  );
  const negocioId = negocio.rows[0]?.id;
  if (!negocioId) {
    console.error('Negócio não encontrado:', slug);
    await pool.end();
    process.exit(1);
  }

  const { rows: produtos } = await pool.query(
    `SELECT p.id, p.nome, p."codigoBarras"
     FROM produtos p
     WHERE p."negocioId" = $1
       AND NOT EXISTS (SELECT 1 FROM imagens_produto ip WHERE ip."produtoId" = p.id)
     ORDER BY p.nome`,
    [negocioId],
  );

  const comEan = produtos.filter((p) => p.codigoBarras);
  const semEan = produtos.filter((p) => !p.codigoBarras);
  console.log(`Negócio ${negocioId} | ${produtos.length} produtos sem imagem (${comEan.length} com EAN, ${semEan.length} sem EAN)`);

  let ok = 0;
  let porNome = 0;
  let naoEncontrado = 0;
  let erro = 0;
  let processados = 0;

  for (const p of produtos) {
    if (processados >= limite) break;
    processados++;

    try {
      let imgUrl: string | null = null;
      if (p.codigoBarras) {
        const codigo = p.codigoBarras.replace(/\D/g, '');
        imgUrl = await imagemPorCodigo(codigo);
      }

      if (!imgUrl) {
        const nomeCurto = p.nome.split(',').pop()?.trim() || p.nome;
        imgUrl = await imagemPorNome(nomeCurto.length > 40 ? nomeCurto.slice(0, 40) : nomeCurto);
        if (imgUrl) porNome++;
      }

      if (!imgUrl) {
        naoEncontrado++;
        console.log(`✗ sem imagem na base: ${p.nome}`);
        await delay(msDelay);
        continue;
      }

      const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(20000) });
      if (!imgRes.ok) throw new Error(`download falhou ${imgRes.status}`);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const ext = imgUrl.split('.').pop()?.toLowerCase().match(/[a-z0-9]+/)?.[0] || 'jpg';
      const key = `produtos/${negocioId}/${p.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        }),
      );

      await pool.query(
        `INSERT INTO imagens_produto (id, "produtoId", url, ordem, principal)
         VALUES (gen_random_uuid(), $1, $2, 0, true)
         ON CONFLICT DO NOTHING`,
        [p.id, `${publicUrlBase}/${key}`],
      );

      ok++;
      console.log(`✔ ${ok} ${p.nome} (${imgUrl})`);
    } catch (e: any) {
      erro++;
      console.log(`✗ erro ${p.nome}: ${e?.message}`);
    }

    await delay(msDelay);
  }

  console.log(`\n=== Resumo ===\nImportadas: ${ok} (${porNome} por nome) | Não encontradas: ${naoEncontrado} | Erros: ${erro} | Processados: ${processados}`);
  await pool.end();
  s3.destroy();
}

main();
