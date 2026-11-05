import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { FiscalService } from './fiscal.service';
import { PrismaService } from '../../infra/database/prisma.service';
import { SefazCeClient } from './sefaz-ce.client';
import { SvrsNfceClient } from './svrs-nfce.client';

function configFiscal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg1',
    negocioId: 'neg1',
    ambiente: 'HOMOLOGACAO',
    regime: 'SIMPLES_NACIONAL',
    cnpj: '11222333000181',
    ie: '060000015',
    razaoSocial: 'WALKER SALGADOS LTDA',
    endereco: { logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Fortaleza', estado: 'CE', cep: '60000000', codigoMunicipio: '2304400' },
    serie: 1,
    proximoNumero: 1,
    cscId: '1',
    cscCriptografado: 'csc',
    certificadoA1Criptografado: 'pfx',
    certificadoSenhaCriptografada: 'senha',
    certificadoValidade: new Date(Date.now() + 86400000),
    permitirContingencia: false,
    ativo: true,
    ...overrides,
  };
}

function pedido(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pedido1',
    negocioId: 'neg1',
    total: 25,
    tipoEntrega: 'RETIRADA',
    observacao: null,
    clienteCpf: null,
    clienteNome: null,
    endereco: null,
    negocio: { tipo: 'VAREJO', nome: 'Loja', cidade: 'Fortaleza' },
    itens: [{ produtoNome: 'Salgado', quantidade: 2, precoUnitario: 12.5, produto: {
      ncm: '21069090', cfop: '5102', unidadeMedida: 'UN', codigoBarras: null, origem: 0, csosn: '102',
      cstPis: '06', cstCofins: '06',
      aliqTributosFederais: 10, aliqTributosEstaduais: 5, aliqTributosMunicipais: 0,
      fonteTributosAproximados: 'IBPT', vigenciaTributosAproximados: new Date('2026-10-01'),
    } }],
    pagamentos: [{ metodo: 'DINHEIRO', valor: 25, status: 'APROVADO', dadosPagamento: null }],
    ...overrides,
  };
}

