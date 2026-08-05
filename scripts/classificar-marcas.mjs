import 'dotenv/config';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

const SLUG = process.env.SLUG || 'mercado';
const DRY = process.env.DRY === '1';
const USER_AGENT = 'WalkerSalgados-Enriquecimento/1.0 (contato@walkersalgados.com.br)';
const DELAY_MS = 600;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Dicionário de marcas (por nome do produto) — prioriza a correspondência mais longa
const MARCAS = [
  // Alimentos
  'Sadia', 'Perdigão', 'Perdigao', 'Seara', 'Friboi', 'Swift', 'Big Frango', 'Copacol', 'Aurora', 'Bom Frango',
  'Nestlé', 'Nestle', 'Nescau', 'Garoto', 'Lacta', 'Hershey', 'Harald', 'Richester', 'Amori', 'Arcor', 'Dori',
  'Bauducco', 'Piraque', 'Aymore', 'Marilan', 'Adria', 'Visconti', 'Todeschini', 'Dan Top', 'Toddynho', 'Yakult',
  'Camil', 'Urbano', 'Petybon', 'Fortaleza', 'Triunfo', 'Tio Joao', 'Tio João', 'Carioca', 'Dona Benta', 'Zaeli', 'Grano', 'Itaguary', 'Amafil',
  'Lebre', 'Uniao', 'União', 'Arisco', 'Knorr', 'Maggi', 'Hellmann', 'Heinz', 'Quero', 'Predilecta', 'Hemmer', 'Jurema',
  'Batavo', 'Parmalat', 'Piracanjuba', 'Italac', 'Vigor', 'Danone', 'Paulista', 'Ninho', 'Chambinho', 'Frimesa', 'Mococa',
  'Rezende', 'Santa Clara', 'Sao Geraldo', 'São Geraldo', 'Crystal', 'Caxambu', 'Lindoya', 'Blue Vale', 'Panelaco', 'Predileto',
  'Dioka', 'Payol', 'Dikoko', 'Olimpo', 'Santa Sophia', 'Cambara', 'Tupi', 'Floc', 'Kitano', 'Tecnutri', 'Trisanti',
  'Maizena', 'Dona Maria', 'Vitamilho', 'Fermipan', 'Lopes', 'Karaja', 'Dona D', 'Imperato', 'Meu Sabor', 'Regina',
  'Gota', 'Stella Doro', 'Tambau', 'Oderich', 'Damare', 'Algo Bom', 'Culinario Damare', 'Salsitos', 'Delicitos',
  'Mocoto', 'Kelly', 'Carvil', 'Del Vale', 'Maranata', 'Maguary', 'Tina Mix', 'Tomix', 'Bessa', 'Asepxia',
  'Fofitos', 'Quinta do Morgado', 'Orloff', 'Nucita', 'Rica', 'Kess', 'Ana Maria', 'Aviva',
  // Carnes e frios
  'Tulipa', 'Tonho', 'Frangao', 'Dala', 'Languiru', 'Cancao', 'Wilson', 'Confianca', 'Aviva', 'R Minas', 'Milk Pizza',
  // Bebidas
  'Coca-Cola', 'Coca Cola', 'Pepsi', 'Fanta', 'Sprite', 'Antarctica', 'Brahma', 'Skol', 'Itaipava', 'Heineken', 'Schincariol', 'Kaiser', 'Cajuina', 'Kuat',
  'Pitu', 'Pitú', 'Velho Barreiro', 'Ypioca', 'Dreher', 'Montilla', 'Pirassununga', 'Kimimo', 'Maguary',
  // Limpeza
  'Ype', 'Omo', 'Brilhante', 'Ariel', 'Tixan', 'Comfort', 'Downy', 'Assolan', 'Bombril', 'Cif', 'Veja', 'Sapolio', 'Pinho Sol', 'Qboa',
  'Tubarao', 'Dragao', 'Dracol', 'Limpa Facil', 'Limp Bem', 'Vim', 'Clorox', 'Baygon', 'Raquel', 'Ajax', 'Jua', 'Guaiuba',
  'Unolar', 'Uno Lar', 'Lume', 'Flashlimp', 'Brilhus', 'Brilux', 'Esfre Bom', 'Gellus', 'Flowers',
  'Sanremo', 'Serra', 'Feliz', 'Milheiro', 'Viwace', 'Estrelinha', 'Nadir', 'Guarufilme', 'Koretech', 'DML',
  // Higiene e beleza
  'Colgate', 'Sorriso', 'Sensodyne', 'Oral B', 'Nivea', 'Dove', 'Lux', 'Palmolive', 'Protex', 'Mon Bijou', 'Phebo', 'Granado',
  'Huggies', 'Pampers', 'Always', 'Intimus', 'Kotex', 'Sempre Livre', 'Sedal', 'Seda', 'Pantene', 'Elseve', 'Clear', 'Rexona',
  'Gillette', 'Wilkinson', 'Dermacyd', 'Body Splash', 'Bold Homme', 'Xerosa', 'Monange', 'Aline', 'Alyne', 'Bebelo', 'Bebelinho',
  'Bonare', 'Bonavi', 'Bonnave', 'Baruel', 'Even', 'Fatore', 'Francis', 'Herbissimo', 'Jequiti', 'Intimu',
  'Salon Line', 'Salonline', 'Gota Dourado', 'Zero Caspa', 'Gaboardi', 'Cotonetes', 'Rayovac', 'Bic', 'Venus', 'Gilete',
  'Pratik', 'Paloma', 'Pimpo', 'Mimo', 'Pure Folha', 'Minaplast',
  // Diversos
  'Tupperware', 'Conpel', 'Del Chef', 'Fester', 'Thee Bond', 'Aladim', 'Ruah', 'Dubom', 'Maraguape', 'Lirio', 'Siol', 'ABC',
  'Piper', 'Santa Rita', 'Primor', 'Deline', 'Puro Sabor', 'Cavalinho', 'Camarao', 'Gira Sol', 'Halls',
  'Presbarba', 'Prestobarba',
];

