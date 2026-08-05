/**
 * Importador em massa de imagens de produtos usando a busca do Mercado Livre.
 *
 * ⚠️ As imagens pertencem aos anunciantes do Mercado Livre. Usar fora da
 * plataforma pode violar os termos de uso — risco do seu acesso ser bloqueado.
 *
 * Uso:
 *   npm run imagens:ml -- <slugOuIdDoNegocio> [--limite N] [--delay MS]
 */
import 'dotenv/config';
import { Pool } from 'pg';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const slug = args[0];
  let limite = Infinity;
  let msDelay = 1200;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limite') limite = parseInt(args[i + 1], 10) || Infinity;
    if (args[i] === '--delay') msDelay = parseInt(args[i + 1], 10) || 1200;
  }

  if (!slug) {
    console.error('Uso: npm run imagens:ml -- <slugOuIdDoNegocio> [--limite N] [--delay MS]');
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

  const negocio = await pool.query(`SELECT id FROM negocios WHERE slug = $1 OR id = $1`, [slug]);
  const negocioId = negocio.rows[0]?.id;
  if (!negocioId) {
    console.error('Negócio não encontrado:', slug);
    await pool.end();
    process.exit(1);
  }

  // Token OAuth do Mercado Livre (salvo pelo fluxo de conexão)
  const integ = await pool.query(
    `SELECT "accessToken", "refreshToken", "expiresAt" FROM integracoes_mercadolivre WHERE "negocioId" = $1`,
    [negocioId],
  );
  const token = integ.rows[0]?.accessToken;
  if (!token) {
    console.error('Mercado Livre não conectado. Conecte em Configurações > Mercado Livre primeiro.');
    await pool.end();
    process.exit(1);
  }

  const { rows: produtos } = await pool.query(
    `SELECT p.id, p.nome
     FROM produtos p
     WHERE p."negocioId" = $1
       AND NOT EXISTS (SELECT 1 FROM imagens_produto ip WHERE ip."produtoId" = p.id)
     ORDER BY p.nome`,
    [negocioId],
  );

  console.log(`Negócio ${negocioId} | ${produtos.length} produtos sem imagem`);

  let ok = 0;
  let naoEncontrado = 0;
  let erro = 0;
  let processados = 0;

  for (const p of produtos) {
    if (processados >= limite) break;
    processados++;

    try {
      // Busca no Mercado Livre pelo nome do produto (autenticado)
      const q = p.nome.length > 60 ? p.nome.slice(0, 60) : p.nome;
      const res = await fetch(
        `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=1`,
        {
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) throw new Error(`ML HTTP ${res.status}`);
      const data = await res.json();
      const imgUrl = data?.results?.[0]?.secure_thumbnail || data?.results?.[0]?.thumbnail;

      if (!imgUrl) {
        naoEncontrado++;
        console.log(`✗ sem imagem no ML: ${p.nome}`);
        await delay(msDelay);
        continue;
      }

      // Tenta pegar uma versão maior trocando a extensão/qualidade
      const maior = imgUrl
        .replace(/\.webp$/i, '.jpg')
        .replace(/^http:\/\//, 'https://');

      const imgRes = await fetch(maior, { signal: AbortSignal.timeout(20000) });
      if (!imgRes.ok) throw new Error(`download falhou ${imgRes.status}`);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const ext = 'jpg';
      const key = `produtos/${negocioId}/${p.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: 'image/jpeg',
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

  console.log(`\n=== Resumo ===\nImportadas: ${ok} | Não encontradas: ${naoEncontrado} | Erros: ${erro} | Processados: ${processados}`);
  await pool.end();
  s3.destroy();
}

main();
