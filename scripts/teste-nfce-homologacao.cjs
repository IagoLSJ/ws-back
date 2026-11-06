require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');

const NEGOCIO_ID = process.env.NEGOCIO_ID || '6ac0fc1c-2659-4dc0-a296-a0f116dfd1b0';
const CNPJ_EMITENTE = '10976019000121';
const SAIDA_DIR = path.join(__dirname, 'saida-homologacao');
const MOTIVO_CANCELAMENTO = 'TESTE HOMOLOGACAO - validacao DANFE e QR Code';

function titulo(t) {
  console.log(`\n========== ${t}`);
}

function dump(v) {
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}

function dvChave(chave43) {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto === 0 || resto === 1 ? 0 : 11 - resto;
}

const eanValido = (v) => !v || /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(String(v).trim());

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL).host;
  titulo(`Banco alvo: ${dbHost}`);
  if (/localhost|127\.0\.0\.1/i.test(dbHost)) {
    throw new Error('Este teste foi aprovado para o banco de produção (Neon) — DATABASE_URL aponta para localhost');
  }
  if (!process.env.FISCAL_ENCRYPTION_KEY) throw new Error('FISCAL_ENCRYPTION_KEY ausente no ambiente');

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/src/app.module.js');
  const { PrismaService } = require('../dist/src/infra/database/prisma.service.js');
  const { FiscalService } = require('../dist/src/modules/fiscal/fiscal.service.js');
  const { ImprimirService } = require('../dist/src/modules/imprimir/imprimir.service.js');

  const checks = [];
  const check = (nome, ok) => {
    checks.push([nome, !!ok]);
    console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}`);
  };

  let app = null;
  let erro = null;
  let testeOk = false;

  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const prisma = app.get(PrismaService, { strict: false });
    const fiscal = app.get(FiscalService, { strict: false });
    const imprimir = app.get(ImprimirService, { strict: false });

    const original = await prisma.configuracaoFiscal.findUnique({ where: { negocioId: NEGOCIO_ID } });
    if (!original) throw new Error(`Configuracao fiscal do negocio ${NEGOCIO_ID} nao encontrada`);

    titulo('1. Configuracao original');
    dump({
      ambiente: original.ambiente,
      ativo: original.ativo,
      serie: original.serie,
      proximoNumero: original.proximoNumero,
      certificadoNome: original.certificadoNome,
      certificadoValidade: original.certificadoValidade,
    });

    try {
      await prisma.configuracaoFiscal.update({ where: { negocioId: NEGOCIO_ID }, data: { ambiente: 'HOMOLOGACAO' } });
      titulo('2. Ambiente trocado para HOMOLOGACAO');

      const somenteCancelar = process.env.SOMENTE_CANCELAR === '1';
      let doc = null;
      let pedido = null;

      if (somenteCancelar) {
        titulo('3-8. SOMENTE_CANCELAR=1 (pula pre-requisitos, testarSefaz, ativarEmissao e emissao)');
        doc = await prisma.documentoFiscal.findFirst({
          where: { negocioId: NEGOCIO_ID, ambiente: 'HOMOLOGACAO', status: 'AUTORIZADA' },
          orderBy: { criadoEm: 'desc' },
        });
        if (!doc) throw new Error('Nenhuma NFC-e homologada AUTORIZADA para cancelar');
        pedido = await prisma.pedido.findUnique({
          where: { id: doc.pedidoId },
          select: { id: true, total: true, itens: { select: { produtoNome: true } } },
        });
        if (!pedido) throw new Error(`Pedido ${doc.pedidoId} da NFC-e nao encontrado`);
        dump({
          status: doc.status,
          numero: doc.numero,
          serie: doc.serie,
          chaveAcesso: doc.chaveAcesso,
          protocolo: doc.protocolo,
          codigoStatus: doc.codigoStatus,
          mensagem: doc.mensagem,
          pedidoId: pedido.id,
          itens: pedido.itens.map((i) => i.produtoNome),
        });
        check('NFC-e homologada AUTORIZADA localizada sem nova emissao', doc.status === 'AUTORIZADA' && String(doc.codigoStatus) === '100');
      } else {
        titulo('3. testarConfiguracao (pre-requisitos');
        const verificacao = await fiscal.testarConfiguracao(NEGOCIO_ID);
        dump(verificacao);
        check('pre-requisitos fiscais sem pendencias', !verificacao.pendencias?.length);

        titulo('4. testarSefaz (certificado A1 + CA ICP-Brasil)');
        const sefaz = await fiscal.testarSefaz(NEGOCIO_ID);
        dump(sefaz);
        check('SEFAZ respondeu usando o A1', !!sefaz.conectado && !!sefaz.cStat);

        titulo('5. ativarEmissao em homologacao');
        const cfgAtiva = await fiscal.ativarEmissao(NEGOCIO_ID);
        dump({ ativo: cfgAtiva.ativo, ambiente: cfgAtiva.ambiente });
        check('emissao ativada em homologacao', cfgAtiva.ativo === true);

        titulo('6. emitirNFe com retry de duplicidade 539 (fila emissao-nfce)');
        const terminais = ['AUTORIZADA', 'REJEITADA', 'ERRO', 'CANCELADA'];
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
              sessionId: 'teste-homologacao-nfce',
              status: 'CONFIRMADO',
              total,
              tipoEntrega: 'RETIRADA',
              observacao: 'TESTE HOMOLOGACAO NFC-e - validacao DANFE/QR Code',
              itens: {
                create: produtos.map((p) => ({ produtoId: p.id, produtoNome: p.nome, precoUnitario: p.preco, quantidade: 1 })),
              },
              pagamentos: { create: [{ valor: total, metodo: 'DINHEIRO', status: 'APROVADO' }] },
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
            await new Promise((r) => setTimeout(r, 2000));
          }
          if (atual && atual.status === 'PENDENTE_CONSULTA') {
            await fiscal.consultarDocumento(NEGOCIO_ID, atual.id).catch((e) => console.warn(`consulta: ${e.message}`));
            await new Promise((r) => setTimeout(r, 3000));
            atual = await prisma.documentoFiscal.findUnique({ where: { pedidoId: pedido.id } });
          }
          dump({
            status: atual?.status,
            numero: atual?.numero,
            serie: atual?.serie,
            chaveAcesso: atual?.chaveAcesso,
            protocolo: atual?.protocolo,
            codigoStatus: atual?.codigoStatus,
            mensagem: atual?.mensagem,
            tentativas: atual?.tentativas,
          });

          if (atual && atual.status === 'REJEITADA' && String(atual.codigoStatus) === '539') {
            tentativas539++;
            const cfg = await prisma.configuracaoFiscal.findUnique({ where: { negocioId: NEGOCIO_ID } });
            const usado = Number(atual.numero || 0);
            const proximo = Math.max(Number(cfg.proximoNumero || 0), usado * 2, usado + 1);
            console.log(`-> numero ${usado} ja registrado na SEFAZ-homologacao; proximoNumero ${cfg.proximoNumero} -> ${proximo}`);
            await prisma.pedido.delete({ where: { id: pedido.id } });
            await prisma.configuracaoFiscal.update({ where: { negocioId: NEGOCIO_ID }, data: { proximoNumero: proximo } });
            continue;
          }
          doc = atual;
        }

        check('NFC-e emitida sem duplicidade de numeracao', !!doc);
        check('NFC-e autorizada (cStat 100)', doc?.status === 'AUTORIZADA' && String(doc?.codigoStatus) === '100');
        if (doc?.status !== 'AUTORIZADA') {
          throw new Error(`Autorizacao nao obtida: ${doc?.status} / cStat ${doc?.codigoStatus} / ${doc?.mensagem || ''}`);
        }
        console.log(`numeracao livre encontrada apos ${tentativas539} colisao(oes) de numeracao`);
      }

      titulo('9. Validacoes do DANFE/QR Code');
      const chave = String(doc.chaveAcesso || '');
      check('chave de acesso com 44 digitos', /^\d{44}$/.test(chave));
      check('DV da chave (modulo 11) confere', chave.length === 44 && dvChave(chave.slice(0, 43)) === Number(chave[43]));
      check('chave = cUF 23 + CNPJ emitente + modelo 65', chave.startsWith('23') && chave.slice(6, 20) === CNPJ_EMITENTE && chave.slice(20, 22) === '65');
      check('protocolo de autorizacao gravado', !!doc.protocolo);

      const xmlAutorizado = String(doc.xmlAutorizado || '');
      const xmlAssinado = String(doc.xmlAssinado || '');
      check('XML autorizado contem protNFe/nProt', /<protNFe[\s>]/.test(xmlAutorizado) && /<nProt>\d{15}<\/nProt>/.test(xmlAutorizado));
      check('XML autorizado referencia a chave', xmlAutorizado.includes(chave));
      check('XML assinado contem infNFeSupl/qrCode', /<infNFeSupl><qrCode>/.test(xmlAssinado));

      const qr = String(doc.qrCodeUrl || '');
      const padraoQr = new RegExp(`^http://nfceh\\.sefaz\\.ce\\.gov\\.br/pages/ShowNFCe\\.html\\?p=${chave}\\|(2\\|2\\|\\d+\\|[0-9a-fA-F]{40}|3\\|2)$`);
      check('qrCodeUrl no padrao SEFAZ-CE homologacao', padraoQr.test(qr));

      let statusHttp = 0;
      try {
        const resp = await fetch(qr, {
          signal: AbortSignal.timeout(20000),
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        statusHttp = resp.status;
      } catch (e) {
        statusHttp = `erro: ${e.message}`;
      }
      dump({ qrCodeUrl: qr, httpStatus: statusHttp });
      check('QR Code responde na SEFAZ-CE (HTTP < 400)', typeof statusHttp === 'number' && statusHttp < 400);

      const { html } = await imprimir.imprimirCupom(NEGOCIO_ID, pedido.id, undefined);
      const htmlPlano = html.replace(/[\s-]/g, '');
      check('cupom/DANFE exibe "DANFE NFC-e"', html.includes('DANFE NFC-e'));
      check('cupom/DANFE exibe a chave de acesso', htmlPlano.includes(chave));
      check('cupom/DANFE exibe o protocolo', !!doc.protocolo && html.includes(doc.protocolo));
      check('cupom/DANFE exibe a imagem do QR Code', html.includes('alt="QR Code NFC-e"') && html.includes(qr));

      fs.mkdirSync(SAIDA_DIR, { recursive: true });
      fs.writeFileSync(path.join(SAIDA_DIR, 'xml-autorizado.xml'), xmlAutorizado);
      fs.writeFileSync(path.join(SAIDA_DIR, 'xml-assinado.xml'), xmlAssinado);
      fs.writeFileSync(path.join(SAIDA_DIR, 'cupom-danfe.html'), html);
      titulo(`Artefatos gravados em ${SAIDA_DIR}`);

      titulo('10. Cancelando a NFC-e de homologacao');
      const cancelado = await fiscal.cancelarDocumento(NEGOCIO_ID, doc.id, MOTIVO_CANCELAMENTO);
      dump({
        status: cancelado.status,
        codigoStatus: cancelado.codigoStatus,
        mensagem: cancelado.mensagem,
        protocolo: cancelado.protocolo,
      });
      check('documento cancelado (cStat 135/155)', cancelado.status === 'CANCELADA' && ['135', '155'].includes(String(cancelado.codigoStatus)));
      const evento = await prisma.fiscalEvento.findFirst({ where: { documentoId: doc.id, tipo: '110111' } });
      check('evento 110111 registrado na SEFAZ', !!evento && ['135', '155'].includes(String(evento.cStat)));

      fs.writeFileSync(
        path.join(SAIDA_DIR, 'resumo.json'),
        JSON.stringify(
          {
            pedidoId: pedido.id,
            documentoId: doc.id,
            chave,
            numero: doc.numero,
            serie: doc.serie,
            protocolo: doc.protocolo,
            qrCodeUrl: qr,
            qrHttp: statusHttp,
            cancelamento: { status: cancelado.status, cStat: cancelado.codigoStatus },
            checks: checks.map(([nome, ok]) => ({ nome, ok })),
          },
          null,
          2,
        ),
      );
      testeOk = true;
    } finally {
      await prisma.configuracaoFiscal.update({
        where: { negocioId: NEGOCIO_ID },
        data: { ambiente: original.ambiente, ativo: original.ativo },
      });
      titulo(`11. Configuracao restaurada: ambiente=${original.ambiente}, ativo=${original.ativo}`);
    }

    if (testeOk) {
      titulo('12. Gate de producao (consultas espelho do ativarEmissao)');
      const nota = await prisma.documentoFiscal.findFirst({
        where: { negocioId: NEGOCIO_ID, ambiente: 'HOMOLOGACAO', status: { in: ['AUTORIZADA', 'CANCELADA'] } },
        select: { id: true },
      });
      const cancel = nota
        ? await prisma.fiscalEvento.findFirst({
            where: {
              negocioId: NEGOCIO_ID,
              tipo: '110111',
              cStat: { in: ['135', '155'] },
              documentoId: { not: null },
              documento: { ambiente: 'HOMOLOGACAO' },
            },
            select: { id: true },
          })
        : null;
      check('gate 1: NFC-e homologada autorizada/cancelada existe', !!nota);
      check('gate 2: cancelamento homologado registrado', !!cancel);
      dump({ notaHomologada: nota?.id, cancelamento: cancel?.id });
    }
  } catch (e) {
    erro = e;
  } finally {
    if (app) await app.close().catch(() => {});
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
  console.log('\nTodas as validacoes passaram.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
