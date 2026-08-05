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

async function estoqueProduto(negId, prodId, H) {
  const r = await api(`/negocios/${negId}/produtos/${prodId}`, { headers: H });
  return Number(r.data?.estoqueItem?.quantidadeAtual ?? NaN);
}

(async () => {
  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, senha: SENHA } });
  if (!login.data?.accessToken) { console.error('login falhou', login.status); process.exit(1); }
  const H = { Authorization: `Bearer ${login.data.accessToken}` };
  const sufixo = Date.now();

  // Cria 3 negócios, cada um com 1 produto (estoque 100)
  const negocios = [];
  for (const [nome, preco, letra] of [['Neg A', 10, 'A'], ['Neg B', 20, 'B'], ['Neg C', 30, 'C']]) {
    const neg = await api('/negocios', { method: 'POST', body: { nome: `${nome} E2E ${sufixo}`, slug: `multi-${letra}-${sufixo}`, tipo: 'VAREJO' }, headers: H });
    const prod = await api(`/negocios/${neg.data.id}/produtos`, { method: 'POST', body: { nome: `Produto ${letra}`, preco, controlaEstoque: true, quantidadeAtual: 100 }, headers: H });
    negocios.push({ negocioId: neg.data.id, slug: neg.data.slug, produtoId: prod.data.id, preco, letra });
  }
  console.log(`3 negócios criados: ${negocios.map((n) => n.letra).join(', ')}`);

  // Abre caixa em cada negócio
  for (const n of negocios) {
    await api(`/negocios/${n.negocioId}/caixa/abrir`, { method: 'POST', body: { saldoInicial: 0 }, headers: H });
  }

  // ==== CONCORRENTE: 1 venda PDV em CADA negócio (DINHEIRO → CONFIRMADO + estoque + caixa) ====
  const pdvs = await Promise.all(
    negocios.map((n) =>
      api(`/negocios/${n.negocioId}/pdv/checkout`, {
        method: 'POST',
        body: { itens: [{ produtoId: n.produtoId, quantidade: 1 }], pagamento: { metodo: 'DINHEIRO', valorPago: n.preco }, tipoEntrega: 'RETIRADA' },
        headers: H,
      }),
    ),
  );
  const pdvOk = pdvs.filter((r) => r.data?.status === 'CONFIRMADO').length;
  checar('1 venda PDV CONFIRMADA em cada negócio (simultâneo)', pdvOk === 3, `(ok: ${pdvOk}/3)`);

  // ==== CONCORRENTE: 1 pedido no SITE em CADA negócio (PIX → PENDENTE) ====
  const sites = await Promise.all(
    negocios.map((n) => {
      const sid = `site-${n.letra}-${sufixo}`;
      return (async () => {
        await api(`/vitrine/${n.slug}/carrinho`, { method: 'POST', body: { produtoId: n.produtoId, quantidade: 2 }, headers: { 'X-Session-Id': sid } });
        return api(`/vitrine/${n.slug}/pedidos/checkout`, {
          method: 'POST',
          body: { tipoEntrega: 'RETIRADA', metodoPagamento: 'PIX', idempotencyKey: `site-${n.letra}-${sufixo}` },
          headers: { 'X-Session-Id': sid },
        });
      })();
    }),
  );
  const siteOk = sites.filter((r) => r.data?.status === 'PENDENTE').length;
  checar('1 pedido no site PENDENTE em cada negócio (simultâneo)', siteOk === 3, `(ok: ${siteOk}/3)`);

  // ==== VERIFICAÇÕES DE ISOLAMENTO ====
  // 1) Cada pedido pertence ao seu negócio
  const pedidosCorretos = negocios.every((n, i) => {
    const p = pdvs[i].data;
    return p && p.negocioId === n.negocioId;
  });
  checar('pedidos PDV vinculados ao negócio correto', pedidosCorretos);

  // 2) Estoque descontado APENAS no próprio negócio (100 → 99)
  let estoqueOk = true;
  for (const n of negocios) {
    const qtd = await estoqueProduto(n.negocioId, n.produtoId, H);
    if (qtd !== 99) { estoqueOk = false; console.log(`  estoque ${n.letra}: ${qtd}`); }
  }
  checar('estoque de cada negócio descontado só nele (99)', estoqueOk);

  // 3) Cada negócio tem APENAS o seu produto (sem vazar entre negócios)
  const produtosOk = (await Promise.all(negocios.map((n) => api(`/negocios/${n.negocioId}/produtos`, { headers: H }))))
    .every((r, i) => {
      const prods = r.data || [];
      return prods.length === 1 && prods[0].id === negocios[i].produtoId;
    });
  checar('cada negócio tem só o próprio produto (sem cruzamento)', produtosOk);

  // 4) Caixa de cada negócio registrou 1 venda com o valor certo
  let caixaOk = true;
  for (const n of negocios) {
    const c = (await api(`/negocios/${n.negocioId}/caixa/atual`, { headers: H })).data;
    if (Number(c?.totalVendas ?? 0) !== n.preco) { caixaOk = false; console.log(`  caixa ${n.letra}: R$ ${c?.totalVendas}`); }
  }
  checar('caixa de cada negócio registrou a própria venda', caixaOk);

  // 5) Total de pedidos por negócio = 2 (1 PDV + 1 site)
  let pedidosPorNegocio = true;
  for (const n of negocios) {
    const lista = (await api(`/negocios/${n.negocioId}/pedidos?limite=50`, { headers: H })).data;
    const total = (lista?.data || lista || []).length;
    if (total !== 2) { pedidosPorNegocio = false; console.log(`  pedidos ${n.letra}: ${total}`); }
  }
  checar('cada negócio tem 2 pedidos (sem misturar com os outros)', pedidosPorNegocio);

  console.log(falhas ? `\nRESULTADO: ${falhas} falhas` : '\nRESULTADO: todas as verificações passaram');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
