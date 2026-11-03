import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const APPLY = process.env.APPLY === '1';
const AUDIT = process.env.AUDIT === '1';
const UF = (process.env.UF || 'CE').toUpperCase();
const NEGOCIO_ID = process.env.NEGOCIO_ID || 'b564f8a0-13a3-4952-b885-6d8ee3210f27';
const TABELA_ANO = process.env.IBPT_ANO || '2026';
const TABELA_VERSAO = process.env.IBPT_VERSAO || '26.2.B';

const CFOP = process.env.CFOP || '5102';
const CSOSN = process.env.CSOSN || '102';
const CST_PIS = process.env.CST_PIS || '06';
const CST_COFINS = process.env.CST_COFINS || '06';
const ORIGEM = process.env.ORIGEM || '0';

const FONTE_IBPT = `IBPT/TabelaIBPTax ${TABELA_VERSAO}`;
const CACHE_IBPT = `scripts/.cache-ibpt-${UF.toLowerCase()}.json`;
const IBPT_URL = `https://ibpt.valraw.com.br/api/${TABELA_ANO}/${TABELA_VERSAO}/ncm/${UF}.json.gz`;

const LIXO = [
  /^https?:\/\//i,
  /^pdv\s/i,
  /^offline pdv/i,
  /^qz teste/i,
  /^produto crud\s*\d+/i,
  /^produto teste\s/i,
  /^teste\s/i,
  /^[\d\s.,-]+$/,
  /^$/,
];