describe('FiscalService', () => {
  let service: FiscalService;
  let prisma: any;
  let queue: any;
  let gateway: any;

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ numero: 5 }]),
      negocio: { findUnique: jest.fn().mockResolvedValue({ id: 'neg1' }) },
      configuracaoFiscal: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      documentoFiscal: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'doc1' }),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({ id: 'doc1' }),
      },
      pedido: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      produto: { findMany: jest.fn().mockResolvedValue([]) },
      fiscalEvento: { create: jest.fn().mockResolvedValue({ id: 'ev1' }), findFirst: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    queue = { add: jest.fn().mockResolvedValue({}) };
    gateway = {
      emitir: jest.fn(),
      gerarXmlContingencia: jest.fn(),
      reenviar: jest.fn(),
      cancelar: jest.fn(),
      consultar: jest.fn(),
      inutilizar: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FiscalService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => 'a'.repeat(64) } },
        { provide: SefazCeClient, useValue: { consultarStatus: jest.fn() } },
        { provide: SvrsNfceClient, useValue: gateway },
        { provide: getQueueToken('emissao-nfce'), useValue: queue },
      ],
    }).compile();

    service = moduleRef.get(FiscalService);
    service.setGateway(gateway);
    (service as any).descriptografar = (v: string) => v;
  });

  it('emitirNFe é idempotente para documento já autorizado', async () => {
    prisma.pedido.findUnique.mockResolvedValue(pedido());
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal());
    prisma.documentoFiscal.findUnique.mockResolvedValue({ id: 'doc1', status: 'AUTORIZADA' });

    await expect(service.emitirNFe('neg1', 'pedido1')).resolves.toBe(true);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('emitirNFe reserva numeração e enfileira transmissão', async () => {
    prisma.pedido.findUnique.mockResolvedValue(pedido());
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal());
    prisma.documentoFiscal.findUnique.mockResolvedValue(null);

    await expect(service.emitirNFe('neg1', 'pedido1')).resolves.toBe(true);
    expect(prisma.documentoFiscal.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ numero: 5, serie: 1, status: 'PROCESSANDO' }) }),
    );
    expect(queue.add).toHaveBeenCalledWith('transmitir', { documentoId: 'doc1' }, expect.any(Object));
  });

  it('emitirNFe bloqueia entrega sem CPF e deixa documento pendente', async () => {
    prisma.pedido.findUnique.mockResolvedValue(pedido({ tipoEntrega: 'ENTREGA' }));
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal());
    prisma.documentoFiscal.findUnique.mockResolvedValue(null);

    await expect(service.emitirNFe('neg1', 'pedido1')).resolves.toBe(false);
    expect(prisma.documentoFiscal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ mensagem: expect.stringContaining('entrega') }) }),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('mapeia um CNPJ de destinatário para a tag CNPJ, não para CPF', () => {
    const params = (service as any).montarParams(pedido({ clienteCpf: '11222333000181' }), configFiscal());
    expect(params.destinatario).toMatchObject({ cnpj: '11222333000181' });
    expect(params.destinatario.cpf).toBeUndefined();
  });

  it('emitirNFe sem configuração fiscal não cria documento', async () => {
    prisma.pedido.findUnique.mockResolvedValue(pedido());
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(null);
    await expect(service.emitirNFe('neg1', 'pedido1')).resolves.toBe(false);
    expect(prisma.documentoFiscal.upsert).not.toHaveBeenCalled();
  });

  it('não enfileira emissão quando a configuração fiscal está desativada', async () => {
    prisma.pedido.findUnique.mockResolvedValue(pedido());
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal({ ativo: false }));
    prisma.documentoFiscal.findUnique.mockResolvedValue(null);

    await expect(service.emitirNFe('neg1', 'pedido1')).resolves.toBe(false);
    expect(prisma.documentoFiscal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ mensagem: expect.stringContaining('desativada') }) }),
    );
    expect(queue.add).not.toHaveBeenCalledWith('transmitir', expect.anything(), expect.anything());
  });

  it('retém crediário em produção até existir o fluxo de conciliação ECONF', () => {
    const venda = pedido({ pagamentos: [{ metodo: 'CREDIARIO', valor: 25, status: 'PENDENTE', dadosPagamento: null }] });
    const erro = (service as any).validarEmissaoLocal(venda, 'SIMPLES_NACIONAL', configFiscal().endereco, 'PRODUCAO');
    expect(erro).toContain('ECONF');
  });

  it.each(['1', '2'])('valida cartão com tpIntegra=%s e registra a NFC-e como integrada', (tpIntegra) => {
    const venda = pedido({ pagamentos: [{
      metodo: 'CARTAO_CREDITO',
      valor: 25,
      status: 'APROVADO',
      dadosPagamento: {
        tpIntegra,
        cnpj: '08561701000101',
        tBand: '06',
        cAut: 'AUT123456',
        idTermPag: 'POS-01',
      },
    }] });

    const erro = (service as any).validarEmissaoLocal(venda, 'SIMPLES_NACIONAL', configFiscal().endereco, 'HOMOLOGACAO');
    const pagamento = (service as any).montarParams(venda, configFiscal()).pagamentos[0];

    expect(erro).toBeNull();
    expect(pagamento.card).toEqual({
      tpIntegra: '1',
      CNPJ: '08561701000101',
      tBand: '06',
      cAut: 'AUT123456',
      idTermPag: 'POS-01',
    });
  });

  it('mapeia PIX para tPag 20 e não monta o grupo card', () => {
    const venda = pedido({ pagamentos: [{ metodo: 'PIX', valor: 25, status: 'APROVADO', dadosPagamento: null }] });

    const erro = (service as any).validarEmissaoLocal(venda, 'SIMPLES_NACIONAL', configFiscal().endereco, 'HOMOLOGACAO');
    const pagamento = (service as any).montarParams(venda, configFiscal()).pagamentos[0];

    expect(erro).toBeNull();
    expect(pagamento.tPag).toBe('20');
    expect(pagamento.card).toBeUndefined();
  });

  it('bloqueia emissão quando o CNPJ da adquirente do cartão é inválido', () => {
    const venda = pedido({ pagamentos: [{
      metodo: 'CARTAO_DEBITO',
      valor: 25,
      status: 'APROVADO',
      dadosPagamento: { tpIntegra: '2', cnpj: '11111111111111', cAut: 'AUT123456' },
    }] });

    const erro = (service as any).validarEmissaoLocal(venda, 'SIMPLES_NACIONAL', configFiscal().endereco, 'HOMOLOGACAO');

    expect(erro).toContain('CNPJ da instituição de pagamento inválido');
  });

  it('bloqueia pagamento com cartão sem tipo de integração', () => {
    const venda = pedido({ pagamentos: [{
      metodo: 'CARTAO_CREDITO',
      valor: 25,
      status: 'APROVADO',
      dadosPagamento: { cnpj: '08561701000101', cAut: 'AUT123456' },
    }] });

    const erro = (service as any).validarEmissaoLocal(venda, 'SIMPLES_NACIONAL', configFiscal().endereco, 'HOMOLOGACAO');

    expect(erro).toContain('tipo de integração');
  });

  it('transmitirDocumento grava rejeição com cStat/xMotivo e não re-tenta automaticamente', async () => {
    const doc = {
      id: 'doc1', pedidoId: 'pedido1', negocioId: 'neg1', status: 'PROCESSANDO', numero: 5, serie: 1, chaveAcesso: null, xmlAssinado: null, mensagem: null,
      configuracao: configFiscal(), pedido: pedido(),
    };
    prisma.documentoFiscal.findUnique.mockResolvedValue(doc);
    gateway.emitir.mockResolvedValue({ status: 'REJEITADA', numeroNfe: 5, serieNfe: 1, chaveAcesso: '9'.repeat(44), cStat: '215', xMotivo: 'NF-e já existente no banco de dados', xmlAssinado: '<NFe/>' });

    await service.transmitirDocumento('doc1');
    expect(prisma.documentoFiscal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'doc1' }, data: expect.objectContaining({ status: 'REJEITADA', codigoStatus: '215', mensagem: 'NF-e já existente no banco de dados' }) }),
    );
  });

  it('falha de rede não cria contingência NFC-e no Ceará', async () => {
    const doc = {
      id: 'doc1', pedidoId: 'pedido1', negocioId: 'neg1', status: 'PROCESSANDO', numero: 5, serie: 1, chaveAcesso: null, xmlAssinado: null, mensagem: null,
      configuracao: configFiscal(), pedido: pedido(),
    };
    prisma.documentoFiscal.findUnique.mockResolvedValue(doc);
    gateway.emitir.mockResolvedValue({ status: 'ERRO_REDE', numeroNfe: 5, serieNfe: 1, chaveAcesso: '9'.repeat(44), xmlAssinado: '<NFe/>', xMotivo: 'Timeout na operação NfeAutorizacao4' });
    gateway.gerarXmlContingencia.mockReturnValue({ xml: '<NFeCont/>', chave: '1'.repeat(44) });

    await expect(service.transmitirDocumento('doc1')).rejects.toThrow(/Timeout/);
    expect(prisma.documentoFiscal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ERRO', mensagem: expect.stringContaining('Timeout') }) }),
    );
    expect(gateway.gerarXmlContingencia).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalledWith('reenviar', { documentoId: 'doc1' }, expect.any(Object));
  });

  it('cancelamento fora do prazo de 24h em produção é bloqueado', async () => {
    prisma.documentoFiscal.findFirst.mockResolvedValue({
      id: 'doc1', pedidoId: 'pedido1', negocioId: 'neg1', status: 'AUTORIZADA', chaveAcesso: '9'.repeat(44), numero: 5, serie: 1,
      ambiente: 'PRODUCAO', authorizedEm: new Date(Date.now() - 25 * 60 * 60 * 1000), criadoEm: new Date(Date.now() - 25 * 60 * 60 * 1000),
      configuracao: configFiscal(),
    });
    await expect(service.cancelarDocumento('neg1', 'doc1', 'Cliente desistiu da compra do pedido')).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.cancelar).not.toHaveBeenCalled();
  });

  it('cancelamento registrado persiste evento 110111', async () => {
    prisma.documentoFiscal.findFirst.mockResolvedValue({
      id: 'doc1', pedidoId: 'pedido1', negocioId: 'neg1', status: 'AUTORIZADA', chaveAcesso: '9'.repeat(44), numero: 5, serie: 1,
      ambiente: 'HOMOLOGACAO', authorizedEm: new Date(), criadoEm: new Date(), protocolo: '123', configuracao: configFiscal(),
    });
    gateway.cancelar.mockResolvedValue({ cStat: '135', xMotivo: 'Evento registrado e vinculado', protocolo: '999', xmlEvento: '<evento/>', xmlResposta: '<ret/>' });

    await service.cancelarDocumento('neg1', 'doc1', 'Cliente desistiu da compra do pedido');
    expect(prisma.fiscalEvento.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo: '110111', cStat: '135' }) }));
    expect(prisma.documentoFiscal.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELADA' }) }));
  });

  it('não considera o retorno do lote 128 como cancelamento confirmado', async () => {
    prisma.documentoFiscal.findFirst.mockResolvedValue({
      id: 'doc1', pedidoId: 'pedido1', negocioId: 'neg1', status: 'AUTORIZADA', chaveAcesso: '9'.repeat(44), numero: 5, serie: 1,
      ambiente: 'HOMOLOGACAO', authorizedEm: new Date(), criadoEm: new Date(), protocolo: '123', configuracao: configFiscal(),
    });
    gateway.cancelar.mockResolvedValue({ cStat: '128', xMotivo: 'Lote processado', xmlEvento: '<evento/>', xmlResposta: '<ret/>' });

    await expect(service.cancelarDocumento('neg1', 'doc1', 'Cliente desistiu da compra do pedido')).rejects.toThrow(/SEFAZ rejeitou/);
    expect(prisma.documentoFiscal.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELADA' }) }));
  });

  it('salvarConfiguracao rejeita CNPJ com dígitos verificadores inválidos', async () => {
    const dto = {
      regime: 'SIMPLES_NACIONAL',
      cnpj: '11111111111111',
      ie: '060000015',
      razaoSocial: 'Razão',
      endereco: { logradouro: 'Rua', numero: '1', bairro: 'Centro', cidade: 'Fortaleza', estado: 'CE', cep: '60000000', codigoMunicipio: '2304400' },
    } as any;
    await expect(service.salvarConfiguracao('neg1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a validação local não marca pronto um catálogo sem estimativas tributárias vigentes', async () => {
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal());
    prisma.produto.findMany.mockResolvedValue([{
      nome: 'Salgado', ncm: '21069090', cfop: '5102', csosn: '102',
      aliqTributosFederais: null, aliqTributosEstaduais: null, aliqTributosMunicipais: null,
      fonteTributosAproximados: null, vigenciaTributosAproximados: null,
    }]);

    const resultado = await service.testarConfiguracao('neg1');
    expect(resultado.prontoParaTransmitir).toBe(false);
    expect(resultado.pendencias.join(' ')).toContain('sem estimativa tributária');
  });

  it('bloqueia ativação em produção no regime normal sem o grupo IBS/CBS da RTC', async () => {
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal({ ambiente: 'PRODUCAO', regime: 'REGIME_NORMAL' }));
    prisma.produto.findMany.mockResolvedValue([]);

    const resultado = await service.testarConfiguracao('neg1');
    expect(resultado.pendencias.join(' ')).toContain('IBS/CBS');
    expect(resultado.prontoParaTransmitir).toBe(false);
  });

  it('ativa a emissão explicitamente após checar os pré-requisitos locais', async () => {
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal({ ativo: false }));
    prisma.produto.findMany.mockResolvedValue([]);
    prisma.configuracaoFiscal.update.mockResolvedValue(configFiscal({ ativo: true }));

    await service.ativarEmissao('neg1');

    expect(prisma.configuracaoFiscal.update).toHaveBeenCalledWith({
      where: { negocioId: 'neg1' },
      data: { ativo: true },
    });
  });

  it('exige autorização e cancelamento em homologação antes de ativar produção', async () => {
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal({ ambiente: 'PRODUCAO', ativo: false }));
    prisma.produto.findMany.mockResolvedValue([]);
    prisma.documentoFiscal.findFirst.mockResolvedValue(null);

    await expect(service.ativarEmissao('neg1')).rejects.toThrow(/emita e autorize uma NFC-e em homologação/);
    expect(prisma.configuracaoFiscal.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { ativo: true } }));
  });

  it('recupera autorização comprovada no XML quando uma consulta posterior marcou a NFC-e como erro', async () => {
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal({ ambiente: 'PRODUCAO', ativo: false }));
    prisma.produto.findMany.mockResolvedValue([]);
    prisma.documentoFiscal.findFirst.mockResolvedValue(null);
    prisma.documentoFiscal.findMany.mockResolvedValue([{
      id: 'doc-homolog',
      chaveAcesso: '2'.repeat(44),
      xmlAutorizado: `<retEnviNFe><protNFe><infProt><chNFe>${'2'.repeat(44)}</chNFe><nProt>323260000269878</nProt><cStat>100</cStat></infProt></protNFe></retEnviNFe>`,
    }]);
    prisma.fiscalEvento.findFirst.mockResolvedValue({ cStat: '135', xMotivo: 'Evento registrado e vinculado' });

    await service.ativarEmissao('neg1');

    expect(prisma.documentoFiscal.update).toHaveBeenCalledWith({
      where: { id: 'doc-homolog' },
      data: expect.objectContaining({
        status: 'CANCELADA',
        protocolo: '323260000269878',
        codigoStatus: '135',
      }),
    });
    expect(prisma.configuracaoFiscal.update).toHaveBeenCalledWith({
      where: { negocioId: 'neg1' },
      data: { ativo: true },
    });
  });

  it('não rebaixa autorização registrada no XML quando a consulta SEFAZ retorna 217', async () => {
    const chave = '2'.repeat(44);
    prisma.documentoFiscal.findFirst.mockResolvedValue({
      id: 'doc1',
      negocioId: 'neg1',
      pedidoId: 'pedido1',
      status: 'ERRO',
      numero: 44,
      serie: 1,
      chaveAcesso: chave,
      protocolo: null,
      xmlAutorizado: `<retEnviNFe><protNFe><infProt><chNFe>${chave}</chNFe><nProt>323260000269878</nProt><cStat>100</cStat></infProt></protNFe></retEnviNFe>`,
      configuracao: configFiscal(),
    });
    gateway.consultar.mockResolvedValue({ status: '217', cStat: '217', xMotivo: 'NF-e não consta na base de dados da SEFAZ' });
    prisma.fiscalEvento.findFirst.mockResolvedValue({ cStat: '135', xMotivo: 'Evento registrado e vinculado' });
    prisma.documentoFiscal.update.mockResolvedValue({ id: 'doc1', status: 'CANCELADA' });

    const resultado = await service.consultarDocumento('neg1', 'doc1');

    expect(prisma.documentoFiscal.update).toHaveBeenCalledWith({
      where: { id: 'doc1' },
      data: expect.objectContaining({
        status: 'CANCELADA',
        protocolo: '323260000269878',
        codigoStatus: '135',
      }),
    });
    expect(resultado).toMatchObject({ status: 'CANCELADA', statusSefaz: '217' });
  });

  it('aceita nota homologada cancelada (autorizada e depois cancelada) para ativar produção', async () => {
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal({ ambiente: 'PRODUCAO', ativo: false }));
    prisma.produto.findMany.mockResolvedValue([]);
    prisma.documentoFiscal.findFirst.mockResolvedValue({ id: 'doc1' });
    prisma.fiscalEvento.findFirst.mockResolvedValue({ id: 'ev1' });

    await service.ativarEmissao('neg1');

    expect(prisma.documentoFiscal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ambiente: 'HOMOLOGACAO',
          status: { in: ['AUTORIZADA', 'CANCELADA'] },
        }),
      }),
    );
    expect(prisma.fiscalEvento.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tipo: '110111',
          cStat: { in: ['135', '155'] },
          documentoId: { not: null },
          documento: { ambiente: 'HOMOLOGACAO' },
        }),
      }),
    );
    expect(prisma.configuracaoFiscal.update).toHaveBeenCalledWith({
      where: { negocioId: 'neg1' },
      data: { ativo: true },
    });
  });

  it('bloqueia ativação em produção sem evento de cancelamento em homologação', async () => {
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal({ ambiente: 'PRODUCAO', ativo: false }));
    prisma.produto.findMany.mockResolvedValue([]);
    prisma.documentoFiscal.findFirst.mockResolvedValue({ id: 'doc1' });
    prisma.fiscalEvento.findFirst.mockResolvedValue(null);

    await expect(service.ativarEmissao('neg1')).rejects.toThrow(/valide também o cancelamento/);
    expect(prisma.configuracaoFiscal.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { ativo: true } }));
  });

  it('inutilização exige justificativa mínima e faixa válida', async () => {
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal({ proximoNumero: 50 }));
    await expect(service.inutilizarNumeros('neg1', 1, 10, 11, 'curta')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.inutilizarNumeros('neg1', 1, 40, 60, 'numeros nao utilizados na operacao')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recovery manual filtra documentos pelo negócio autenticado', async () => {
    await service.recuperarPendentes('neg1');
    expect(prisma.documentoFiscal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ negocioId: 'neg1' }) }),
    );
  });

  it('inutilização bem-sucedida registra evento e auditoria', async () => {
    prisma.configuracaoFiscal.findUnique.mockResolvedValue(configFiscal({ proximoNumero: 50 }));
    prisma.documentoFiscal.findFirst.mockResolvedValue(null);
    gateway.inutilizar.mockResolvedValue({ cStat: '102', xMotivo: 'Inutilização de número homologada', protocolo: '1', xmlEvento: '<inut/>', xmlResposta: '<ret/>' });

    await expect(service.inutilizarNumeros('neg1', 1, 10, 12, 'numeros nao utilizados na operacao')).resolves.toEqual({ cStat: '102', xMotivo: 'Inutilização de número homologada', protocolo: '1' });
    expect(prisma.fiscalEvento.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo: '110112', numeroInicial: 10, numeroFinal: 12 }) }));
  });
});
