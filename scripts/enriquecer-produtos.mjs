import 'dotenv/config';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

const SLUG = process.env.SLUG || 'mercado';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const DRY = process.env.DRY === '1';
const DELAY_MS = 600;

const USER_AGENT = 'WalkerSalgados-Enriquecimento/1.0 (contato@walkersalgados.com.br)';

const CAT_PT = {
  beverages: 'Bebidas',
  'soft-drinks': 'Refrigerantes',
  'alcoholic-beverages': 'Bebidas Alcoólicas',
  'coffees': 'Cafés',
  teas: 'Chás',
  dairy: 'Laticínios',
  'milk-and-plant-milk': 'Leite',
  cheeses: 'Queijos',
  eggs: 'Ovos',
  'sweet-snacks': 'Doces e Snacks',
  'sugary-snacks': 'Doces',
  chocolates: 'Chocolates',
  desserts: 'Sobremesas',
  'jams-and-spreads': 'Geleias e Pastas',
  breakfasts: 'Café da Manhã',
  breads: 'Pães',
  cereals: 'Cereais',
  'cereals-and-potatoes': 'Cereais e Batatas',
  groceries: 'Mercearia',
  'pasta-and-rice': 'Massas e Arroz',
  'canned-foods': 'Conservas',
  'frozen-foods': 'Congelados',
  'fruits-and-vegetables': 'Frutas e Legumes',
  meats: 'Carnes',
  fish: 'Peixes',
  'salted-snacks': 'Salgadinhos',
  baking: 'Padaria',
  condiments: 'Condimentos',
  sauces: 'Molhos',
  seasonings: 'Temperos',
  'oils-and-fats': 'Óleos e Gorduras',
  'plant-based-foods': 'Alimentos Vegetais',
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const s3 = new S3Client({
  endpoint: process.env.SUPABASE_S3_ENDPOINT || process.env.MINIO_ENDPOINT_URL,
  region: process.env.SUPABASE_S3_REGION || process.env.MINIO_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY || process.env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});
const bucket = process.env.SUPABASE_BUCKET || process.env.MINIO_BUCKET || 'multinegocio';
const publicUrlBase = `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}`;

function humanizar(nome) {
  return nome
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function categoriaPrincipal(tags) {
  if (!Array.isArray(tags) || !tags.length) return null;
  const pt = tags.find((t) => t.startsWith('pt:'));
  if (pt) {
    const parte = pt.split(':').slice(1).filter(Boolean)[0];
    return parte ? humanizar(parte) : null;
  }
  const en = tags.find((t) => t.startsWith('en:'));
  if (en) {
    const segmento = en.split(':').slice(1).filter(Boolean)[0] || '';
    let melhorValor = null;
    let melhorLen = 0;
    for (const [chave, valor] of Object.entries(CAT_PT)) {
      if (segmento.startsWith(chave) && chave.length > melhorLen) {
        melhorLen = chave.length;
        melhorValor = valor;
      }
    }
    if (melhorValor) return melhorValor;
    return segmento ? humanizar(segmento) : null;
  }
  return null;
}

async function buscarOpenFoodFacts(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,categories_tags,image_front_url&lc=pt&cc=BR`;
  let tentativas = 0;
  while (tentativas < 3) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.status === 429) {
      tentativas++;
      const espera = 2000 * tentativas;
      console.log(`  [429] aguardando ${espera / 1000}s...`);
      await new Promise((r) => setTimeout(r, espera));
      continue;
    }
    if (!res.ok) return null;
    return await res.json();
  }
  return null;
}

const cacheCategorias = new Map();
async function obterOuCriarCategoria(negocioId, nome) {
  const chave = `${negocioId}::${nome.toLowerCase()}`;
  if (cacheCategorias.has(chave)) return cacheCategorias.get(chave);
  let row = await pool.query('SELECT id FROM categorias WHERE "negocioId"=$1 AND "nome"=$2', [negocioId, nome]);
  if (!row.rows[0]) {
    if (DRY) return null;
    row = await pool.query(
      'INSERT INTO categorias (id, "negocioId", "nome") VALUES ($1,$2,$3) ON CONFLICT ("negocioId","nome") DO NOTHING RETURNING id',
      [randomUUID(), negocioId, nome],
    );
  }
  const id = row.rows[0]?.id || null;
  cacheCategorias.set(chave, id);
  return id;
}

async function baixarImagem(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return null;
  return buf;
}

async function enviarParaStorage(buffer, negocioId, produtoId) {
  const key = `produtos/${negocioId}/${produtoId}/${randomUUID()}.jpg`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: 'image/jpeg' }));
  return `${publicUrlBase}/${key}`;
}

async function processar(barcode, produto) {
  const data = await buscarOpenFoodFacts(barcode);
  if (!data) return { ok: false, motivo: 'não encontrado' };
  if (data.status !== 1) return { ok: false, motivo: 'não encontrado' };

  const p = data.product;
  const updates = [];

  if (p.brands && !produto.marca) {
    updates.push(pool.query('UPDATE produtos SET "marca"=$1 WHERE id=$2', [p.brands.slice(0, 120), produto.id]));
  }

  const cat = categoriaPrincipal(p.categories_tags);
  if (cat && !produto.categoriaId) {
    const catId = await obterOuCriarCategoria(produto.negocioId, cat);
    if (catId) updates.push(pool.query('UPDATE produtos SET "categoriaId"=$1 WHERE id=$2', [catId, produto.id]));
  }

  let imagemUrl = null;
  if (p.image_front_url && !produto.temImagem) {
    if (DRY) {
      imagemUrl = p.image_front_url;
    } else {
      const buf = await baixarImagem(p.image_front_url);
      if (buf) {
        imagemUrl = await enviarParaStorage(buf, produto.negocioId, produto.id);
        updates.push(pool.query('DELETE FROM imagens_produto WHERE "produtoId"=$1', [produto.id]));
        updates.push(pool.query(
          'INSERT INTO imagens_produto (id, "produtoId", url, ordem, principal) VALUES ($1,$2,$3,0,true)',
          [randomUUID(), produto.id, imagemUrl],
        ));
      }
    }
  }

  if (!DRY) await Promise.all(updates);
  return { ok: true, marca: p.brands || null, categoria: cat, imagem: imagemUrl || null };
}

(async () => {
  console.log(`SLUG=${SLUG} | LIMIT=${LIMIT ?? 'todos'} | DRY=${DRY ? 'sim' : 'não'}`);

  const neg = await pool.query('SELECT id, nome FROM negocios WHERE slug=$1 AND ativo=true', [SLUG]);
  if (!neg.rows[0]) {
    console.error(`Negócio "${SLUG}" não encontrado.`);
    await pool.end();
    process.exit(1);
  }
  const negocioId = neg.rows[0].id;

  const q = await pool.query(
    `SELECT p.id, p.nome, p.marca, p."categoriaId", p."codigoBarras", p."negocioId",
       EXISTS(SELECT 1 FROM imagens_produto ip WHERE ip."produtoId"=p.id) AS "temImagem"
     FROM produtos p
     WHERE p."negocioId"=$1
       AND p."codigoBarras" IS NOT NULL
       AND length(regexp_replace(p."codigoBarras", '[^0-9]', '', 'g')) >= 12
     ORDER BY p.nome`,
    [negocioId],
  );
  let produtos = q.rows;
  if (LIMIT) produtos = produtos.slice(0, LIMIT);

  console.log(`Produtos com código de barras: ${q.rows.length} | processando: ${produtos.length}`);

  let okCount = 0;
  let comMarca = 0;
  let comCategoria = 0;
  let comImagem = 0;
  let falhas = 0;

  for (const produto of produtos) {
    const barcode = produto.codigoBarras.replace(/[^0-9]/g, '');
    try {
      const r = await processar(barcode, produto);
      if (r.ok) {
        okCount++;
        if (r.marca) comMarca++;
        if (r.categoria) comCategoria++;
        if (r.imagem) comImagem++;
        console.log(`[OK] ${produto.nome} -> marca:${r.marca || '-'} | cat:${r.categoria || '-'} | img:${r.imagem ? 'sim' : 'não'}`);
      } else {
        falhas++;
        console.log(`[-] ${produto.nome} (${barcode}) -> ${r.motivo}`);
      }
    } catch (e) {
      falhas++;
      console.log(`[ERRO] ${produto.nome} (${barcode}) -> ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log('\n===== RESUMO =====');
  console.log(`Encontrados: ${okCount} | Falhas: ${falhas}`);
  console.log(`Com marca: ${comMarca} | Com categoria: ${comCategoria} | Com imagem: ${comImagem}`);
  if (DRY) console.log('MODO DRY — nada foi gravado no banco.');

  await pool.end();
  await s3.destroy();
})().catch(async (e) => {
  console.error('ERRO FATAL:', e.message);
  await pool.end();
  process.exit(1);
});