const REGRAS = [
  { ncm: '28281000', termos: ['agua oxigenada'] },
  { ncm: '38089419', termos: ['agua sanitaria', 'soda caustica', 'cloro', 'desinfetante', 'pinho sol'] },
  { ncm: '30066000', termos: ['alcool 70', 'alcool liquido', 'alcool gel', 'alcool antisseptico', 'tupiniquim'] },

  { ncm: '34013000', termos: ['lava roupas', 'lavar roupa', 'lava roupa', 'uno lar', 'sabao em po', 'sabao empo'] },
  { ncm: '34011900', termos: ['sabonete', 'sabao', 'palmolive', 'dermacyd', 'dermacyde', 'dermacide', 'protex', 'francis', 'lux'] },
  { ncm: '34029039', termos: ['detergente', 'lava loucas', 'lava louca', 'lavar loucas', 'lavar louca'] },
  { ncm: '34029090', termos: ['amaciante', 'downy', 'amarciante', 'desengordurante', 'multiuso', 'limpa vidro', 'limpa-vidro', 'casa limpa', 'desengrasante', 'cif', 'veja', 'lustra moveis', 'lustra-moveis', 'peroba', 'aroma baunilha', 'odorizante', 'pedra sanitaria', 'limpador'] },
  { ncm: '38089199', termos: ['inseticida', 'baygon', 'ariane', 'mosquicida', 'mosquito', 'barreira'] },
  { ncm: '38089996', termos: ['raticida'] },
  { ncm: '40169100', termos: ['esponja'] },
  { ncm: '96031000', termos: ['vassoura', 'rodo', 'pa de lixo'] },

  { ncm: '33051000', termos: ['shampoo', 'shampo'] },
  { ncm: '33049910', termos: ['loeicao', 'locao', 'loeao', 'serum corporal', 'hidratante', 'pomada', 'essecia', 'essencia', 'oleo milagroso', 'fisio fort', 'bonavi'] },
  { ncm: '33072090', termos: ['desodorante', 'rexona', 'secret', 'buff body', 'body splash', 'body eplash', 'deo colonia', 'dove', '72h', '72 h'] },
  { ncm: '96032100', termos: ['escova de dente', 'escova dente', 'escova dental'] },
  { ncm: '96032900', termos: ['escova', 'escolva'] },
  { ncm: '96033000', termos: ['contonete'] },
  { ncm: '33059000', termos: ['condicionador', 'creme capilar', 'creme de pentear', 'mascara', 'masquara', 'tratamento capilar', 'tratamento elseve', 'hidratante capilar', 'ativador', 'fortalecedor', 'reparador', 'leave in', 'spray capilar', 'tinta para cabelo', 'relaxante', 'alinhador', 'firmador', 'zerocal', 'zero caspa', 'aline', 'alyne', 'monange', 'herbissim', 'pantene', 'elseve', 'kit capilar', 'kit cabelo', 'tonico capilar'] },
  { ncm: '33061000', termos: ['creme dental', 'dentifrico', 'colgate', 'oral b', 'oral-b', 'enxaguante bucal', 'fio dental', 'linha dental'] },
  { ncm: '33030010', termos: ['perfume'] },
  { ncm: '33030020', termos: ['colonia'] },
  { ncm: '96190000', termos: ['absorvente', 'absoervente', 'protetor diarios', 'always', 'fralda', 'abs'] },
  { ncm: '48181000', termos: ['papel higienico', 'papel hig'] },
  { ncm: '52010090', termos: ['algodao'] },
  { ncm: '82121020', termos: ['gilete', 'venus', 'prestobarba', 'pretobarba', 'navalha'] },
  { ncm: '96040000', termos: ['loca de porco', 'pedra pomes'] },

  { ncm: '02091019', termos: ['bacon'] },
  { ncm: '02023000', termos: ['bisteca', 'costela', 'coatele', 'coatela', 'pernil', 'paleta suina', 'sobre paleta', 'maminha'] },
  { ncm: '02071100', termos: ['frango', 'pinto', 'asa de frango', 'coxa', 'sobrecoxa', 'peito de frango', 'file de frango', 'coxinha daasa', 'coxinha da asa'] },
  { ncm: '16023900', termos: ['hamburguer', 'carne moida', 'linguica', 'mortadela', 'mortandela', 'presunto', 'lanche', 'empanado', 'salsicha', 'hot dog', 'carne de sol', 'mine salgados'] },
  { ncm: '03048990', termos: ['file de peixe', 'panga'] },
  { ncm: '16041400', termos: ['atum'] },
  { ncm: '16041310', termos: ['sardinha'] },

  { ncm: '39269090', termos: ['canudo'] },
  { ncm: '39241000', termos: ['embalagem pra bolo', 'embalagem p bolo'] },
  { ncm: '20091100', termos: ['suco de laranja'] },
  { ncm: '20098921', termos: ['agua de coco', 'leite de coco'] },
  { ncm: '20099000', termos: ['suco', 'sucos', 'nectar', 'kapo'] },
  { ncm: '22011000', termos: ['agua mineral', 'agua com gas', 'agua cristal', 'agua cambara', 'agua santa', 'agua de mina', 'natura agua', 'naturagua'] },
  { ncm: '22021000', termos: ['refrigerante', 'refrig ', 'coca', 'pepsi', 'fanta', 'sukita', 'sprite', 'guarana', 'cajuina', 'soda', 'limonada', 'energetico', 'red bull', 'red bul', 'h2oh', 'limoneto', 'jarritos', 'monster', 'monst ', 'power ade', 'zero cal', 'ala 3', 'ala rosas', 'ala erva doce', 'maguary', 'energy'] },

  { ncm: '18061000', termos: ['achocolatado', 'nescau', 'toddy', 'nescal', 'cacau em po', 'chocolate em po'] },
  { ncm: '19053100', termos: ['biscoito', 'bolacha', 'wafer', 'wefer', 'amori', 'cracker', 'salgadinho', 'salsitos'] },
  { ncm: '19053200', termos: ['waffle'] },
  { ncm: '18063210', termos: ['chocolate', 'batom', 'bato duo', 'kit kat', 'kitkat', 'garoto', 'hersheys', 'chokito'] },
  { ncm: '17049020', termos: ['bala', 'balas', 'pirulito', 'halls', 'fini', 'pastilha'] },
  { ncm: '17041000', termos: ['chiclete', 'trident'] },
  { ncm: '17049090', termos: ['granulado', 'confeicao'] },
  { ncm: '12024200', termos: ['amendoim', 'pacoca'] },
  { ncm: '19059090', termos: ['bolo', 'bolinho', 'brownie', 'mistura para bolo', 'mistura pra bolo', 'tortinha', 'torta', 'fofitos', 'rosquinhas'] },
  { ncm: '21069090', termos: ['gelatina'] },
  { ncm: '20079910', termos: ['geleia'] },
  { ncm: '32049000', termos: ['corante'] },

  { ncm: '19059090', termos: ['pao de queijo', 'pao de forma', 'paes de forma'] },
  { ncm: '19059090', termos: ['pao', 'bisnaga', 'mistura para pao'] },
  { ncm: '04071100', termos: ['ovos', 'ovo'] },
  { ncm: '04021010', termos: ['leite condensado'] },
  { ncm: '04041000', termos: ['creme de leite', 'nata'] },
  { ncm: '04022120', termos: ['leite em po desnatado', 'leite desnatado em po'] },
  { ncm: '04022110', termos: ['leite em po', 'leite empo', 'leite ninho'] },
  { ncm: '17049090', termos: ['doce de leite', 'doce de banana', 'doce de goiba', 'goiabada', 'goiba', 'bananada'] },
  { ncm: '04069090', termos: ['queijo', 'requeijao', 'mussarela', 'muzzarella'] },
  { ncm: '04051000', termos: ['manteiga', 'margarina'] },
  { ncm: '04031000', termos: ['iogurte'] },
  { ncm: '04012010', termos: ['leite integral', 'leite uht', 'leite de gado', 'leite liquido', 'leite desnatado', 'leite'] },

  { ncm: '15071000', termos: ['oleo de soja', 'oleo soja'] },
  { ncm: '15119000', termos: ['dende', 'oleo de palma', 'gordura de palma', 'gordura fry'] },
  { ncm: '15071000', termos: ['oleo'] },
  { ncm: '15099090', termos: ['azeite'] },
  { ncm: '25010020', termos: ['sal refinado', 'sal de cozinha', 'sal'] },

  { ncm: '21033021', termos: ['mostarda'] },
  { ncm: '21031010', termos: ['shoyu', 'shoyo', 'molho de soja', 'molho soja'] },
  { ncm: '21039011', termos: ['maionese', 'hellmanns', 'hellman'] },
  { ncm: '21039021', termos: ['tempero', 'caldo', 'sazon', 'condimento', 'coloral', 'colorau'] },
  { ncm: '21039091', termos: ['ketchup', 'catchup', 'barbecue', 'molho de pimenta', 'molho de tomate', 'molho tomate', 'extrato de alho', 'molho'] },
  { ncm: '20029000', termos: ['extrato de tomate', 'polpa de tomate'] },
  { ncm: '22090000', termos: ['vinagre'] },
  { ncm: '09041200', termos: ['pimenta'] },
  { ncm: '09042100', termos: ['colorau', 'paprica', 'açafrao', 'acafrao'] },
  { ncm: '09103000', termos: ['louro'] },
  { ncm: '09071000', termos: ['canela'] },
  { ncm: '09072000', termos: ['cravo da india', 'cravo'] },
  { ncm: '09073000', termos: ['noz moscada', 'noz-moscada'] },
  { ncm: '09109900', termos: ['oregano', 'alecrim', 'boldo', 'camomila', 'endro', 'macela', 'manjerona'] },
  { ncm: '28365000', termos: ['bicarbonato', 'bicabornato'] },

  { ncm: '10063021', termos: ['arroz'] },
  { ncm: '07133399', termos: ['feijao'] },
  { ncm: '11010010', termos: ['farinha de trigo', 'farinha de rosca'] },
  { ncm: '11081400', termos: ['farinha de mandioca', 'fecula', 'polvilho'] },
  { ncm: '11022000', termos: ['fuba', 'farinha de milho'] },
  { ncm: '11081200', termos: ['amido de milho', 'maizena'] },
  { ncm: '11041200', termos: ['aveia'] },
  { ncm: '11042300', termos: ['milho de pipoca', 'mungunza', 'munguncao'] },
  { ncm: '19041000', termos: ['granola', 'cereal', 'cuscuz', 'corn flakes', 'cornflakes', 'mucilon', 'neston', 'multiceriais', '3 cereais', 'farinha lactea', 'flocao'] },
  { ncm: '19021900', termos: ['instantaneo', 'miojo', 'yakisoba', 'lamencarne', 'lamen', 'spaghetti', 'spaguet', 'spaguett', 'spaguetto'] },
  { ncm: '19021100', termos: ['macarrao', 'espaguete', 'talharim', 'richester'] },
  { ncm: '19023000', termos: ['massa para pastel', 'massa de pastel', 'massa lasanha', 'massa pronta', 'lazanha'] },
  { ncm: '19022000', termos: ['massa pronta para'] },

  { ncm: '20057000', termos: ['azeitona', 'azeito', 'azeitoitona'] },
  { ncm: '20058000', termos: ['milho verde', 'milho em conserva', 'milho amendoim', 'milho sache', 'milho'] },
  { ncm: '20054000', termos: ['ervilha'] },
  { ncm: '20059900', termos: ['palmito'] },

  { ncm: '20051000', termos: ['batata palha', 'batata frita', 'batata chips', 'batatacrinkle', 'chips', 'ruffles', 'fandangos', 'cheetos', 'doritos', 'crinkle'] },
  { ncm: '07019000', termos: ['batata'] },
  { ncm: '07039010', termos: ['alho'] },
  { ncm: '07031019', termos: ['cebola'] },
  { ncm: '07020000', termos: ['tomate'] },
  { ncm: '07061000', termos: ['cenoura'] },
  { ncm: '07081000', termos: ['alface', 'repolho', 'couve', 'brocolis', 'vagem', 'abobrinha'] },
  { ncm: '07099990', termos: ['verdura', 'legume', 'hortalica', 'coentro', 'salsa', 'cebolinha'] },
  { ncm: '08119000', termos: ['polpa'] },
  { ncm: '08011100', termos: ['coco ralado', 'coco em po'] },
  { ncm: '08039000', termos: ['banana'] },
  { ncm: '08051000', termos: ['laranja'] },
  { ncm: '08055000', termos: ['limao'] },
  { ncm: '08081000', termos: ['maca'] },
  { ncm: '08061000', termos: ['uva'] },
  { ncm: '08111000', termos: ['morango'] },
  { ncm: '08071100', termos: ['melancia'] },
  { ncm: '08045020', termos: ['manga'] },
  { ncm: '08043000', termos: ['abacaxi'] },

  { ncm: '17019900', termos: ['acucar'] },
  { ncm: '21069090', termos: ['adocante', 'gelatina', 'fermento', 'royal', 'fermipan', 'extrato de levedura'] },
  { ncm: '09012100', termos: ['cafe', 'nescafe'] },
  { ncm: '09023000', termos: ['cha', 'erva doce'] },

  { ncm: '22030000', termos: ['cerveja', 'chopp'] },
  { ncm: '22042100', termos: ['vinho'] },
  { ncm: '22083000', termos: ['whisky', 'whiskey'] },
  { ncm: '22086000', termos: ['vodka'] },
  { ncm: '22085000', termos: ['gin'] },
  { ncm: '22087000', termos: ['licor'] },
  { ncm: '22084000', termos: ['cachaca', 'aguardente', 'pirassununga'] },

  { ncm: '48191000', termos: ['caixa de pizza', 'caixa p pizza', 'caixa para pizza', 'caixa de papelao', 'caixa salgado', 'caixa p salgado', 'caixp', 'caixas', 'caixa', 'hamburgueira'] },
  { ncm: '48194000', termos: ['saco de papel', 'saco papel', 'saco p papel'] },
  { ncm: '48183000', termos: ['guardanapo'] },
  { ncm: '63026000', termos: ['pano de prato', 'pano', 'flanela'] },
  { ncm: '39232190', termos: ['saco de lixo', 'saco lixo', 'saco p', 'sacos', 'sacola', 'saquinho', 'sacinho', 'saclas', 'saco'] },
  { ncm: '39241000', termos: ['copo descartavel', 'colher descartavel', 'prato descartavel', 'talher descartavel', 'caneca', 'marmita', 'marmitex', 'pote', 'coador', 'total plast', 'saladeira', 'embalagem', 'embalaem', 'prato', 'culinario', 'colher', 'cortador'] },
  { ncm: '39262000', termos: ['luva'] },
  { ncm: '39269090', termos: ['canudo', 'prend', 'prendedor', 'palito', 'tampa', 'isqueiro'] },
  { ncm: '76071990', termos: ['papel aluminio'] },
  { ncm: '48182000', termos: ['papel toalha', 'papel tolha', 'toalha de papel'] },
  { ncm: '39191090', termos: ['fita adesiva'] },
  { ncm: '39204310', termos: ['filme de pvc', 'filme pvc', 'papel acoplado', 'filme'] },
  { ncm: '48119090', termos: ['bobina termica', 'bobina'] },
  { ncm: '34060000', termos: ['vela', 'pavio'] },
  { ncm: '35061010', termos: ['cola', 'araldite', 'super bonder', 'tee bond', 'thunderbond'] },
  { ncm: '85061019', termos: ['pilha'] },
  { ncm: '84248910', termos: ['pulverizador'] },

  { ncm: '23091000', termos: ['racao', 'pet food', 'friskies', 'reparacao total'] },
];

