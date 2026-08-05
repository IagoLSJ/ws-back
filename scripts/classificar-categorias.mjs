import 'dotenv/config';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

const SLUG = process.env.SLUG || 'mercado';
const DRY = process.env.DRY === '1';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Dicionário de categorias por palavras-chave (nome do produto)
const DICIONARIO = [
  { categoria: 'Bebidas', palavras: ['agua', 'suco', 'refrigerante', 'coca-cola', 'coca cola', 'coca', 'sprite', 'fanta', 'pepsi', 'guarana', 'guaraná', 'cajuina', 'energetico', 'isotonic', 'bebida', 'nectar', 'toddynho', 'danone', 'yakult', 'achocolatado', 'nescau', 'toddy', 'cappuccino', 'milk shake', 'milkshake'] },
  { categoria: 'Bebidas Alcoólicas', palavras: ['cerveja', 'vinho', 'whisky', 'whiskey', 'cachaca', 'cachaça', 'aguardente', 'espumante', 'licor', 'vodka', 'conhaque', 'gin', 'pitú', 'pitu'] },
  { categoria: 'Água', palavras: ['agua', 'água', 'mineral', 'gasosa', 'gelo'] },
  { categoria: 'Cafés e Chás', palavras: ['cafe', 'café', 'cha', 'chá', 'mate'] },
  { categoria: 'Açúcares e Adoçantes', palavras: ['acucar', 'açúcar', 'adocante', 'adoçante', 'mel'] },
  { categoria: 'Doces e Biscoitos', palavras: ['chocolate', 'biscoito', 'bolacha', 'bala', 'pirulito', 'chiclete', 'wafer', 'confeito', 'granulado', 'doce', 'gelatina', 'pudim', 'bolo', 'bolinho', 'goiabada', 'pacoca', 'paçoca', 'amendoim', 'tortinha', 'amori', 'garoto', 'lacta', 'hershey', 'harald', 'mms', 'kitkat', 'chokito', 'cocada'] },
  { categoria: 'Mercearia', palavras: ['arroz', 'feijao', 'feijão', 'macarrao', 'macarrão', 'massa', 'oleo', 'óleo', 'azeite', 'sal', 'molho', 'extrato', 'tempero', 'condimento', 'vinagre', 'maionese', 'mostarda', 'ketchup', 'catchup', 'conserva', 'enlatado', 'atum', 'sardinha', 'milho', 'ervilha', 'palmito', 'farinha', 'amido', 'fuba', 'fubá', 'polenta', 'aveia', 'granola', 'cereal', 'lentilha', 'grao', 'grão', 'caldo', 'azeitona', 'barbecue', 'champignon', 'canela', 'coloral', 'colorau', 'colorau'] },
  { categoria: 'Carnes e Frios', palavras: ['carne', 'frango', 'pernil', 'linguica', 'linguiça', 'bacon', 'presunto', 'mortadela', 'salame', 'hamburguer', 'hambúrguer', 'salsicha', 'nugget', 'peito', 'coxa', 'file', 'filé', 'sadia', 'perdigao', 'perdigão', 'rezende', 'bisteca', 'aurora'] },
  { categoria: 'Laticínios', palavras: ['queijo', 'mussarela', 'muzzarella', 'iogurte', 'leite', 'manteiga', 'margarina', 'requeijao', 'requeijão', 'creme de leite', 'nata'] },
  { categoria: 'Congelados', palavras: ['congelado', 'sorvete', 'picole', 'picolé', 'massa congelada', 'pizza congelada'] },
  { categoria: 'Padaria', palavras: ['pao', 'pão', 'bisnaga', 'torrada', 'mistura', 'farinha de rosca'] },
  { categoria: 'Frutas e Hortifrúti', palavras: ['banana', 'maca', 'maçã', 'laranja', 'limao', 'limão', 'alho', 'cebola', 'batata', 'tomate', 'cenoura', 'alface', 'couve', 'abacaxi', 'melancia', 'manga', 'uva', 'morango', 'verdura', 'legume', 'fruta', 'horta', 'mandioca', 'inhame', 'abobora', 'abóbora'] },
  { categoria: 'Higiene Pessoal', palavras: ['sabonete', 'shampoo', 'xampu', 'condicionador', 'creme dental', 'pasta de dente', 'desodorante', 'absorvente', 'fralda', 'papel higienico', 'papel higiênico', 'algodao', 'algodão', 'cotonete', 'contonete', 'escova', 'enxaguante', 'hidratacao', 'hidratação', 'cachos', 'crescimento', 'fortalecedor', 'loiros', 'liso', 'bebe', 'capilar', 'cosmetico', 'always', 'intimus', 'body splash', 'bodysplash', 'xerosa', 'bold homme', 'perfume', 'colgate'] },
  { categoria: 'Limpeza', palavras: ['detergente', 'sabao', 'sabão', 'agua sanitaria', 'água sanitária', 'desinfetante', 'amaciante', 'amarciante', 'limpador', 'esponja', 'multiuso', 'cera', 'lustra', 'sapolio', 'alvejante', 'tira manchas', 'alcool', 'álcool', 'tupiniquim', 'baygon', 'inseticida', 'aroma', 'cif', 'cloro', 'vim', 'vidros', 'aditivo', 'casa limpa'] },
  { categoria: 'Utilidades Domésticas', palavras: ['saco', 'luva', 'fosforo', 'fósforo', 'pilha', 'copo', 'prato', 'saladeira', 'toalha', 'vassoura', 'rodo', 'pano', 'guardanapo', 'tampa', 'pote', 'frigideira', 'panela', 'tábua', 'caixa de pizza', 'embalagem', 'bobina', 'coador', 'colher', 'descartavel', 'caixa'] },
  { categoria: 'Pet', palavras: ['racao', 'ração', 'petisco', 'cachorro', 'gato', 'areia sanit'] },
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

function classificar(nome) {
  const alvo = normalizar(nome);
  let melhor = null;
  let melhorLen = 0;
  for (const grupo of DICIONARIO) {
    for (const palavra of grupo.palavras) {
      const p = normalizar(palavra);
      if (p && alvo.includes(p) && p.length > melhorLen) {
        melhor = grupo.categoria;
        melhorLen = p.length;
      }
    }
  }
  return melhor;
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

(async () => {
  const neg = await pool.query('SELECT id, nome FROM negocios WHERE slug=$1 AND ativo=true', [SLUG]);
  if (!neg.rows[0]) {
    console.error(`Negócio "${SLUG}" não encontrado.`);
    await pool.end();
    process.exit(1);
  }
  const negocioId = neg.rows[0].id;

  const produtos = await pool.query(
    'SELECT id, nome, "categoriaId" FROM produtos WHERE "negocioId"=$1 ORDER BY nome',
    [negocioId],
  );

  console.log(`SLUG=${SLUG} | produtos: ${produtos.rows.length} | DRY=${DRY ? 'sim' : 'não'}`);

  let classificados = 0;
  const porCategoria = {};
  const semCategoria = [];

  for (const p of produtos.rows) {
    const cat = p.categoriaId ? null : classificar(p.nome);
    if (cat) {
      const catId = await obterOuCriarCategoria(negocioId, cat);
      if (catId || DRY) {
        if (!DRY && catId) await pool.query('UPDATE produtos SET "categoriaId"=$1 WHERE id=$2', [catId, p.id]);
        classificados++;
        porCategoria[cat] = (porCategoria[cat] || 0) + 1;
      }
    } else {
      semCategoria.push(p.nome);
    }
  }

  console.log('\n===== CATEGORIAS ATRIBUÍDAS =====');
  Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).forEach(([cat, qtd]) => {
    console.log(`${cat}: ${qtd}`);
  });
  console.log(`\nClassificados: ${classificados} | Sem categoria: ${semCategoria.length}`);
  if (semCategoria.length) {
    console.log('\nSem categoria (exemplos):', semCategoria.slice(0, 40).join(' | '));
  }
  if (DRY) console.log('\nMODO DRY — nada foi gravado.');

  await pool.end();
})().catch(async (e) => { console.error('ERRO FATAL:', e.message); await pool.end(); process.exit(1); });
