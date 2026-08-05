import 'dotenv/config';

const API = process.env.API_URL || 'http://localhost:3000/api';
const EMAIL = process.env.E2E_EMAIL || 'e2e@teste.com';
const SENHA = process.env.E2E_SENHA || 'e2e123456';

const resultados = [];
let falhas = 0;
function checar(nome, condicao, extra = '') {
  if (condicao) {
    resultados.push(`[PASS] ${nome}`);
    console.log(`[PASS] ${nome}`);
  } else {
    falhas++;
    resultados.push(`[FAIL] ${nome} ${extra}`);
    console.log(`[FAIL] ${nome} ${extra}`);
  }
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
  // 1. Login
  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, senha: SENHA } });
  if (!login.data?.accessToken) {
    console.error('Falha no login:', login.status);
    process.exit(1);
  }
  const token = login.data.accessToken;
  const H = { Authorization: `Bearer ${token}` };

  // 2. Negócio COMIDA (lanchonete)
  const sufixo = Date.now();
  const neg = await api('/negocios', {
    method: 'POST', body: { nome: `Lanchonete E2E ${sufixo}`, slug: `lanchonete-e2e-${sufixo}`, tipo: 'COMIDA' }, headers: H,
  });
  const negId = neg.data?.id;
  if (!negId) { console.error('Falha ao criar negócio:', neg.status, JSON.stringify(neg.data)); process.exit(1); }
  const slug = neg.data.slug;
  console.log(`Negócio COMIDA criado: ${slug} (${negId})`);

  // 3. Produtos com estoque
  const prod = await api(`/negocios/${negId}/produtos`, {
    method: 'POST', body: { nome: 'Lanche Teste', preco: 15, controlaEstoque: true, quantidadeAtual: 100, estoqueMinimo: 5 }, headers: H,
  });
  const prodId = prod.data?.id;
  checar('produto criado com estoque', !!prodId);
  if (!prodId) process.exit(1);

  // 4. 10 mesas
  const mesas = [];
  for (let i = 1; i <= 10; i++) {
    const m = await api(`/negocios/${negId}/mesas`, { method: 'POST', body: { numero: i, nome: `Mesa ${i}` }, headers: H });
    if (m.data?.id) mesas.push(m.data);
  }
  checar('10 mesas criadas', mesas.length === 10, `(criadas: ${mesas.length})`);

  // 5a. 10 pedidos de MESA SIMULTÂNEOS (PIX → PENDENTE)
  const pedidosMesa = await Promise.all(
    mesas.map(async (mesa, i) => {
      const sid = `mesa-${i}-${sufixo}`;
      await api(`/vitrine/${slug}/carrinho`, { method: 'POST', body: { produtoId: prodId, quantidade: 1 }, headers: { 'X-Session-Id': sid } });
      const ped = await api(`/vitrine/${slug}/pedidos/checkout`, {
        method: 'POST',
        body: { tipoEntrega: 'MESA', mesaId: mesa.id, metodoPagamento: 'PIX', idempotencyKey: `mesa-${i}-${sufixo}` },
        headers: { 'X-Session-Id': sid },
      });
      return ped.data;
    }),
  );
  const mesaOk = pedidosMesa.filter((p) => p && p.tipoEntrega === 'MESA' && p.mesaId && p.status === 'PENDENTE');
  checar('10 pedidos de mesa simultâneos (MESA/PIX/PENDENTE)', mesaOk.length === 10, `(ok: ${mesaOk.length})`);

  // 5b. 10 pedidos no SITE SIMULTÂNEOS (RETIRADA, PIX → PENDENTE)
  const pedidosSite = await Promise.all(
    Array.from({ length: 10 }, async (_, i) => {
      const sid = `site-${i}-${sufixo}`;
      await api(`/vitrine/${slug}/carrinho`, { method: 'POST', body: { produtoId: prodId, quantidade: 1 }, headers: { 'X-Session-Id': sid } });
      const ped = await api(`/vitrine/${slug}/pedidos/checkout`, {
        method: 'POST',
        body: { tipoEntrega: 'RETIRADA', metodoPagamento: 'PIX', idempotencyKey: `site-${i}-${sufixo}` },
        headers: { 'X-Session-Id': sid },
      });
      return ped.data;
    }),
  );
  const siteOk = pedidosSite.filter((p) => p && p.status === 'PENDENTE');
  checar('10 pedidos no site simultâneos (PENDENTE)', siteOk.length === 10, `(ok: ${siteOk.length})`);

  // 5c. 10 pedidos no BALCÃO SIMULTÂNEOS (PDV, DINHEIRO → CONFIRMADO + estoque + caixa)
  const abrir = await api(`/negocios/${negId}/caixa/abrir`, { method: 'POST', body: { saldoInicial: 0 }, headers: H });
  if (abrir.status !== 201 && !JSON.stringify(abrir.data).includes('já possui')) {
    console.error('Falha ao abrir caixa:', abrir.status, JSON.stringify(abrir.data));
    process.exit(1);
  }
  const pedidosBalcao = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const ped = await api(`/negocios/${negId}/pdv/checkout`, {
        method: 'POST',
        body: { itens: [{ produtoId: prodId, quantidade: 1 }], pagamento: { metodo: 'DINHEIRO', valorPago: 15 }, tipoEntrega: 'RETIRADA' },
        headers: H,
      });
      return ped.data;
    }),
  );
  const balcaoOk = pedidosBalcao.filter((p) => p && p.status === 'CONFIRMADO');
  checar('10 pedidos no balcão simultâneos (CONFIRMADO)', balcaoOk.length === 10, `(ok: ${balcaoOk.length})`);

  // 6. Verificações finais
  // Total de pedidos
  const lista = await api(`/negocios/${negId}/pedidos?limite=100`, { headers: H });
  const pedidos = lista.data?.data || lista.data || [];
  checar('total de 30 pedidos', pedidos.length === 30, `(total: ${pedidos.length})`);

  // Estoque descontado (10 do balcão)
  const prodFinal = await api(`/negocios/${negId}/produtos/${prodId}`, { headers: H });
  const qtd = Number(prodFinal.data?.estoqueItem?.quantidadeAtual ?? -1);
  checar('estoque descontado no balcão (90)', qtd === 90, `(qtd: ${qtd})`);

  // Caixa registrou as vendas do balcão
  const caixa = await api(`/negocios/${negId}/caixa/atual`, { headers: H });
  checar('caixa com 10 vendas registradas', Number(caixa.data?.totalVendas ?? 0) === 150, `(vendas: R$ ${caixa.data?.totalVendas})`);

  console.log('\n===== RESUMO =====');
  console.log(`${resultados.length - falhas}/${resultados.length} verificações passaram`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