const FALLBACK_CATEGORIA = {
  Mercearia: '21069090',
  'Higiene Pessoal': '33049910',
  Bebidas: '22021000',
  Limpeza: '34029090',
  'Utilidades Domésticas': '39241000',
  'Frutas e Hortifrúti': '07099990',
  'Doces e Biscoitos': '19053100',
  'Carnes e Frios': '16023900',
  'Laticínios': '04069090',
  'Cafés e Chás': '09012100',
  'Açúcares e Adoçantes': '17019900',
  'Bebidas Alcoólicas': '22030000',
  Padaria: '19059090',
  Pet: '23091000',
  Congelados: '19059090',
  'Pastelão 20cm': '19023000',
  'Burger Caseiro': '16023900',
  'Pizza Tamanho G': '19059090',
  'Batata Frita': '20051000',
  'Lanches Simples': '16023900',
  'Mini Salgados': '16023900',
  'Pastel 10cm': '19023000',
  'Bolos Decorados': '19059090',
};

const ehLixo = (nome) => LIXO.some((re) => re.test(String(nome || '').trim()));

const CP1252_INVERSO = {
  0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c,
  0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b,
  0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f,
};

const desfazerCp1252 = (texto) => {
  const bytes = [];
  for (const ch of texto) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x7f || (cp >= 0xa0 && cp <= 0xff)) bytes.push(cp);
    else if (CP1252_INVERSO[cp] !== undefined) bytes.push(CP1252_INVERSO[cp]);
    else return null;
  }
  const utf8 = Buffer.from(bytes).toString('utf8');
  return utf8.includes('\uFFFD') ? null : utf8;
};

