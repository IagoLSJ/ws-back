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

async function saldo(negId, itemId, H) {
  const r = await api(`/negocios/${negId}/estoque/${itemId}`, { headers: H });
  return Number(r.data?.quantidadeAtual ?? NaN);
}

(async () => {
  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, senha: SENHA } });
  if (!login.data?.accessToken) { console.error('login falhou', login.status); process.exit(1); }
  const H = { Authorization: `Bearer ${login.data.accessToken}` };
  const sufixo = Date.now();

  // Negócio dedicado + produto vinculado
  const neg = await api('/negocios', { method: 'POST', body: { nome: `Estoque E2E ${sufixo}`, slug: `estoq-e2e-${sufixo}`, tipo: 'VAREJO' }, headers: H });
  const negId = neg.data.id;
  const prod = await api(`/negocios/${negId}/produtos`, { method: 'POST', body: { nome: 'Item Vinculado', preco: 10, controlaEstoque: true, quantidadeAtual: 0 }, headers: H });
  const prodId = prod.data.id;
  console.log(`Setup: negocio=${neg.data.slug} | produto=${prodId}`);

  // Item avulso para testes de movimentação
  const avulso = await api(`/negocios/${negId}/estoque`, { method: 'POST', body: { nome: 'Avulso Teste', quantidadeAtual: 0, estoqueMinimo: 2, unidade: 'un' }, headers: H });
  const avId = avulso.data.id;

  // ===== 1. CRIAR: valores negativos não são permitidos =====
  const negCriar = await api(`/negocios/${negId}/estoque`, { method: 'POST', body: { nome: 'X', quantidadeAtual: -5 }, headers: H });
  checar('criar item com quantidade negativa é rejeitado (400)', negCriar.status === 400, `(status ${negCriar.status})`);

  // ===== 2. ENTRADA =====
  let r = await api(`/negocios/${negId}/estoque/${avId}/movimentar`, { method: 'POST', body: { tipo: 'ENTRADA', quantidade: 10, motivo: 'compra' }, headers: H });
  checar('ENTRADA 10 ok', r.status === 201 && (await saldo(negId, avId, H)) === 10);

  r = await api(`/negocios/${negId}/estoque/${avId}/movimentar`, { method: 'POST', body: { tipo: 'ENTRADA', quantidade: -3 }, headers: H });
  checar('ENTRADA negativa é rejeitada (400)', r.status === 400, `(status ${r.status})`);

  r = await api(`/negocios/${negId}/estoque/${avId}/movimentar`, { method: 'POST', body: { tipo: 'ENTRADA', quantidade: 0 }, headers: H });
  checar('ENTRADA 0 é rejeitada', r.status === 400);

  // ===== 3. SAIDA_VENDA =====
  r = await api(`/negocios/${negId}/estoque/${avId}/movimentar`, { method: 'POST', body: { tipo: 'SAIDA_VENDA', quantidade: 3, motivo: 'venda' }, headers: H });
  checar('SAIDA_VENDA 3 ok', r.status === 201 && (await saldo(negId, avId, H)) === 7);

  r = await api(`/negocios/${negId}/estoque/${avId}/movimentar`, { method: 'POST', body: { tipo: 'SAIDA_VENDA', quantidade: 100 }, headers: H });
  checar('SAIDA_VENDA maior que o saldo → "Estoque insuficiente"', r.status === 400 && /insuficiente/i.test(JSON.stringify(r.data)), `(status ${r.status})`);

  r = await api(`/negocios/${negId}/estoque/${avId}/movimentar`, { method: 'POST', body: { tipo: 'SAIDA_VENDA', quantidade: -1 }, headers: H });
  checar('SAIDA_VENDA negativa é rejeitada', r.status === 400);

  // ===== 4. OUTROS TIPOS DE SAÍDA =====
  for (const tipo of ['SAIDA_AJUSTE', 'PERDA', 'USO']) {
    r = await api(`/negocios/${negId}/estoque/${avId}/movimentar`, { method: 'POST', body: { tipo, quantidade: 1, motivo: 'teste' }, headers: H });
    checar(`${tipo} 1 ok`, r.status === 201);
  }
  checar('saldo após ajuste/perda/uso (7 - 3 = 4)', (await saldo(negId, avId, H)) === 4);

  // ===== 5. INVENTÁRIO (pode zerar e ajustar para o valor contado) =====
  r = await api(`/negocios/${negId}/estoque/${avId}/movimentar`, { method: 'POST', body: { tipo: 'INVENTARIO', quantidade: 9, motivo: 'contagem' }, headers: H });
  checar('INVENTARIO ajusta para 9', r.status === 201 && (await saldo(negId, avId, H)) === 9);

  r = await api(`/negocios/${negId}/estoque/${avId}/movimentar`, { method: 'POST', body: { tipo: 'INVENTARIO', quantidade: 0, motivo: 'contagem zerada' }, headers: H });
  checar('INVENTARIO com 0 ZERA o saldo (permitido)', r.status === 201 && (await saldo(negId, avId, H)) === 0);

  // ===== 6. DECIMAIS (kg) =====
  const peso = await api(`/negocios/${negId}/estoque`, { method: 'POST', body: { nome: 'Carne', quantidadeAtual: 25, unidade: 'kg' }, headers: H });
  r = await api(`/negocios/${negId}/estoque/${peso.data.id}/movimentar`, { method: 'POST', body: { tipo: 'SAIDA_VENDA', quantidade: 0.5 }, headers: H });
  checar('saída com decimal (0.5kg) ok', r.status === 201 && (await saldo(negId, peso.data.id, H)) === 24.5, `(saldo ${await saldo(negId, peso.data.id, H)})`);

  // ===== 7. PRODUTO VINCULADO: zera → status ESGOTADO =====
  const estoques = await api(`/negocios/${negId}/estoque?limit=100`, { headers: H });
  const itemVinculado = estoques.data.data.find((i) => i.produtoId === prodId);
  if (itemVinculado) {
    r = await api(`/negocios/${negId}/estoque/${itemVinculado.id}/movimentar`, { method: 'POST', body: { tipo: 'INVENTARIO', quantidade: 0 }, headers: H });
    const p = await api(`/negocios/${negId}/produtos/${prodId}`, { headers: H });
    checar('produto fica ESGOTADO quando estoque zera', p.data.status === 'ESGOTADO');
  } else {
    checar('produto vinculado existe no estoque', false);
  }

  // ===== 8. HISTÓRICO =====
  const hist = await api(`/negocios/${negId}/estoque/${avId}/historico`, { headers: H });
  const tiposRegistrados = new Set(hist.data.map((m) => m.tipo));
  checar('histórico registra os tipos de movimentação', ['ENTRADA', 'SAIDA_VENDA', 'SAIDA_AJUSTE', 'PERDA', 'USO', 'INVENTARIO'].every((t) => tiposRegistrados.has(t)), `(tipos: ${[...tiposRegistrados].join(',')})`);

  // ===== 9. TRANSFERÊNCIA entre negócios =====
  const neg2 = await api('/negocios', { method: 'POST', body: { nome: `Destino E2E ${sufixo}`, slug: `dest-e2e-${sufixo}`, tipo: 'VAREJO' }, headers: H });
  // item no destino (vinculado ao mesmo produto não existe; cria avulso de destino)
  await api(`/negocios/${neg2.data.id}/estoque`, { method: 'POST', body: { nome: 'Avulso Teste', quantidadeAtual: 0, unidade: 'un' }, headers: H });
  r = await api(`/negocios/${negId}/estoque/${avId}/movimentar`, { method: 'POST', body: { tipo: 'ENTRADA', quantidade: 10 }, headers: H });
  r = await api(`/negocios/${negId}/estoque/transferir`, { method: 'POST', body: { itemOrigemId: avId, negocioDestinoId: neg2.data.id, quantidade: 4, motivo: 'teste' }, headers: H });
  checar('transferência de 4 ok', r.status === 201 && (await saldo(negId, avId, H)) === 6, `(origem ${await saldo(negId, avId, H)})`);

  r = await api(`/negocios/${negId}/estoque/transferir`, { method: 'POST', body: { itemOrigemId: avId, negocioDestinoId: neg2.data.id, quantidade: 999 }, headers: H });
  checar('transferência maior que o saldo → rejeitada', r.status === 400 && /insuficiente/i.test(JSON.stringify(r.data)));

  console.log(falhas ? `\nRESULTADO: ${falhas} falhas` : '\nRESULTADO: todas as verificações passaram');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
