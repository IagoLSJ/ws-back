import 'dotenv/config';

const API = process.env.API_URL || 'http://localhost:3000/api';
const EMAIL = process.env.E2E_EMAIL || 'e2e@teste.com';
const SENHA = process.env.E2E_SENHA || 'e2e123456';

let falhas = 0;
function checar(nome, condicao, extra = '') {
  console.log((condicao ? '[PASS] ' : '[FAIL] ') + nome + (extra ? ' ' + extra : ''));
  if (!condicao) falhas++;
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, data };
}

(async () => {
  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, senha: SENHA } });
  if (!login.data?.accessToken) { console.error('login falhou', login.status); process.exit(1); }
  const H = { Authorization: `Bearer ${login.data.accessToken}` };
  const sufixo = Date.now();

  // Negócio COMIDA + 3 produtos + 10 mesas
  const neg = await api('/negocios', { method: 'POST', body: { nome: `Lanchonete E2E ${sufixo}`, slug: `lanch-e2e-${sufixo}`, tipo: 'COMIDA' }, headers: H });
  const negId = neg.data.id;
  const slug = neg.data.slug;

  const produtos = [];
  for (const [nome, preco] of [['Lanche A', 10], ['Lanche B', 20], ['Lanche C', 30]]) {
    const p = await api(`/negocios/${negId}/produtos`, { method: 'POST', body: { nome, preco, controlaEstoque: true, quantidadeAtual: 200 }, headers: H });
    produtos.push(p.data.id);
  }

  const mesas = [];
  for (let i = 1; i <= 10; i++) {
    const m = await api(`/negocios/${negId}/mesas`, { method: 'POST', body: { numero: i, nome: `Mesa ${i}` }, headers: H });
    mesas.push(m.data);
  }
  console.log(`Setup: negocio=${slug} | produtos=${produtos.length} | mesas=${mesas.length}`);

  // Cada sessão (mesa) adiciona UM produto DIFERENTE com quantidade própria
  // mesa i -> produto[i % 3] com qtd (i + 1)
  const sessoes = mesas.map((mesa, i) => {
    const produtoId = produtos[i % produtos.length];
    const quantidade = i + 1;
    return { mesa, i, produtoId, quantidade, sid: `iso-${i}-${sufixo}` };
  });

  // Adiciona nos 10 carrinhos SIMULTANEAMENTE
  await Promise.all(
    sessoes.map((s) =>
      api(`/vitrine/${slug}/carrinho`, { method: 'POST', body: { produtoId: s.produtoId, quantidade: s.quantidade }, headers: { 'X-Session-Id': s.sid } }),
    ),
  );

  // Verifica isolamento: o carrinho de cada sessão tem SÓ o item dela (não compartilhado)
  const isolados = await Promise.all(
    sessoes.map(async (s) => {
      const res = await api(`/vitrine/${slug}/carrinho`, { headers: { 'X-Session-Id': s.sid } });
      const carrinho = res.data;
      if (!carrinho?.itens) return false;
      const ok = carrinho.itens.length === 1 &&
        carrinho.itens[0].produtoId === s.produtoId &&
        Number(carrinho.itens[0].quantidade) === s.quantidade;
      return ok;
    }),
  );
  checar('carrinho de cada mesa isolado (1 item, produto e qtd corretos)', isolados.every(Boolean), `(ok: ${isolados.filter(Boolean).length}/10)`);

  // Checkout simultâneo nas 10 mesas
  const pedidos = await Promise.all(
    sessoes.map((s) =>
      api(`/vitrine/${slug}/pedidos/checkout`, {
        method: 'POST',
        body: { tipoEntrega: 'MESA', mesaId: s.mesa.id, metodoPagamento: 'PIX', idempotencyKey: `iso-${s.i}-${sufixo}` },
        headers: { 'X-Session-Id': s.sid },
      }),
    ),
  );

  // Verifica que CADA pedido tem exatamente o item da sua mesa
  let pedidosOk = 0;
  for (let i = 0; i < sessoes.length; i++) {
    const p = pedidos[i].data;
    const esperado = sessoes[i];
    const itens = p?.itens || [];
    const ok = itens.length === 1 &&
      itens[0].produtoId === esperado.produtoId &&
      Number(itens[0].quantidade) === esperado.quantidade;
    if (ok) pedidosOk++;
  }
  checar('cada pedido de mesa contém somente o item da sua sessão', pedidosOk === 10, `(ok: ${pedidosOk}/10)`);

  // Sem duplicidade: soma das quantidades nos pedidos = 55 (1+2+...+10)
  const somaQtd = pedidos.reduce((acc, r) => acc + (r.data?.itens?.[0] ? Number(r.data.itens[0].quantidade) : 0), 0);
  checar('quantidades somam 55 (sem itens duplicados entre mesas)', somaQtd === 55, `(soma: ${somaQtd})`);

  console.log(falhas ? `\nRESULTADO: ${falhas} falhas` : '\nRESULTADO: todas as verificações passaram');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