const restaurarMojibake = (texto) => {
  const cp = desfazerCp1252(texto);
  if (cp) return cp;
  const latin = Buffer.from(texto, 'latin1').toString('utf8');
  return latin.includes('\uFFFD') ? texto : latin;
};

const semAcento = (texto) =>
  restaurarMojibake(String(texto || ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');

const escapeRe = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const bate = (texto, termo) => {
  const t = escapeRe(semAcento(termo));
  const direita = t.length >= 5 ? '' : '([^a-z]|$)';
  return new RegExp(`(^|[^a-z])${t}${direita}`, 'i').test(texto);
};

function resolverNcm(produto) {
  const texto = [produto.nome, produto.marca, produto.descricao]
    .filter(Boolean)
    .map((campo) => semAcento(campo))
    .join(' ');
  for (const regra of REGRAS) {
    if (regra.termos.some((termo) => bate(texto, termo))) return { ncm: regra.ncm, origem: 'palavra-chave' };
  }
  const categoria = semAcento(produto.categoria || '');
  const porCategoria = Object.entries(FALLBACK_CATEGORIA).find(([nome]) => semAcento(nome) === categoria);
  if (porCategoria) return { ncm: porCategoria[1], origem: 'categoria' };
  return { ncm: null, origem: 'pendente' };
}

function carregarTabela() {
  if (existsSync(CACHE_IBPT)) {
    try {
      const bruto = JSON.parse(readFileSync(CACHE_IBPT, 'utf8'));
      if (bruto && bruto.dados) return processarBruto(bruto);
      if (bruto && bruto._meta) return bruto;
    } catch {
      /* arquivo invalido, baixa de novo */
    }
  }
  return baixarTabela();
}

function baixarTabela() {
  console.log(`Baixando tabela IBPT ${TABELA_VERSAO}/${UF}...`);
  const destino = 'scripts/.tmp-ibpt.gz';
  execFileSync('curl', ['-s', '--max-time', '120', '-o', destino, IBPT_URL]);
  const buf = readFileSync(destino);
  unlinkSync(destino);
  const dados = JSON.parse(gunzipSync(buf).toString('utf8'));
  const indice = processarBruto(dados);
  writeFileSync(CACHE_IBPT, JSON.stringify(indice));
  console.log(`Tabela local com ${Object.keys(indice).length - 1} NCMs.`);
  return indice;
}

function processarBruto(dados) {
  const indice = {};
  for (const reg of dados.dados) {
    const codigo = String(reg.codigo || '').replace(/\D/g, '');
    if (!codigo) continue;
    if (!indice[codigo]) indice[codigo] = { base: null, excecoes: [] };
    const item = {
      ncm: codigo,
      excecao: String(reg.excecao || '').trim(),
      descricao: reg.descricao,
      federal: Number(reg.aliquotaNacionalFederal),
      importados: Number(reg.aliquotaImportadosFederal),
      estadual: Number(reg.aliquotaEstadual),
      municipal: Number(reg.aliquotaMunicipal),
      vigenciaInicio: reg.vigenciaInicio,
      vigenciaFim: reg.vigenciaFim,
      fonte: FONTE_IBPT,
    };
    if (!item.excecao || item.excecao === '-') {
      if (!indice[codigo].base) indice[codigo].base = item;
    } else {
      indice[codigo].excecoes.push(item);
    }
  }
  return {
    _meta: { tabela: `${TABELA_ANO}/${TABELA_VERSAO}`, uf: UF, fonte: FONTE_IBPT, baixadoEm: new Date().toISOString() },
    ...indice,
  };
}

function registro(tabela, ncm) {
  const entry = tabela[ncm];
  if (!entry) return null;
  return entry.base || entry.excecoes[0] || null;
}

function candidatos(tabela, ncm) {
  const alvo = String(ncm).replace(/\D/g, '');
  for (const tamanho of [6, 4]) {
    const prefixo = alvo.slice(0, tamanho);
    const achados = Object.keys(tabela)
      .filter((k) => k !== '_meta' && k.startsWith(prefixo) && tabela[k].base)
      .slice(0, 8);
    if (achados.length) return achados.map((k) => `${k} ${tabela[k].base.descricao}`);
  }
  return [];
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const tabela = carregarTabela();

  const { rows } = await pool.query(
    `SELECT p.id, p.nome, p.marca, p.descricao, p.ncm, p.cfop, p.csosn, p."cstPis", p."cstCofins", p.origem,
            p."aliqTributosFederais", p."aliqTributosEstaduais", p."aliqTributosMunicipais",
            p."fonteTributosAproximados", p."vigenciaTributosAproximados", c.nome AS categoria
     FROM produtos p LEFT JOIN categorias c ON c.id = p."categoriaId"
     WHERE p."negocioId" = $1
     ORDER BY p.nome`,
    [NEGOCIO_ID]
  );

  const reais = rows.filter((p) => !ehLixo(p.nome));
  const lixo = rows.filter((p) => ehLixo(p.nome));

  console.log(`Produtos no negocio: ${rows.length} | reais: ${reais.length} | ignorados (lixo/teste): ${lixo.length}`);
  if (lixo.length) console.log('  ignorados: ' + lixo.map((p) => p.nome).join(' | '));

  const resolucao = reais.map((p) => ({ produto: p, ...resolverNcm(p) }));

  const pendentes = resolucao.filter((r) => !r.ncm);
  console.log(`\nSem regra nem categoria (${pendentes.length}) - revisao manual necessaria:`);
  pendentes.forEach((r) => console.log(`   - ${r.produto.nome}`));

  const porCategoria = resolucao.filter((r) => r.origem === 'categoria');
  console.log(`\nFallback de categoria (${porCategoria.length}):`);
  porCategoria.forEach((r) => console.log(`   - ${r.ncm} <- [${r.produto.categoria}] ${r.produto.nome}`));

  const usados = [...new Set(resolucao.map((r) => r.ncm).filter(Boolean))].sort();
  const ausentes = usados.filter((ncm) => !registro(tabela, ncm));
  console.log(`\nNCM candidatos: ${usados.length} | ausentes na tabela IBPT: ${ausentes.length}`);
  ausentes.forEach((ncm) => {
    const qtd = resolucao.filter((r) => r.ncm === ncm).length;
    console.log(`  ! ${ncm} (afeta ${qtd} produto) candidatos:`);
    candidatos(tabela, ncm).forEach((c) => console.log(`      ${c}`));
  });

  if (AUDIT) {
    console.log('\n=== AUDIT: NCM usados e aliquotas ===');
    usados.forEach((ncm) => {
      const reg = registro(tabela, ncm);
      const qtd = resolucao.filter((r) => r.ncm === ncm).length;
      console.log(
        reg
          ? `  ${ncm} (x${qtd}) fed=${reg.federal} est=${reg.estadual} mun=${reg.municipal} vig=${reg.vigenciaInicio} | ${reg.descricao}`
          : `  ${ncm} (x${qtd}) AUSENTE`
      );
    });
    await pool.end();
    return;
  }

  const planos = [];
  for (const r of resolucao) {
    const p = r.produto;
    const reg = r.ncm ? registro(tabela, r.ncm) : null;
    if (r.ncm && !reg) continue;

    const mudancas = {};
    if (!String(p.ncm || '').trim() && r.ncm) mudancas.ncm = r.ncm;
    if (!String(p.cfop || '').trim()) mudancas.cfop = CFOP;
    if (!String(p.csosn || '').trim()) mudancas.csosn = CSOSN;
    if (!String(p.cstPis || '').trim()) mudancas.cstPis = CST_PIS;
    if (!String(p.cstCofins || '').trim()) mudancas.cstCofins = CST_COFINS;
    if (!String(p.origem || '').trim()) mudancas.origem = ORIGEM;

    if (reg) {
      if (p.aliqTributosFederais == null) mudancas.aliqTributosFederais = reg.federal;
      if (p.aliqTributosEstaduais == null) mudancas.aliqTributosEstaduais = reg.estadual;
      if (p.aliqTributosMunicipais == null) mudancas.aliqTributosMunicipais = reg.municipal;
      if (!String(p.fonteTributosAproximados || '').trim()) mudancas.fonteTributosAproximados = reg.fonte;
      if (p.vigenciaTributosAproximados == null && reg.vigenciaInicio) {
        const [dia, mes, ano] = String(reg.vigenciaInicio).split('/');
        mudancas.vigenciaTributosAproximados = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
      }
    }

    if (Object.keys(mudancas).length) planos.push({ id: p.id, nome: p.nome, mudancas });
  }

  console.log(`\nProdutos a atualizar: ${planos.length} de ${reais.length}`);
  const porMudanca = {};
  planos.forEach((plano) => {
    Object.keys(plano.mudancas).forEach((campo) => {
      porMudanca[campo] = (porMudanca[campo] || 0) + 1;
    });
  });
  console.log('  campos:', JSON.stringify(porMudanca));

  const semPlano = resolucao.filter((r) => !planos.find((pl) => pl.id === r.produto.id));
  if (semPlano.length) console.log(`  nada a fazer (ja preenchidos ou sem NCM): ${semPlano.length}`);

  if (!APPLY) {
    console.log('\nDRY-RUN — nada gravado. Rode com APPLY=1 para aplicar.');
    await pool.end();
    return;
  }

  await pool.query('BEGIN');
  let ok = 0;
  try {
    for (const plano of planos) {
      const campos = Object.keys(plano.mudancas);
      const sets = campos.map((c, i) => `"${c}" = $${i + 2}`).join(', ');
      const valores = [plano.id, ...campos.map((c) => plano.mudancas[c])];
      await pool.query(`UPDATE produtos SET ${sets} WHERE id = $1`, valores);
      ok++;
    }
    await pool.query('COMMIT');
    console.log(`\nAplicado: ${ok} produtos atualizados.`);
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('Erro, rollback:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
