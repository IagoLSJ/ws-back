import { BadRequestException, HttpException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Prisma, FiscalAmbiente, FiscalStatusDocumento } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';
import { EmitirNFeParams, INfeGateway, NFeItem, NFePagamento, NFeTransmissaoContexto, NFeResultado } from './nfe-gateway.interface';
import { SalvarCertificadoA1Dto } from './dto/salvar-certificado-a1.dto';
import { SalvarConfiguracaoFiscalDto } from './dto/salvar-configuracao-fiscal.dto';
import { SefazCeClient } from './sefaz-ce.client';
import { SvrsNfceClient } from './svrs-nfce.client';
import { lerInfoCertificadoA1 } from './certificado-a1';
import { baseCnpj, digitsOnly, validarCnpj, validarCpf } from './fiscal.utils';

const PRAZO_CANCELAMENTO_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FiscalService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FiscalService.name);
  private gateway: INfeGateway | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private sefazCe: SefazCeClient,
    private svrsNfce: SvrsNfceClient,
    @InjectQueue('emissao-nfce') private fiscalQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.fiscalQueue.add('recuperar', {}, { delay: 60_000, attempts: 1, removeOnComplete: 10, removeOnFail: 10 });
    } catch (error) {
      this.logger.warn(`Não foi possível agendar a varredura de pendências fiscais: ${error}`);
    }
  }

  private get transmissor(): INfeGateway {
    return this.gateway || this.svrsNfce;
  }

  /** Converte falhas cruas de certificado/rede em HTTP explícito (400/503), nunca 500 opaco. */
  private async chamadaSefaz<T>(operacao: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const mensagem = error instanceof Error ? error.message : 'Erro desconhecido na SEFAZ';
      this.logger.error(`Falha na operação SEFAZ (${operacao}): ${mensagem}`);
      if (/certificado|pfx|senha/i.test(mensagem)) throw new BadRequestException(mensagem);
      if (/authenticate|decrypt|GCM|cipher/i.test(mensagem)) throw new BadRequestException('Os dados fiscais cifrados não correspondem à FISCAL_ENCRYPTION_KEY atual — regrave o certificado A1 e o CSC');
      throw new ServiceUnavailableException(`Falha na comunicação com a SEFAZ (${operacao}): ${mensagem}`);
    }
  }

  private getEncryptionKey(): Buffer {
    const raw = this.config.get<string>('FISCAL_ENCRYPTION_KEY') || process.env.FISCAL_ENCRYPTION_KEY;
    if (!raw) {
      throw new BadRequestException('O administrador precisa configurar FISCAL_ENCRYPTION_KEY no backend antes de salvar CSC ou certificado A1');
    }
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new BadRequestException('FISCAL_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais');
    }
    return key;
  }

  private criptografar(valor: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const conteudo = Buffer.concat([cipher.update(valor, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, conteudo]).toString('base64');
  }

  private descriptografar(valor: string): string {
    try {
      const dados = Buffer.from(valor, 'base64');
      const iv = dados.subarray(0, 12);
      const tag = dados.subarray(12, 28);
      const conteudo = dados.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(conteudo), decipher.final()]).toString('utf8');
    } catch {
      throw new BadRequestException('Os dados fiscais cifrados não correspondem à FISCAL_ENCRYPTION_KEY atual — regrave o certificado A1 e o CSC');
    }
  }

  private async auditoria(negocioId: string, acao: string, entidadeId?: string, payload?: Record<string, unknown>) {
    try {
      await this.prisma.auditLog.create({
        data: { negocioId, acao, entidade: 'Fiscal', entidadeId, payload: (payload || {}) as Prisma.InputJsonValue },
      });
    } catch (error) {
      this.logger.warn(`Falha ao registrar auditoria fiscal ${acao}: ${error}`);
    }
  }

  async getConfiguracao(negocioId: string) {
    const config = await this.prisma.configuracaoFiscal.findUnique({ where: { negocioId } });
    if (!config) return null;
    return {
      id: config.id,
      negocioId: config.negocioId,
      ambiente: config.ambiente,
      regime: config.regime,
      cnpj: config.cnpj,
      ie: config.ie,
      razaoSocial: config.razaoSocial,
      endereco: config.endereco,
      serie: config.serie,
      proximoNumero: config.proximoNumero,
      cscId: config.cscId,
      ativo: config.ativo,
      permitirContingencia: false,
      certificado: {
        cadastrado: Boolean(config.certificadoA1Criptografado),
        nomeArquivo: config.certificadoNome,
        validade: config.certificadoValidade,
        expirado: config.certificadoValidade ? config.certificadoValidade.getTime() < Date.now() : false,
      },
      cscCadastrado: Boolean(config.cscCriptografado),
    };
  }

  async salvarConfiguracao(negocioId: string, dto: SalvarConfiguracaoFiscalDto) {
    const negocio = await this.prisma.negocio.findUnique({ where: { id: negocioId } });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');

    const cnpj = digitsOnly(dto.cnpj);
    if (!validarCnpj(cnpj)) throw new BadRequestException('CNPJ inválido (dígitos verificadores)');
    const serie = dto.serie ?? 1;
    if (serie < 1 || serie > 899) throw new BadRequestException('A série da NFC-e deve estar entre 1 e 899 para emissão normal');
    if (dto.permitirContingencia) {
      throw new BadRequestException('A SEFAZ-CE não permite emissão de NFC-e em contingência neste módulo');
    }
    const endereco = dto.endereco as Record<string, unknown>;
    const uf = String(endereco.estado || '').trim().toUpperCase();
    if (uf !== 'CE') throw new BadRequestException('A NFC-e deste módulo é exclusiva para emitentes do Ceará (UF CE)');
    const codigoMunicipio = digitsOnly(String(endereco.codigoMunicipio || endereco.codigoIbge || ''));
    if (codigoMunicipio.length !== 7) throw new BadRequestException('Código IBGE do município do emitente é obrigatório (7 dígitos)');
    if (dto.cscId && !/^\d{1,20}$/.test(digitsOnly(dto.cscId))) throw new BadRequestException('ID do CSC deve ser numérico');

    const atual = await this.prisma.configuracaoFiscal.findUnique({ where: { negocioId } });
    const data: Prisma.ConfiguracaoFiscalUncheckedCreateInput = {
      negocioId,
      ambiente: dto.ambiente || FiscalAmbiente.HOMOLOGACAO,
      regime: dto.regime,
      cnpj,
      ie: dto.ie.trim(),
      razaoSocial: dto.razaoSocial.trim(),
      endereco: dto.endereco as Prisma.InputJsonValue,
      serie,
      proximoNumero: dto.proximoNumero ?? atual?.proximoNumero ?? 1,
      cscId: dto.cscId ? digitsOnly(dto.cscId) : null,
      cscCriptografado: dto.csc ? this.criptografar(dto.csc) : atual?.cscCriptografado || null,
      permitirContingencia: false,
      ativo: false,
    };

    const salvo = await this.prisma.configuracaoFiscal.upsert({
      where: { negocioId },
      create: data,
      update: {
        ambiente: data.ambiente,
        regime: data.regime,
        cnpj: data.cnpj,
        ie: data.ie,
        razaoSocial: data.razaoSocial,
        endereco: data.endereco,
        serie: data.serie,
        proximoNumero: data.proximoNumero,
        cscId: data.cscId,
        ...(dto.csc ? { cscCriptografado: data.cscCriptografado } : {}),
        permitirContingencia: false,
        ativo: false,
      },
    });

    await this.auditoria(negocioId, 'fiscal.configuracao.salvar', salvo.id, { ambiente: salvo.ambiente, regime: salvo.regime, serie: salvo.serie });
    return this.getConfiguracao(salvo.negocioId);
  }

  async salvarCertificado(negocioId: string, dto: SalvarCertificadoA1Dto) {
    const config = await this.prisma.configuracaoFiscal.findUnique({ where: { negocioId } });
    if (!config) throw new BadRequestException('Salve a configuração fiscal antes do certificado');

    const base64 = dto.certificadoBase64.replace(/^data:.*?;base64,/, '').replace(/\s/g, '');
    const certificado = Buffer.from(base64, 'base64');
    if (certificado.length < 100 || certificado.length > 10 * 1024 * 1024) {
      throw new BadRequestException('Certificado A1 inválido ou maior que 10 MB');
    }

    let info;
    try {
      info = lerInfoCertificadoA1(certificado, dto.senha);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Certificado A1 inválido');
    }
    if (info.validoAte.getTime() < Date.now()) {
      throw new BadRequestException(`Certificado A1 expirado em ${info.validoAte.toLocaleDateString('pt-BR')}`);
    }
    if (info.cnpj && baseCnpj(info.cnpj) !== baseCnpj(config.cnpj)) {
      throw new BadRequestException('O CNPJ do certificado não corresponde ao CNPJ (raiz) cadastrado para o emitente');
    }

    await this.prisma.configuracaoFiscal.update({
      where: { negocioId },
      data: {
        certificadoA1Criptografado: this.criptografar(certificado.toString('base64')),
        certificadoSenhaCriptografada: this.criptografar(dto.senha),
        certificadoNome: dto.nomeArquivo?.trim() || 'certificado-a1.pfx',
        certificadoValidade: info.validoAte,
        ativo: false,
      },
    });

    await this.auditoria(negocioId, 'fiscal.certificado.salvar', config.id, { nome: dto.nomeArquivo, validade: info.validoAte.toISOString() });
    return { cadastrado: true, ativo: false, validade: info.validoAte };
  }

  async testarConfiguracao(negocioId: string) {
    const config = await this.prisma.configuracaoFiscal.findUnique({ where: { negocioId } });
    if (!config) throw new BadRequestException('Configuração fiscal não cadastrada');

    const pendencias: string[] = [];
    if (!validarCnpj(config.cnpj)) pendencias.push('CNPJ inválido');
    if (config.ambiente === FiscalAmbiente.PRODUCAO && config.regime === 'REGIME_NORMAL') {
      pendencias.push('O XML ainda não implementa IBS/CBS da NT 2025.002-RTC para regime normal; não ative produção até essa adequação');
    }
    if (!config.certificadoA1Criptografado) pendencias.push('Certificado A1 não cadastrado');
    if (!config.certificadoSenhaCriptografada) pendencias.push('Senha do certificado não cadastrada');
    if (config.certificadoValidade && config.certificadoValidade.getTime() < Date.now()) {
      pendencias.push('Certificado A1 expirado');
    }
    if (!config.cscId || !config.cscCriptografado) pendencias.push(`CSC de ${config.ambiente.toLowerCase()} não cadastrado`);
    if (config.serie < 1 || config.serie > 899) pendencias.push('Série fora da faixa permitida (1-899)');
    const endereco = (config.endereco || {}) as Record<string, unknown>;
    const camposEndereco: Array<[string, string, number]> = [
      ['logradouro', 'Logradouro do emitente', 2],
      ['numero', 'Número do emitente', 1],
      ['bairro', 'Bairro do emitente', 2],
      ['cidade', 'Cidade do emitente', 2],
      ['estado', 'UF do emitente', 2],
      ['cep', 'CEP do emitente', 8],
    ];
    for (const [campo, descricao, minimo] of camposEndereco) {
      if (String(endereco[campo] || '').trim().length < minimo) pendencias.push(`${descricao} ausente ou inválido`);
    }
    if (!/^CE$/i.test(String(endereco.estado || '').trim())) pendencias.push('UF do emitente deve ser CE para este módulo');
    if (!digitsOnly(String(endereco.codigoMunicipio || endereco.codigoIbge || '')).match(/^\d{7}$/)) {
      pendencias.push('Código IBGE do município ausente ou inválido');
    }

    const produtos = await this.prisma.produto.findMany({
      where: { negocioId, status: 'ATIVO' },
      select: {
        nome: true, ncm: true, cfop: true, csosn: true, cstIcms: true, cstPis: true, cstCofins: true, pRedBC: true,
        aliqIcms: true, aliqPis: true, aliqCofins: true,
        aliqTributosFederais: true, aliqTributosEstaduais: true, aliqTributosMunicipais: true,
        fonteTributosAproximados: true, vigenciaTributosAproximados: true,
      },
    });
    const semCodigoFiscal = produtos.filter((produto) =>
      !/^\d{8}$/.test(digitsOnly(produto.ncm || '')) || !/^\d{4}$/.test(digitsOnly(produto.cfop || '')),
    ).length;
    if (semCodigoFiscal) pendencias.push(`${semCodigoFiscal} produto(s) ativo(s) sem NCM/CFOP válido`);

    if (config.regime === 'REGIME_NORMAL') {
      const semICMS = produtos.filter((produto) => {
        const cst = produto.cstIcms || '00';
        if (!['00', '20', '40', '41', '50'].includes(cst)) return true;
        if (['00', '20'].includes(cst) && Number(produto.aliqIcms || 0) <= 0) return true;
        if (cst === '20' && Number(produto.pRedBC || 0) <= 0) return true;
        return false;
      }).length;
      if (semICMS) pendencias.push(`${semICMS} produto(s) ativo(s) com CST/base/alíquota de ICMS incompletos ou não suportados`);
    } else {
      const aceitos = config.regime === 'MEI' ? ['102', '300'] : ['102', '400'];
      const semCSOSN = produtos.filter((produto) => !aceitos.includes(produto.csosn || '102')).length;
      if (semCSOSN) pendencias.push(`${semCSOSN} produto(s) ativo(s) com CSOSN não suportado para o regime`);
    }

    const permitidosPISCOFINS = ['01', '02', '04', '05', '06', '07', '08', '09', '49', '99'];
    const semContribuicoes = produtos.filter((produto) => {
      const cstPis = produto.cstPis || '';
      const cstCofins = produto.cstCofins || '';
      return !permitidosPISCOFINS.includes(cstPis)
        || !permitidosPISCOFINS.includes(cstCofins)
        || (['01', '02'].includes(cstPis) && Number(produto.aliqPis || 0) <= 0)
        || (['01', '02'].includes(cstCofins) && Number(produto.aliqCofins || 0) <= 0);
    }).length;
    if (semContribuicoes) pendencias.push(`${semContribuicoes} produto(s) ativo(s) sem CST/alíquota PIS e COFINS completos`);

    const semEstimativa = produtos.filter((produto) =>
      produto.aliqTributosFederais == null
      || produto.aliqTributosEstaduais == null
      || produto.aliqTributosMunicipais == null
      || !produto.fonteTributosAproximados
      || !produto.vigenciaTributosAproximados,
    ).length;
    if (semEstimativa) {
      pendencias.push(`${semEstimativa} produto(s) ativo(s) sem estimativa tributária federal/estadual/municipal e fonte vigente`);
    }

    const pronto = pendencias.length === 0;
    return {
      prontoParaMontarXml: pronto,
      // Só indica configuração local completa e emissão explicitamente ativada.
      // Não representa uma autorização real da SEFAZ.
      prontoParaTransmitir: pronto && config.ativo,
      ambiente: config.ambiente,
      permitirContingencia: false,
      pendencias,
      observacao: 'Esta checagem valida dados locais. Teste emissão, consulta, cancelamento, inutilização e impressão em homologação da SEFAZ-CE antes de ativar produção.',
    };
  }

  async testarSefaz(negocioId: string) {
    const config = await this.prisma.configuracaoFiscal.findUnique({ where: { negocioId } });
    if (!config) throw new BadRequestException('Configuração fiscal não cadastrada');
    if (!config.certificadoA1Criptografado || !config.certificadoSenhaCriptografada) {
      throw new BadRequestException('Certificado A1 e senha são obrigatórios');
    }
    try {
      const pfxBase64 = this.descriptografar(config.certificadoA1Criptografado);
      const senha = this.descriptografar(config.certificadoSenhaCriptografada);
      const resultado = await this.chamadaSefaz('status', () => this.sefazCe.consultarStatus(Buffer.from(pfxBase64, 'base64'), senha, config.ambiente));
      return { conectado: true, ambiente: config.ambiente, cStat: resultado.cStat, xMotivo: resultado.xMotivo };
    } catch (error) {
      this.logger.error(`Falha no teste SEFAZ para o negócio ${negocioId}: ${error}`);
      throw error;
    }
  }

  async ativarEmissao(negocioId: string) {
    const config = await this.prisma.configuracaoFiscal.findUnique({ where: { negocioId } });
    if (!config) throw new BadRequestException('Salve a configuração fiscal antes de ativar a emissão');
    const verificacao = await this.testarConfiguracao(negocioId);
    if (verificacao.pendencias.length) {
      throw new BadRequestException(`Corrija os pré-requisitos fiscais antes de ativar: ${verificacao.pendencias.join(' | ')}`);
    }
    if (config.ambiente === FiscalAmbiente.PRODUCAO) {
      const notaHomologada = await this.prisma.documentoFiscal.findFirst({
        where: { negocioId, ambiente: FiscalAmbiente.HOMOLOGACAO, status: FiscalStatusDocumento.AUTORIZADA },
        select: { id: true },
      });
      if (!notaHomologada) {
        throw new BadRequestException('Antes de produção, emita e autorize uma NFC-e em homologação e valide o DANFE/QR Code');
      }
      const cancelamentoHomologado = await this.prisma.fiscalEvento.findFirst({
        where: { negocioId, documentoId: notaHomologada.id, tipo: '110111', cStat: { in: ['135', '155'] } },
        select: { id: true },
      });
      if (!cancelamentoHomologado) {
        throw new BadRequestException('Antes de produção, valide também o cancelamento de uma NFC-e em homologação');
      }
    }
    await this.prisma.configuracaoFiscal.update({ where: { negocioId }, data: { ativo: true } });
    await this.auditoria(negocioId, 'fiscal.emissao.ativar', config.id, { ambiente: config.ambiente });
    return this.getConfiguracao(negocioId);
  }

  async listarDocumentos(negocioId: string) {
    return this.prisma.documentoFiscal.findMany({
      where: { negocioId },
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true, pedidoId: true, ambiente: true, modelo: true, status: true,
        numero: true, serie: true, chaveAcesso: true, protocolo: true,
        codigoStatus: true, mensagem: true, tentativas: true, authorizedEm: true,
        criadoEm: true, atualizadoEm: true,
      },
      take: 200,
    });
  }

  async getXmlDocumento(negocioId: string, documentoId: string) {
    const documento = await this.prisma.documentoFiscal.findFirst({ where: { id: documentoId, negocioId } });
    if (!documento) throw new NotFoundException('Documento fiscal não encontrado');
    return { id: documento.id, xmlAssinado: documento.xmlAssinado, xmlAutorizado: documento.xmlAutorizado, qrCodeUrl: documento.qrCodeUrl };
  }

  async consultarDocumento(negocioId: string, documentoId: string) {
    const documento = await this.prisma.documentoFiscal.findFirst({ where: { id: documentoId, negocioId }, include: { configuracao: true } });
    if (!documento) throw new NotFoundException('Documento fiscal não encontrado');
    if (!documento.chaveAcesso) return documento;
    const contexto = this.montarContexto(documento.configuracao, documento.numero ?? undefined);
    if (!contexto) throw new BadRequestException('Certificado A1 e CSC não configurados');
    const resposta = await this.chamadaSefaz('consulta', () => this.transmissor.consultar(documento.chaveAcesso!, contexto));
    const novoStatus = this.classificarConsulta(resposta.cStat, documento.status);
    await this.prisma.documentoFiscal.update({
      where: { id: documento.id },
      data: { codigoStatus: resposta.cStat, protocolo: resposta.protocolo ?? documento.protocolo, status: novoStatus, mensagem: resposta.xMotivo ?? documento.mensagem },
    });
    if (novoStatus === FiscalStatusDocumento.AUTORIZADA) {
      await this.aplicarAutorizacaoNoPedido(documento.pedidoId, documento.chaveAcesso, documento.numero, documento.serie, documento.protocolo ?? resposta.protocolo);
    }
    return { ...documento, statusSefaz: resposta.status, protocolo: resposta.protocolo, status: novoStatus };
  }

  private classificarConsulta(cStat: string | undefined, atual: FiscalStatusDocumento): FiscalStatusDocumento {
    if (cStat === '100' || cStat === '150') return FiscalStatusDocumento.AUTORIZADA;
    if (cStat === '101') return FiscalStatusDocumento.CANCELADA;
    if (cStat === '105' || cStat === '106' || cStat === '108' || cStat === '109') return FiscalStatusDocumento.PENDENTE_CONSULTA;
    if (cStat === '216' || cStat === '217') return FiscalStatusDocumento.ERRO;
    return atual;
  }

  async aplicarAutorizacaoNoPedido(pedidoId: string, chave: string | null, numero?: number | null, serie?: number | null, protocolo?: string | null) {
    if (!chave) return;
    await this.prisma.pedido.update({
      where: { id: pedidoId },
      data: { chaveAcesso: chave, numeroNfe: numero != null ? String(numero) : undefined, serieNfe: serie != null ? String(serie) : undefined },
    }).catch(() => undefined);
    void protocolo;
  }

  async cancelarDocumento(negocioId: string, documentoId: string, motivo: string) {
    const documento = await this.prisma.documentoFiscal.findFirst({ where: { id: documentoId, negocioId }, include: { configuracao: true } });
    if (!documento?.chaveAcesso) throw new BadRequestException('Documento autorizado não encontrado');
    if (documento.status === FiscalStatusDocumento.CANCELADA) throw new BadRequestException('Documento já cancelado');
    if (documento.status !== FiscalStatusDocumento.AUTORIZADA) throw new BadRequestException('Somente NFC-e autorizadas podem ser canceladas');
    if (!motivo || motivo.trim().length < 15) throw new BadRequestException('Justificativa do cancelamento deve ter ao menos 15 caracteres');
    const baseHora = (documento.authorizedEm ?? documento.criadoEm).getTime();
    if (documento.ambiente === FiscalAmbiente.PRODUCAO && Date.now() - baseHora > PRAZO_CANCELAMENTO_MS) {
      throw new BadRequestException('Prazo de 24h para cancelamento da NFC-e expirado (Ajuste SINIEF 19/16, cláusula décima quinta)');
    }
    const contexto = this.montarContexto(documento.configuracao, documento.numero ?? undefined);
    if (!contexto) throw new BadRequestException('Certificado A1 e CSC não configurados');
    const evento = await this.chamadaSefaz('cancelamento', () => this.transmissor.cancelar(documento.chaveAcesso as string, motivo, contexto));
    // 128 confirma o processamento do lote; o resultado fiscal está em retEvento.
    // 136 significa evento registrado sem vínculo com a NFC-e e não cancela o documento.
    const sucesso = ['135', '155'].includes(evento.cStat || '');
    const registro = await this.prisma.fiscalEvento.create({
      data: {
        negocioId, documentoId: documento.id, tipo: '110111', chaveAcesso: documento.chaveAcesso,
        justificativa: motivo, xmlAssinado: evento.xmlEvento, xmlResposta: evento.xmlResposta,
        cStat: evento.cStat, xMotivo: evento.xMotivo, protocolo: evento.protocolo,
      },
    });
    if (!sucesso) {
      await this.prisma.documentoFiscal.update({ where: { id: documento.id }, data: { codigoStatus: evento.cStat, mensagem: evento.xMotivo } });
      throw new BadRequestException(`SEFAZ rejeitou o cancelamento (${evento.cStat || 'sem cStat'}): ${evento.xMotivo || 'resposta inválida'}`);
    }
    const atualizado = await this.prisma.documentoFiscal.update({
      where: { id: documento.id },
      data: { status: FiscalStatusDocumento.CANCELADA, codigoStatus: evento.cStat, mensagem: evento.xMotivo, protocolo: evento.protocolo ?? documento.protocolo },
    });
    await this.auditoria(negocioId, 'fiscal.cancelamento', documento.id, { chave: documento.chaveAcesso, motivo, eventoId: registro.id });
    return atualizado;
  }

  async inutilizarNumeros(negocioId: string, serie: number, numeroInicial: number, numeroFinal: number, justificativa: string) {
    const config = await this.prisma.configuracaoFiscal.findUnique({ where: { negocioId } });
    if (!config) throw new BadRequestException('Configuração fiscal não cadastrada');
    if (!justificativa || justificativa.trim().length < 15) throw new BadRequestException('Justificativa da inutilização deve ter ao menos 15 caracteres');
    if (numeroFinal < numeroInicial || numeroFinal - numeroInicial > 99) throw new BadRequestException('Faixa inválida (máximo de 100 números)');
    if (numeroFinal >= config.proximoNumero) throw new BadRequestException('A faixa informada contém numeração já utilizada ou reservada');
    const emUso = await this.prisma.documentoFiscal.findFirst({
      where: { negocioId, serie, numero: { gte: numeroInicial, lte: numeroFinal }, status: { not: FiscalStatusDocumento.ERRO } },
    });
    if (emUso) throw new BadRequestException(`Existe documento fiscal na numeração ${emUso.numero} (série ${emUso.serie})`);
    const contexto = this.montarContexto(config, 1);
    if (!contexto) throw new BadRequestException('Certificado A1 e CSC não configurados');
    const evento = await this.chamadaSefaz('inutilizacao', () => this.transmissor.inutilizar(serie, numeroInicial, numeroFinal, justificativa, contexto));
    await this.prisma.fiscalEvento.create({
      data: {
        negocioId, tipo: '110112', serie, numeroInicial, numeroFinal, justificativa,
        xmlAssinado: evento.xmlEvento, xmlResposta: evento.xmlResposta,
        cStat: evento.cStat, xMotivo: evento.xMotivo, protocolo: evento.protocolo,
      },
    });
    await this.auditoria(negocioId, 'fiscal.inutilizacao', undefined, { serie, numeroInicial, numeroFinal });
    const sucesso = evento.cStat === '102';
    if (!sucesso) throw new BadRequestException(`SEFAZ rejeitou a inutilização (${evento.cStat || 'sem cStat'}): ${evento.xMotivo || 'resposta inválida'}`);
    return { cStat: evento.cStat, xMotivo: evento.xMotivo, protocolo: evento.protocolo };
  }

  async reprocessarDocumento(negocioId: string, documentoId: string) {
    const documento = await this.prisma.documentoFiscal.findFirst({ where: { id: documentoId, negocioId } });
    if (!documento) throw new NotFoundException('Documento fiscal não encontrado');
    const reprocessaveis: FiscalStatusDocumento[] = [FiscalStatusDocumento.REJEITADA, FiscalStatusDocumento.ERRO, FiscalStatusDocumento.PENDENTE];
    if (!reprocessaveis.includes(documento.status)) {
      throw new BadRequestException('Somente documentos rejeitados, com erro ou pendentes podem ser reprocessados');
    }
    const config = await this.prisma.configuracaoFiscal.findUnique({ where: { negocioId } });
    if (!config?.ativo) throw new BadRequestException('Ative a emissão fiscal antes de reprocessar documentos');
    const reservarNovoNumero = documento.numero == null
      || (documento.status === FiscalStatusDocumento.PENDENTE && documento.tentativas === 0);
    const numero = reservarNovoNumero ? await this.reservarNumero(config.id) : documento.numero!;
    await this.prisma.documentoFiscal.update({
      where: { id: documento.id },
      data: { status: FiscalStatusDocumento.PROCESSANDO, mensagem: null, numero, serie: documento.serie ?? config.serie, configuracaoId: config.id },
    });
    await this.fiscalQueue.add('transmitir', { documentoId: documento.id }, { attempts: 3, backoff: { type: 'exponential', delay: 15_000 }, removeOnComplete: 100, removeOnFail: 200 });
    await this.auditoria(negocioId, 'fiscal.reprocessamento', documento.id, { numero: documento.numero, serie: documento.serie });
    return { agendado: true, documentoId: documento.id };
  }

  /** Chamada principal do PDV: valida, cria o documento fiscal e enfileira a transmissão. */
  async emitirNFe(negocioId: string, pedidoId: string): Promise<boolean> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { itens: { include: { produto: true } }, pagamentos: true, negocio: true },
    });
    if (!pedido) return false;
    if (pedido.negocio.tipo !== 'VAREJO') return false;

    const config = await this.prisma.configuracaoFiscal.findUnique({ where: { negocioId } });
    if (!config?.cnpj) {
      this.logger.warn(`Negócio ${negocioId} sem CNPJ configurado — não é possível emitir NF`);
      return false;
    }

    const existente = await this.prisma.documentoFiscal.findUnique({ where: { pedidoId } });
    if (existente && (existente.status === FiscalStatusDocumento.AUTORIZADA || existente.status === FiscalStatusDocumento.PROCESSANDO)) {
      return true;
    }

    if (!config.ativo) {
      const mensagem = 'Emissão fiscal desativada. Complete os pré-requisitos e ative a emissão nas configurações fiscais.';
      await this.prisma.documentoFiscal.upsert({
        where: { pedidoId },
        create: { negocioId, pedidoId, configuracaoId: config.id, ambiente: config.ambiente, status: FiscalStatusDocumento.PENDENTE, mensagem },
        update: { status: FiscalStatusDocumento.PENDENTE, mensagem, configuracaoId: config.id, numero: null, serie: null },
      });
      return false;
    }

    const contextoBase = this.montarContexto(config);
    if (!contextoBase) {
      const mensagem = 'Certificado A1, senha e CSC fiscal ainda não configurados';
      await this.prisma.documentoFiscal.upsert({
        where: { pedidoId },
        create: { negocioId, pedidoId, configuracaoId: config.id, ambiente: config.ambiente, status: FiscalStatusDocumento.PENDENTE, mensagem },
        update: { status: FiscalStatusDocumento.PENDENTE, mensagem, configuracaoId: config.id, numero: null, serie: null },
      });
      return false;
    }

    const localError = this.validarEmissaoLocal(pedido, config.regime, config.endereco, config.ambiente);
    if (localError) {
      await this.prisma.documentoFiscal.upsert({
        where: { pedidoId },
        create: { negocioId, pedidoId, configuracaoId: config.id, ambiente: config.ambiente, status: FiscalStatusDocumento.PENDENTE, mensagem: localError },
        update: { status: FiscalStatusDocumento.PENDENTE, mensagem: localError, configuracaoId: config.id, numero: null, serie: null },
      });
      return false;
    }

    const numeroJaReservado = existente?.numero != null
      && !(existente.status === FiscalStatusDocumento.PENDENTE && existente.tentativas === 0);
    const numero = numeroJaReservado ? existente!.numero! : await this.reservarNumero(config.id);
    const documento = existente
      ? await this.prisma.documentoFiscal.update({
          where: { id: existente.id },
          data: { status: FiscalStatusDocumento.PROCESSANDO, mensagem: null, ambiente: config.ambiente, configuracaoId: config.id, numero, serie: config.serie },
        })
      : await this.prisma.documentoFiscal.create({
          data: { negocioId, pedidoId, configuracaoId: config.id, ambiente: config.ambiente, status: FiscalStatusDocumento.PROCESSANDO, numero, serie: config.serie },
        });

    await this.fiscalQueue.add('transmitir', { documentoId: documento.id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    return true;
  }

  /** Executado pelo worker da fila: transmite a NFC-e e aplica o resultado. */
  async transmitirDocumento(documentoId: string): Promise<NFeResultado | null> {
    const documento = await this.prisma.documentoFiscal.findUnique({
      where: { id: documentoId },
      include: { configuracao: true, pedido: { include: { itens: { include: { produto: true } }, pagamentos: true, negocio: true } } },
    });
    if (!documento) return null;
    const transmitaveis: FiscalStatusDocumento[] = [FiscalStatusDocumento.PROCESSANDO, FiscalStatusDocumento.PENDENTE, FiscalStatusDocumento.REJEITADA, FiscalStatusDocumento.ERRO];
    if (!transmitaveis.includes(documento.status)) {
      return null;
    }
    const config = documento.configuracao;
    const contexto = this.montarContexto(config, documento.numero ?? undefined);
    if (!contexto) return null;

    await this.prisma.documentoFiscal.update({ where: { id: documentoId }, data: { tentativas: { increment: 1 } } });

    const params = this.montarParams(documento.pedido, config);
    params.numeroPedido = documento.pedidoId.slice(0, 8).toUpperCase();
    let resultado: NFeResultado;
    try {
      resultado = await this.chamadaSefaz('emissão', () => this.transmissor.emitir(params, contexto));
    } catch (error) {
      if (error instanceof BadRequestException) {
        await this.prisma.documentoFiscal.update({ where: { id: documentoId }, data: { status: FiscalStatusDocumento.ERRO, mensagem: error.message } });
        return null;
      }
      throw error;
    }
    await this.aplicarResultado(documento, config, resultado);
    if (resultado.status === 'ERRO_REDE') {
      throw new Error(resultado.xMotivo || 'Falha de comunicação com a SEFAZ');
    }
    return resultado;
  }

  /** Worker: reenvia o XML assinado de uma NFC-e em contingência off-line. */
  async reenviarContingencia(documentoId: string): Promise<NFeResultado | null> {
    const documento = await this.prisma.documentoFiscal.findUnique({
      where: { id: documentoId },
      include: { configuracao: true, pedido: true },
    });
    if (!documento || documento.status !== FiscalStatusDocumento.CONTINGENCIA || !documento.xmlAssinado || !documento.chaveAcesso) {
      return null;
    }
    const config = documento.configuracao;
    const contexto = this.montarContexto(config, documento.numero ?? undefined);
    if (!contexto) return null;

    try {
      const consulta = await this.transmissor.consultar(documento.chaveAcesso, contexto);
      if (consulta.cStat === '100') {
        await this.aplicarResultado(documento, config, { status: 'AUTORIZADA', chaveAcesso: documento.chaveAcesso, numeroNfe: documento.numero ?? contexto.numero, serieNfe: documento.serie ?? contexto.serie, protocolo: consulta.protocolo, xmlAutorizado: undefined, qrCodeUrl: documento.qrCodeUrl ?? undefined });
        return null;
      }
    } catch {
      // indisponível: tenta o reenvio direto
    }

    const resultado = await this.chamadaSefaz('reenvio de contingência', () => this.transmissor.reenviar(documento.xmlAssinado!, documento.chaveAcesso!, contexto));
    await this.aplicarResultado(documento, config, resultado);
    if (resultado.status === 'ERRO_REDE') {
      await this.fiscalQueue.add('reenviar', { documentoId }, {
        attempts: 1, backoff: { type: 'exponential', delay: 60_000 }, delay: 60_000, removeOnComplete: 50, removeOnFail: 100,
      });
    }
    return resultado;
  }

  /** Varredura periódica: consulta/recupera documentos sem confirmação. */
  async recuperarPendentes(negocioId?: string) {
    const limite = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const documentos = await this.prisma.documentoFiscal.findMany({
      where: {
        ...(negocioId ? { negocioId } : {}),
        status: { in: [FiscalStatusDocumento.PROCESSANDO, FiscalStatusDocumento.PENDENTE_CONSULTA, FiscalStatusDocumento.CONTINGENCIA] },
        criadoEm: { gte: limite },
      },
      include: { configuracao: true },
      take: 50,
    });
    let recuperados = 0;
    for (const documento of documentos) {
      try {
        if (documento.status === FiscalStatusDocumento.CONTINGENCIA) {
          await this.reenviarContingencia(documento.id);
          recuperados++;
          continue;
        }
        if (!documento.chaveAcesso) continue;
        const contexto = this.montarContexto(documento.configuracao, documento.numero ?? undefined);
        if (!contexto) continue;
        const resposta = await this.transmissor.consultar(documento.chaveAcesso, contexto);
        if (resposta.cStat === '100' || resposta.cStat === '150') {
          await this.aplicarResultado(documento, documento.configuracao, {
            status: 'AUTORIZADA',
            chaveAcesso: documento.chaveAcesso,
            numeroNfe: documento.numero ?? contexto.numero,
            serieNfe: documento.serie ?? contexto.serie,
            protocolo: resposta.protocolo,
            xmlAutorizado: undefined,
            qrCodeUrl: documento.qrCodeUrl ?? undefined,
          });
          recuperados++;
        } else if (resposta.cStat === '101') {
          await this.prisma.documentoFiscal.update({ where: { id: documento.id }, data: { status: FiscalStatusDocumento.CANCELADA, codigoStatus: resposta.cStat, mensagem: resposta.xMotivo } });
          recuperados++;
        } else if (resposta.cStat && resposta.cStat !== '100' && !['105', '106', '108', '109'].includes(resposta.cStat)) {
          await this.prisma.documentoFiscal.update({ where: { id: documento.id }, data: { status: FiscalStatusDocumento.REJEITADA, codigoStatus: resposta.cStat, mensagem: resposta.xMotivo } });
          recuperados++;
        } else {
          await this.prisma.documentoFiscal.update({ where: { id: documento.id }, data: { status: FiscalStatusDocumento.PENDENTE_CONSULTA, codigoStatus: resposta.cStat, mensagem: resposta.xMotivo } });
        }
      } catch (error) {
        this.logger.warn(`Falha ao recuperar documento ${documento.id}: ${error}`);
      }
    }
    return { verificados: documentos.length, recuperados };
  }

  private async aplicarResultado(documento: { id: string; pedidoId: string; chaveAcesso?: string | null }, config: { id: string; negocioId: string; permitirContingencia: boolean }, resultado: NFeResultado) {
    if (resultado.status === 'AUTORIZADA') {
      await this.prisma.documentoFiscal.update({
        where: { id: documento.id },
        data: {
          status: FiscalStatusDocumento.AUTORIZADA,
          numero: resultado.numeroNfe,
          serie: resultado.serieNfe,
          chaveAcesso: resultado.chaveAcesso ?? null,
          protocolo: resultado.protocolo ?? null,
          recibo: resultado.recibo ?? null,
          xmlAssinado: resultado.xmlAssinado ?? null,
          xmlAutorizado: resultado.xmlAutorizado ?? null,
          qrCodeUrl: resultado.qrCodeUrl ?? null,
          codigoStatus: resultado.cStat ?? null,
          mensagem: null,
          authorizedEm: new Date(),
        },
      });
      await this.prisma.pedido.update({
        where: { id: documento.pedidoId },
        data: {
          chaveAcesso: resultado.chaveAcesso ?? null,
          numeroNfe: String(resultado.numeroNfe),
          serieNfe: String(resultado.serieNfe),
          tributosAproximados: resultado.tributosAproximados ?? undefined,
          tributosFederaisAproximados: resultado.tributosFederaisAproximados ?? undefined,
          tributosEstaduaisAproximados: resultado.tributosEstaduaisAproximados ?? undefined,
          tributosMunicipaisAproximados: resultado.tributosMunicipaisAproximados ?? undefined,
          fontesTributosAproximados: resultado.fontesTributosAproximados ?? undefined,
          qrCodeUrl: resultado.qrCodeUrl ?? undefined,
        },
      }).catch(() => undefined);
      await this.auditoria(config.negocioId, 'fiscal.emissao.autorizada', documento.id, { chave: resultado.chaveAcesso, protocolo: resultado.protocolo });
      return;
    }
    if (resultado.status === 'REJEITADA') {
      await this.prisma.documentoFiscal.update({
        where: { id: documento.id },
        data: { status: FiscalStatusDocumento.REJEITADA, chaveAcesso: resultado.chaveAcesso ?? documento.chaveAcesso ?? null, xmlAssinado: resultado.xmlAssinado ?? null, codigoStatus: resultado.cStat ?? null, mensagem: resultado.xMotivo ?? 'Rejeitada pela SEFAZ' },
      });
      await this.auditoria(config.negocioId, 'fiscal.emissao.rejeitada', documento.id, { cStat: resultado.cStat, xMotivo: resultado.xMotivo });
      return;
    }
    if (resultado.status === 'PROCESSANDO') {
      await this.prisma.documentoFiscal.update({
        where: { id: documento.id },
        data: { status: FiscalStatusDocumento.PENDENTE_CONSULTA, chaveAcesso: resultado.chaveAcesso ?? null, recibo: resultado.recibo ?? null, xmlAssinado: resultado.xmlAssinado ?? null, codigoStatus: resultado.cStat ?? null, mensagem: resultado.xMotivo ?? 'Aguardando resultado do processamento' },
      });
      return;
    }
    // ERRO_REDE
    // A contingência NFC-e não é permitida neste módulo CE. Não gere tpEmis=9.
    await this.prisma.documentoFiscal.update({
      where: { id: documento.id },
      data: { status: FiscalStatusDocumento.ERRO, codigoStatus: resultado.cStat ?? null, mensagem: resultado.xMotivo ?? 'Falha de comunicação com a SEFAZ' },
    });
  }

  private validarEmissaoLocal(pedido: any, regime: string, emitenteEndereco: any, ambiente: FiscalAmbiente): string | null {
    const total = Number(pedido.total);
    if (total >= 200000) return 'NFC-e não permitida para valor igual ou superior a R$ 200.000,00 (emitir NF-e modelo 55)';
    const entrega = pedido.tipoEntrega === 'ENTREGA';
    const documentoDestinatario = digitsOnly(pedido.clienteCpf || '');
    const documentoDestinatarioValido = documentoDestinatario.length === 11
      ? validarCpf(documentoDestinatario)
      : documentoDestinatario.length === 14
        ? validarCnpj(documentoDestinatario)
        : false;
    if (documentoDestinatario && !documentoDestinatarioValido) return 'CPF/CNPJ do destinatário inválido';
    if (entrega && !documentoDestinatarioValido) return 'Venda com entrega não presencial exige CPF/CNPJ válido do destinatário';
    if (entrega) {
      const endereco = typeof pedido.endereco === 'string' ? null : pedido.endereco as Record<string, unknown> | null;
      if (!endereco || !String(endereco.logradouro || endereco.rua || '').trim()
        || !String(endereco.bairro || '').trim() || !String(endereco.cidade || '').trim()
        || digitsOnly(String(endereco.cep || '')).length !== 8) {
        return 'Entrega não presencial exige logradouro, bairro, cidade e CEP válidos no endereço do destinatário';
      }
      const ufDest = String(endereco.uf || endereco.estado || 'CE').trim().toUpperCase();
      if (ufDest !== 'CE') return 'Este emissor de NFC-e não atende entrega para outra UF';
      const mesmaCidade = String(endereco.cidade).trim().toLowerCase()
        === String(emitenteEndereco?.cidade || pedido.negocio?.cidade || '').trim().toLowerCase();
      const codigoMunicipio = digitsOnly(String(endereco.codigoMunicipio || endereco.codigoIbge || ''));
      if (!mesmaCidade && codigoMunicipio.length !== 7) {
        return 'Informe o código IBGE de 7 dígitos do município de entrega';
      }
    }
    if (total >= 10000 && !documentoDestinatarioValido) return 'Operação igual ou superior a R$ 10.000,00 exige CPF/CNPJ válido do destinatário';
    const pagamentos = (pedido.pagamentos || []).filter((p: any) => p.status !== 'CANCELADO' && p.status !== 'RECUSADO');
    const somaPagamentos = pagamentos.reduce((s: number, p: any) => s + Number(p.valor), 0);
    if (somaPagamentos + 0.01 < total) return `Pagamentos (R$ ${somaPagamentos.toFixed(2)}) menores que o valor da venda (R$ ${total.toFixed(2)})`;
    if (ambiente === FiscalAmbiente.PRODUCAO && pagamentos.some((p: any) => p.metodo === 'CREDIARIO')) {
      return 'Venda a prazo precisa do evento ECONF na SEFAZ-CE; o fluxo de baixa/ECONF ainda não está integrado, então a emissão foi retida';
    }
    const cartoes = pagamentos.filter((p: any) => ['CARTAO_CREDITO', 'CARTAO_DEBITO'].includes(p.metodo));
    for (const cartao of cartoes) {
      const dados = (cartao.dadosPagamento || {}) as Record<string, unknown>;
      if (!dados.cnpj || !dados.cAut) {
        return 'Vinculação do pagamento à NFC-e incompleta (IN 87/2025-CE): informe no checkout o CNPJ da adquirente e o nº de autorização da transação (recibo da maquininha)';
      }
      if (!validarCnpj(String(dados.cnpj))) {
        return 'CNPJ da instituição de pagamento inválido no registro do cartão';
      }
      if (!['1', '2'].includes(String(dados.tpIntegra || ''))) {
        return 'Informe o tipo de integração do pagamento com cartão (1=integrado, 2=não integrado)';
      }
    }
    const itens = pedido.itens || [];
    if (!itens.length) return 'Pedido sem itens para emitir NFC-e';
    for (const item of itens) {
      const produto = item.produto || {};
      if (!/^\d{8}$/.test(digitsOnly(produto.ncm || ''))) return `NCM inválido ou ausente no produto "${item.produtoNome}"`;
      if (!/^\d{4}$/.test(digitsOnly(produto.cfop || ''))) return `CFOP inválido ou ausente no produto "${item.produtoNome}"`;
      if (produto.cest && !/^\d{7}$/.test(digitsOnly(produto.cest))) return `CEST inválido no produto "${item.produtoNome}" (7 dígitos)`;
      if (Number(produto.origem ?? 0) < 0 || Number(produto.origem ?? 0) > 8) return `Origem inválida no produto "${item.produtoNome}"`;
      if (produto.aliqTributosFederais == null || produto.aliqTributosEstaduais == null
        || produto.aliqTributosMunicipais == null || !produto.fonteTributosAproximados
        || !produto.vigenciaTributosAproximados) {
        return `Estimativa tributária federal/estadual/municipal e fonte vigente ausentes no produto "${item.produtoNome}"`;
      }
      const aliquotasAproximadas = [produto.aliqTributosFederais, produto.aliqTributosEstaduais, produto.aliqTributosMunicipais].map(Number);
      if (aliquotasAproximadas.some((aliquota) => !Number.isFinite(aliquota) || aliquota < 0 || aliquota > 100)) {
        return `Alíquotas aproximadas inválidas no produto "${item.produtoNome}"`;
      }
      const cstsContribuicoesPermitidos = ['01', '02', '04', '05', '06', '07', '08', '09', '49', '99'];
      const cstPis = String(produto.cstPis || '');
      const cstCofins = String(produto.cstCofins || '');
      if (!cstsContribuicoesPermitidos.includes(cstPis) || !cstsContribuicoesPermitidos.includes(cstCofins)) {
        return `CST PIS/COFINS ausente ou não suportado no produto "${item.produtoNome}"`;
      }
      if (['01', '02'].includes(cstPis) && Number(produto.aliqPis || 0) <= 0) return `Alíquota PIS ausente no produto "${item.produtoNome}"`;
      if (['01', '02'].includes(cstCofins) && Number(produto.aliqCofins || 0) <= 0) return `Alíquota COFINS ausente no produto "${item.produtoNome}"`;
      if (regime === 'REGIME_NORMAL') {
        const cst = String(produto.cstIcms || '00');
        if (!['00', '20', '40', '41', '50'].includes(cst)) return `CST de ICMS não suportado no produto "${item.produtoNome}"`;
        if (['00', '20'].includes(cst) && Number(produto.aliqIcms || 0) <= 0) return `Alíquota de ICMS ausente no produto "${item.produtoNome}"`;
        if (cst === '20' && Number(produto.pRedBC || 0) <= 0) return `Redução da base de ICMS ausente para CST 20 no produto "${item.produtoNome}"`;
      } else {
        const csosn = String(produto.csosn || '102');
        const aceitos = regime === 'MEI' ? ['102', '300'] : ['102', '400'];
        if (!aceitos.includes(csosn)) return `CSOSN ${csosn} não suportado para o regime ${regime} no produto "${item.produtoNome}"`;
      }
    }
    return null;
  }

  private async reservarNumero(configuracaoId: string): Promise<number> {
    const linhas = await this.prisma.$queryRaw<Array<{ numero: number | bigint }>>`
      UPDATE "configuracoes_fiscais" SET "proximoNumero" = "proximoNumero" + 1 WHERE id = ${configuracaoId} RETURNING "proximoNumero" - 1 AS numero
    `;
    const numero = Number(linhas?.[0]?.numero ?? 0);
    if (!numero) throw new BadRequestException('Falha ao reservar numeração da NFC-e');
    return numero;
  }

  private montarParams(pedido: any, config: any): EmitirNFeParams {
    const endEmitente = config.endereco || {};
    const destinatario: EmitirNFeParams['destinatario'] = {};
    const documentoDestinatario = digitsOnly(pedido.clienteCpf || '');
    if (documentoDestinatario.length === 11) destinatario.cpf = documentoDestinatario;
    if (documentoDestinatario.length === 14) destinatario.cnpj = documentoDestinatario;
    if (pedido.clienteNome) destinatario.nome = pedido.clienteNome;
    if (pedido.tipoEntrega === 'ENTREGA' && pedido.endereco) {
      const e: Record<string, unknown> = typeof pedido.endereco === 'string' ? { logradouro: pedido.endereco } : (pedido.endereco as Record<string, unknown>);
      destinatario.logradouro = String(e.logradouro || e.rua || e.endereco || '');
      destinatario.numero = String(e.numero || '');
      destinatario.bairro = String(e.bairro || '');
      destinatario.cidade = String(e.cidade || '');
      destinatario.uf = String(e.uf || e.estado || 'CE');
      destinatario.cep = String(e.cep || '');
      const mesmaCidadeEmitente = String(e.cidade || '').trim().toLowerCase()
        === String(endEmitente.cidade || pedido.negocio?.cidade || '').trim().toLowerCase();
      destinatario.codigoMunicipio = String(e.codigoMunicipio || e.codigoIbge || (mesmaCidadeEmitente ? endEmitente.codigoMunicipio || endEmitente.codigoIbge || '' : '')) || undefined;
    }

    const regime = config.regime;
    const itens: NFeItem[] = pedido.itens.map((i: any) => {
      const p = i.produto || {};
      return {
        nome: i.produtoNome,
        ncm: p.ncm || '',
        cfop: p.cfop || '',
        uCom: (p.unidadeMedida || 'UN').toUpperCase(),
        qCom: Number(i.quantidade),
        vUnCom: Number(i.precoUnitario),
        vProd: Number((Number(i.precoUnitario) * Number(i.quantidade)).toFixed(2)),
        cEAN: p.codigoBarras || undefined,
        cEANTrib: p.codigoBarras || undefined,
        fiscal: {
          origem: p.origem ?? 0,
          csosn: p.csosn || '102',
          cstIcms: p.cstIcms || '00',
          pRedBC: p.pRedBC != null ? Number(p.pRedBC) : undefined,
          aliqIcms: p.aliqIcms != null ? Number(p.aliqIcms) : undefined,
          aliqPis: p.aliqPis != null ? Number(p.aliqPis) : undefined,
          aliqCofins: p.aliqCofins != null ? Number(p.aliqCofins) : undefined,
          aliqTributosFederais: p.aliqTributosFederais != null ? Number(p.aliqTributosFederais) : undefined,
          aliqTributosEstaduais: p.aliqTributosEstaduais != null ? Number(p.aliqTributosEstaduais) : undefined,
          aliqTributosMunicipais: p.aliqTributosMunicipais != null ? Number(p.aliqTributosMunicipais) : undefined,
          fonteTributosAproximados: p.fonteTributosAproximados || undefined,
          vigenciaTributosAproximados: p.vigenciaTributosAproximados
            ? new Date(p.vigenciaTributosAproximados).toISOString().slice(0, 10)
            : undefined,
          cest: p.cest || undefined,
        },
      };
    });

    const pagamentos: NFePagamento[] = pedido.pagamentos
      .filter((pg: any) => pg.status !== 'CANCELADO' && pg.status !== 'RECUSADO')
      .map((pg: any) => {
        const tPag = this.mapearPagamento(pg.metodo);
        const dados = (pg.dadosPagamento || {}) as Record<string, unknown>;
        const temDadosPag = ['03', '04', '05', '17', '20'].includes(tPag)
          && (typeof dados.tpIntegra === 'string' || typeof dados.cnpj === 'string' || typeof dados.cAut === 'string');
        return {
          tPag,
          vPag: Number(pg.valor) + (pg.metodo === 'DINHEIRO'
            ? Math.max(0, Number(dados.valorPago ?? pg.valor) - Number(pg.valor))
            : 0),
          ...(pg.metodo === 'CREDIARIO' ? { xPag: 'Crediario (pagamento posterior - IN 142/2025-CE)' } : {}),
          ...(pg.metodo === 'OUTRO' ? { xPag: 'Outros' } : {}),
          ...(temDadosPag
            ? {
                card: {
                  tpIntegra: '1' as const,
                  ...(typeof dados.cnpj === 'string' ? { CNPJ: dados.cnpj } : {}),
                  ...(typeof dados.tBand === 'string' ? { tBand: dados.tBand } : {}),
                  ...(typeof dados.cAut === 'string' ? { cAut: dados.cAut } : {}),
                  ...(typeof dados.CNPJReceb === 'string' ? { CNPJReceb: dados.CNPJReceb } : {}),
                  ...(typeof dados.idTermPag === 'string' ? { idTermPag: dados.idTermPag } : {}),
                },
              }
            : {}),
        };
      });

    return {
      negocio: {
        cnpj: config.cnpj,
        razaoSocial: config.razaoSocial || pedido.negocio.nome,
        nomeFantasia: pedido.negocio.nome,
        ie: config.ie,
        logradouro: endEmitente.logradouro || '',
        numero: endEmitente.numero || '',
        bairro: endEmitente.bairro || '',
        cidade: String(endEmitente.cidade || pedido.negocio.cidade || '').trim(),
        codigoMunicipio: endEmitente.codigoMunicipio || endEmitente.codigoIbge || undefined,
        uf: endEmitente.estado || '',
        cep: endEmitente.cep || '',
         regimeTributario: regime === 'REGIME_NORMAL' ? 3 : regime === 'MEI' ? 4 : 1,
      },
      destinatario,
      itens,
      pagamentos,
      descontoTotal: Number(pedido.descontoTotal || 0),
      frete: Number(pedido.taxaFrete || 0),
      outrasDespesas: Number(pedido.taxaCartao || 0),
      troco: Number(pedido.troco || 0),
      observacao: pedido.observacao || undefined,
      entrega: pedido.tipoEntrega === 'ENTREGA',
    };
  }

  private mapearPagamento(metodo: string): string {
    const mapa: Record<string, string> = {
      DINHEIRO: '01',
      CARTAO_CREDITO: '03',
      CARTAO_DEBITO: '04',
      PIX: '20',
      CREDIARIO: '91',
      OUTRO: '99',
    };
    return mapa[metodo] || '99';
  }

  private montarContexto(config: any, numero?: number): NFeTransmissaoContexto | null {
    if (!config?.certificadoA1Criptografado || !config?.certificadoSenhaCriptografada || !config?.cscId || !config?.cscCriptografado) return null;
    if (config.certificadoValidade && new Date(config.certificadoValidade).getTime() < Date.now()) return null;
    return {
      ambiente: config.ambiente,
      serie: config.serie,
      numero: numero ?? config.proximoNumero,
      cnpj: config.cnpj,
      cscId: config.cscId,
      csc: this.descriptografar(config.cscCriptografado),
      certificadoPfx: Buffer.from(this.descriptografar(config.certificadoA1Criptografado), 'base64'),
      senhaCertificado: this.descriptografar(config.certificadoSenhaCriptografada),
    };
  }

  /** Registra um gateway alternativo (ex.: FocusNFe). Chame no bootstrap se aplicável. */
  setGateway(gateway: INfeGateway) {
    this.gateway = gateway;
    this.logger.log('Gateway de NFe registrado');
  }
}
