require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');

const NEGOCIO_ID = process.env.NEGOCIO_ID || '6ac0fc1c-2659-4dc0-a296-a0f116dfd1b0';
const SAIDA_DIR = path.join(__dirname, 'saida-econf');
const eanValido = (v) => !v || /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(String(v).trim());

function titulo(t) {
  console.log(`\n========== ${t}`);
}
function dump(v) {
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL).host;
  titulo(`Banco alvo: ${dbHost}`);
  if (/localhost|127\.0\.0\.1/i.test(dbHost)) {
    throw new Error('Este teste foi aprovado para o banco de producao (Neon) - DATABASE_URL aponta para localhost');
  }
  if (!process.env.FISCAL_ENCRYPTION_KEY) throw new Error('FISCAL_ENCRYPTION_KEY ausente no ambiente');

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/src/app.module.js');
  const { PrismaService } = require('../dist/src/infra/database/prisma.service.js');
  const { FiscalService } = require('../dist/src/modules/fiscal/fiscal.service.js');
  const { ContasReceberService } = require('../dist/src/modules/contas-receber/contas-receber.service.js');

  const checks = [];
  const check = (nome, ok) => {
    checks.push([nome, !!ok]);
    console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}`);
  };

  let app = null;
  let erro = null;
  let testeOk = false;
  let snapshot = null;

  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const prisma = app.get(PrismaService, { strict: false });
    const fiscal = app.get(FiscalService, { strict: false });
    const contas = app.get(ContasReceberService, { strict: false });

    const original = await prisma.configuracaoFiscal.findUnique({ where: { negocioId: NEGOCIO_ID } });
    if (!original) throw new Error(`Configuracao fiscal do negocio ${NEGOCIO_ID} nao encontrada`);
    snapshot = { ambiente: original.ambiente, ativo: original.ativo };

    titulo('1. Configuracao original');
    dump({ ambiente: original.ambiente, ativo: original.ativo, proximoNumero: original.proximoNumero });

    await prisma.configuracaoFiscal.update({
      where: { negocioId: NEGOCIO_ID },
      data: { ambiente: 'HOMOLOGACAO', ativo: true },
    });
    titulo('2. Ambiente HOMOLOGACAO + emissao ativada');

    titulo('3. Venda a prazo (CREDIARIO) - pedido + NFC-e');
    const terminais = ['AUTORIZADA', 'REJEITADA', 'ERRO', 'CANCELADA'];
    let pedido = null;
    let doc = null;
    let tentativas539 = 0;
    for (let tentativa = 1; tentativa <= 8 && !doc; tentativa++) {
      const candidatos = await prisma.produto.findMany({
        where: { negocioId: NEGOCIO_ID, status: 'ATIVO', ncm: { not: null }, cfop: { not: null }, preco: { gt: 0 } },
        orderBy: { preco: 'asc' },
        take: 300,
        select: { id: true, nome: true, preco: true, codigoBarras: true },
      });
      const produtos = candidatos.filter((p) => eanValido(p.codigoBarras)).slice(0, 2);
      if (produtos.length < 2) throw new Error('Menos de 2 produtos ATIVO com EAN valido/ausente');
      const total = Number(produtos.reduce((s, p) => s + Number(p.preco), 0).toFixed(2));
      pedido = await prisma.pedido.create({
        data: {
          negocioId: NEGOCIO_ID,
          sessionId: 'teste-econf-homologacao',
          status: 'CONFIRMADO',
          total,
          tipoEntrega: 'RETIRADA',
          observacao: 'TESTE HOMOLOGACAO ECONF - venda a prazo (CREDIARIO)',
          itens: {
            create: produtos.map((p) => ({ produtoId: p.id, produtoNome: p.nome, precoUnitario: p.preco, quantidade: 1 })),
          },
          pagamentos: { create: [{ valor: total, metodo: 'CREDIARIO', status: 'PENDENTE' }] },
        },
        select: { id: true, total: true, itens: { select: { produtoNome: true } } },
      });
      dump({ tentativa, pedidoId: pedido.id, total: Number(pedido.total), itens: pedido.itens.map((i) => i.produtoNome) });

      const enfileirado = await fiscal.emitirNFe(NEGOCIO_ID, pedido.id);
      if (!enfileirado) {
        const docFalha = await prisma.documentoFiscal.findUnique({ where: { pedidoId: pedido.id } });
        throw new Error(`emitirNFe devolveu false - ${docFalha?.status}: ${docFalha?.mensagem || 'sem mensagem'}`);
      }

      const inicio = Date.now();
      let atual = null;
      while (Date.now() - inicio < 90000) {
        atual = await prisma.documentoFiscal.findUnique({ where: { pedidoId: pedido.id } });
        if (atual && terminais.includes(atual.status)) break;
        await dormir(2000);
      }
      if (atual && atual.status === 'PENDENTE_CONSULTA') {
        await fiscal.consultarDocumento(NEGOCIO_ID, atual.id).catch((e) => console.warn(`consulta: ${e.message}`));
        await dormir(3000);
        atual = await prisma.documentoFiscal.findUnique({ where: { pedidoId: pedido.id } });
      }
      dump({ status: atual?.status, numero: atual?.numero, chaveAcesso: atual?.chaveAcesso, codigoStatus: atual?.codigoStatus, mensagem: atual?.mensagem });

      if (atual && atual.status === 'REJEITADA' && String(atual.codigoStatus) === '539') {
        tentativas539++;
        const cfg = await prisma.configuracaoFiscal.findUnique({ where: { negocioId: NEGOCIO_ID } });
        const usado = Number(atual.numero || 0);
        const proximo = Math.max(Number(cfg.proximoNumero || 0), usado * 2, usado + 1);
        console.log(`-> numero ${usado} ja registrado na SEFAZ-homologacao; proximoNumero ${cfg.proximoNumero} -> ${proximo}`);
        await prisma.pedido.delete({ where: { id: pedido.id } });
        await prisma.configuracaoFiscal.update({ where: { negocioId: NEGOCIO_ID }, data: { proximoNumero: proximo } });
        pedido = null;
        continue;
      }
      doc = atual;
    }
    check('NFC-e de crediario autorizada (cStat 100)', doc?.status === 'AUTORIZADA' && String(doc?.codigoStatus) === '100');
    if (doc?.status !== 'AUTORIZADA') {
      await prisma.pedido.delete({ where: { id: pedido.id } }).catch(() => {});
      throw new Error(`Autorizacao nao obtida: ${doc?.status} / cStat ${doc?.codigoStatus} / ${doc?.mensagem || ''}`);
    }
    const xmlNfce = String(doc.xmlAssinado || '');
    check('NFC-e usa tPag 91 (pagamento posterior, IN 142/2025-CE)', /<detPag><tPag>91<\/tPag>/.test(xmlNfce));

    titulo('4. Conta a receber vinculada ao pedido');
    const cliente = await prisma.cliente.create({
      data: { nome: 'Cliente Teste ECONF', limiteCredito: Number(pedido.total) },
    });
    const conta = await prisma.contaReceber.create({
      data: {
        clienteId: cliente.id,
        negocioId: NEGOCIO_ID,
        pedidoId: pedido.id,
        valorTotal: Number(pedido.total),
        dataVencimento: new Date(Date.now() + 7 * 86400000),
        status: 'PENDENTE',
      },
    });
    dump({ clienteId: cliente.id, contaId: conta.id, valorTotal: Number(conta.valorTotal) });
    check('conta a receber PENDENTE criada', conta.status === 'PENDENTE');

    const aguardarEconf = async (quantidade, timeoutMs = 120000) => {
      const inicio = Date.now();
      while (Date.now() - inicio < timeoutMs) {
        const eventos = await prisma.fiscalEvento.findMany({
          where: { contaReceberId: conta.id, tipo: '110750', cStat: { in: ['135', '155'] } },
          orderBy: { criadoEm: 'asc' },
        });
        if (eventos.length >= quantidade) return eventos;
        await dormir(3000);
      }
      return prisma.fiscalEvento.findMany({ where: { contaReceberId: conta.id, tipo: '110750' }, orderBy: { criadoEm: 'asc' } });
    };

    titulo('5. Baixa parcial -> ECONF 1 (fila emissao-nfce)');
    const parcial = Number((Number(pedido.total) / 2).toFixed(2));
    const contaParcial = await contas.darBaixa(NEGOCIO_ID, conta.id, { valor: parcial, observacao: 'TESTE ECONF - baixa parcial' });
    dump({ status: contaParcial?.status, valorPago: Number(contaParcial?.valorPago) });
    let eventos = await aguardarEconf(1);
    const ev1 = eventos[0];
    dump({ id: ev1?.id, cStat: ev1?.cStat, xMotivo: ev1?.xMotivo, protocolo: ev1?.protocolo, sequencia: ev1?.sequencia, valor: ev1?.valor != null ? Number(ev1.valor) : null });
    check('ECONF 1 registrado na SEFAZ (cStat 135/155)', !!ev1 && ['135', '155'].includes(String(ev1.cStat)));
    check('ECONF 1 com nSeqEvento 1', !!ev1 && ev1.sequencia === 1);
    check('ECONF 1 concilia exatamente o valor parcial', !!ev1 && Number(ev1.valor) === parcial);
    check('ECONF 1 vinculado a conta e a NFC-e', !!ev1 && ev1.contaReceberId === conta.id && ev1.documentoId === doc.id);
    check('ECONF 1 com protocolo de 15 digitos', !!ev1 && /^\d{15}$/.test(String(ev1.protocolo)));

    titulo('6. Baixa final -> ECONF 2 (nSeqEvento 2)');
    const restante = Number((Number(pedido.total) - parcial).toFixed(2));
    const contaFinal = await contas.darBaixa(NEGOCIO_ID, conta.id, { valor: restante, observacao: 'TESTE ECONF - baixa final' });
    dump({ status: contaFinal?.status, valorPago: Number(contaFinal?.valorPago) });
    eventos = await aguardarEconf(2);
    const ev2 = eventos[1];
    dump({ id: ev2?.id, cStat: ev2?.cStat, xMotivo: ev2?.xMotivo, protocolo: ev2?.protocolo, sequencia: ev2?.sequencia, valor: ev2?.valor != null ? Number(ev2.valor) : null });
    check('ECONF 2 registrado na SEFAZ (cStat 135/155)', !!ev2 && ['135', '155'].includes(String(ev2.cStat)));
    check('ECONF 2 com nSeqEvento 2 (sequencia incrementada)', !!ev2 && ev2.sequencia === 2);
    check('ECONF 2 concilia o valor restante', !!ev2 && Number(ev2.valor) === restante);
    check('soma dos ECONF = total da venda', !!ev1 && !!ev2 && Number(ev1.valor) + Number(ev2.valor) === Number(pedido.total));
    check('conta encerrada como PAGO', contaFinal?.status === 'PAGO' && Number(contaFinal?.valorPago) === Number(pedido.total));

    titulo('7. Leiaute do evento ECONF transmitido');
    const xmlEvento1 = String(ev1?.xmlAssinado || '');
    const xmlResposta1 = String(ev1?.xmlResposta || '');
    const chave = String(doc.chaveAcesso || '');
    check('evento assinado contem tpEvento 110750', /<tpEvento>110750<\/tpEvento>/.test(xmlEvento1));
    check(`Id do evento = ID110750 + chave + 01`, xmlEvento1.includes(`ID110750${chave}01`));
    check('detPag com tPag 01 (dinheiro) e indPag 1', /<indPag>1<\/indPag><tPag>01<\/tPag>/.test(xmlEvento1));
    check('detPag com vPag do valor parcial', xmlEvento1.includes(`<vPag>${parcial.toFixed(2)}</vPag>`));
    check('detPag com dPag (AAAA-MM-DD)', /<dPag>\d{4}-\d{2}-\d{2}<\/dPag>/.test(xmlEvento1));
    check('evento com Signature do certificado A1', /<Signature[\s>]/.test(xmlEvento1));
    check('resposta da SEFAZ registra cStat 135 no retEvento', /<retEvento[\s>]/.test(xmlResposta1) && /<cStat>135<\/cStat>/.test(xmlResposta1));

    titulo('8. Auditoria e idempotencia');
    const auditorias = await prisma.auditLog.count({ where: { negocioId: NEGOCIO_ID, acao: 'fiscal.econf' } });
    check('auditoria fiscal.econf registrada (>= 2)', auditorias >= 2);
    const totalEventos = await prisma.fiscalEvento.count({ where: { contaReceberId: conta.id, tipo: '110750' } });
    check('nenhum evento extra apos conta PAGO (2 ECONF no total)', totalEventos === 2);

    fs.mkdirSync(SAIDA_DIR, { recursive: true });
    fs.writeFileSync(path.join(SAIDA_DIR, 'xml-evento-1.xml'), xmlEvento1);
    fs.writeFileSync(path.join(SAIDA_DIR, 'xml-resposta-1.xml'), xmlResposta1);
    if (ev2?.xmlAssinado) fs.writeFileSync(path.join(SAIDA_DIR, 'xml-evento-2.xml'), String(ev2.xmlAssinado));
    fs.writeFileSync(
      path.join(SAIDA_DIR, 'resumo.json'),
      JSON.stringify(
        {
          pedidoId: pedido.id,
          documentoId: doc.id,
          contaId: conta.id,
          clienteId: cliente.id,
          chave,
          numero: doc.numero,
          serie: doc.serie,
          vendaAprazo: { metodo: 'CREDIARIO', tPag: '91', total: Number(pedido.total) },
          baixas: [
            { valor: parcial, eventoId: ev1?.id, cStat: ev1?.cStat, nSeq: ev1?.sequencia, protocolo: ev1?.protocolo },
            { valor: restante, eventoId: ev2?.id, cStat: ev2?.cStat, nSeq: ev2?.sequencia, protocolo: ev2?.protocolo },
          ],
          checks: checks.map(([nome, ok]) => ({ nome, ok })),
        },
        null,
        2,
      ),
    );
    titulo(`Artefatos gravados em ${SAIDA_DIR}`);
    testeOk = true;
  } catch (e) {
    erro = e;
  } finally {
    if (app) {
      if (snapshot) {
        const prisma = app.get(PrismaService, { strict: false });
        await prisma.configuracaoFiscal.update({
          where: { negocioId: NEGOCIO_ID },
          data: snapshot,
        }).catch(() => {});
        titulo(`Configuracao restaurada: ambiente=${snapshot.ambiente}, ativo=${snapshot.ativo}`);
      }
      await app.close().catch(() => {});
    }
  }

  titulo('RESULTADO FINAL');
  dump(checks.map(([nome, ok]) => `${ok ? 'OK  ' : 'FALHA'} ${nome}`));
  if (erro) {
    console.error(`\nERRO: ${erro.message}`);
    process.exit(1);
  }
  const falhas = checks.filter(([, ok]) => !ok);
  if (falhas.length) {
    console.error(`\n${falhas.length} validacao(oes) falharam`);
    process.exit(1);
  }
  if (!testeOk) {
    console.error('\nTeste nao concluido');
    process.exit(1);
  }
  console.log('\nTodas as validacoes passaram.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
