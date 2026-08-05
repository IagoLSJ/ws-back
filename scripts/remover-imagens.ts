import 'dotenv/config';
import { Pool } from 'pg';
import {
  S3Client,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });
  const bucket = process.env.SUPABASE_BUCKET || process.env.MINIO_BUCKET || 'multinegocio';
  const endpoint = process.env.SUPABASE_S3_ENDPOINT || process.env.MINIO_ENDPOINT_URL || '';
  const region = process.env.SUPABASE_S3_REGION || process.env.MINIO_REGION || 'us-east-1';

  const s3 = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || '',
      secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || '',
    },
    forcePathStyle: true,
  });

  const projectUrl = process.env.SUPABASE_URL || '';
  const publicUrlBase = `${projectUrl}/storage/v1/object/public/${bucket}`;

  // Busca todas as imagens importadas pelo script (nas chaves produtos/...)
  const { rows } = await pool.query(
    `SELECT ip.id, ip.url, ip."produtoId"
     FROM imagens_produto ip
     WHERE ip.url LIKE $1`,
    [`${publicUrlBase}/produtos/%`],
  );
  console.log('imagens vinculadas encontradas:', rows.length);

  let ok = 0;
  let erro = 0;
  for (const img of rows) {
    const key = img.url.slice(publicUrlBase.length + 1);
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      await pool.query(`DELETE FROM imagens_produto WHERE id = $1`, [img.id]);
      ok++;
    } catch (e: any) {
      erro++;
      console.log('erro ao remover', img.id, e?.message);
    }
  }

  console.log(`removidas: ${ok} | erros: ${erro}`);
  await pool.end();
  s3.destroy();
}

main();