function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function marcaPeloNome(nome) {
  const palavrasAlvo = normalizar(nome).split(' ').filter(Boolean);
  let melhor = null;
  let melhorLen = 0;
  for (const marca of MARCAS) {
    const palavrasMarca = normalizar(marca).split(' ').filter(Boolean);
    if (!palavrasMarca.length) continue;
    const n = palavrasMarca.length;
    let encontrou = false;
    for (let i = 0; i <= palavrasAlvo.length - n; i++) {
      if (palavrasAlvo.slice(i, i + n).join(' ') === palavrasMarca.join(' ')) {
        encontrou = true;
        break;
      }
    }
    if (encontrou && n > melhorLen) {
      melhor = marca;
      melhorLen = n;
    }
  }
  return melhor;
}

async function buscarMarcaPorCodigo(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=brands&lc=pt&cc=BR`;
  let tentativas = 0;
  while (tentativas < 3) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.status === 429) {
        tentativas++;
        await new Promise((r) => setTimeout(r, 2000 * tentativas));
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status !== 1 || !data.product?.brands) return null;
      // primeira marca (às vezes vem "A, B, C")
      return data.product.brands.split(',').map((b) => b.trim()).filter(Boolean)[0] || null;
    } catch {
      return null;
    }
  }
  return null;
}

(async () => {
  const neg = await pool.query('SELECT id FROM negocios WHERE slug=$1 AND ativo=true', [SLUG]);
  if (!neg.rows[0]) {
    console.error(`Negócio "${SLUG}" não encontrado.`);
    await pool.end();
    process.exit(1);
  }
  const negocioId = neg.rows[0].id;

  const produtos = await pool.query(
    `SELECT id, nome, "codigoBarras" FROM produtos
     WHERE "negocioId"=$1 AND (marca IS NULL OR marca = '')
     ORDER BY nome`,
    [negocioId],
  );
  console.log(`SLUG=${SLUG} | produtos sem marca: ${produtos.rows.length} | DRY=${DRY ? 'sim' : 'não'}`);

  let viaNome = 0;
  let viaCodigo = 0;
  const semMarca = [];

  for (const p of produtos.rows) {
    // 1) Pelo nome (rápido, sem rede)
    let marca = marcaPeloNome(p.nome);
    if (marca) {
      viaNome++;
    } else if (p.codigoBarras && /^\d{12,14}$/.test(p.codigoBarras)) {
      // 2) Pelo código de barras (Open Food Facts)
      marca = await buscarMarcaPorCodigo(p.codigoBarras);
      if (marca) viaCodigo++;
    }

    if (marca) {
      if (!DRY) {
        await pool.query('UPDATE produtos SET "marca"=$1 WHERE id=$2', [marca.slice(0, 120), p.id]);
      }
      console.log(`[OK] ${p.nome} => ${marca}`);
    } else {
      semMarca.push(p.nome);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log('\n===== RESUMO =====');
  console.log(`Via nome: ${viaNome} | Via código de barras: ${viaCodigo} | Sem marca: ${semMarca.length}`);
  if (semMarca.length) console.log('\nSem marca (exemplos):', semMarca.slice(0, 40).join(' | '));
  if (DRY) console.log('\nMODO DRY — nada foi gravado.');

  await pool.end();
})().catch(async (e) => { console.error('ERRO FATAL:', e.message); await pool.end(); process.exit(1); });
