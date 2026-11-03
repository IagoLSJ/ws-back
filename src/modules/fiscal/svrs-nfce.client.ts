import { Injectable, Logger } from '@nestjs/common';
import { createHash, sign } from 'node:crypto';
import { request } from 'node:https';
import { SignedXml } from 'xml-crypto';
import {
  EmitirNFeParams,
  INfeGateway,
  NFeEventoResultado,
  NFeResultado,
  NFeTransmissaoContexto,
} from './nfe-gateway.interface';
import { CertificadoPem as Certificado, extrairCertificadoA1 } from './certificado-a1';
import { carregarCAsSefaz } from './sefaz-ca';

interface RespostaSefaz {
  rawXml: string;
  cStat?: string;
  xMotivo?: string;
  chave?: string;
  protocolo?: string;
  nRec?: string;
  rejeicao?: boolean;
}

export class SefazRedeError extends Error {}

type TributosCalculados = Pick<
  NFeResultado,
  'tributosAproximados' | 'tributosFederaisAproximados' | 'tributosEstaduaisAproximados' | 'tributosMunicipaisAproximados' | 'fontesTributosAproximados'
>;

const CSTAT_AUTORIZADAS = ['100', '150'];
const CSTAT_PROCESSANDO = ['103', '105'];

interface QrMeta {
  dhEmi: string;
  vNF: number;
  tpEmis: '1' | '9';
  destDoc?: string;
  destInd?: '1' | '2';
  privKey?: string;
}

@Injectable()
export class SvrsNfceClient implements INfeGateway {
  private readonly logger = new Logger(SvrsNfceClient.name);
  private readonly homologacao = 'https://nfce-homologacao.svrs.rs.gov.br/ws';
  private readonly producao = 'https://nfce.svrs.rs.gov.br/ws';
  private readonly qrVersao = process.env.FISCAL_QR_VERSION || '2';

  async emitir(params: EmitirNFeParams, contexto: NFeTransmissaoContexto): Promise<NFeResultado> {
    const cert = this.extrairCertificado(contexto.certificadoPfx, contexto.senhaCertificado);
    const { xml, chave, tributos, dhEmi, total } = this.montarXml(params, contexto);
    const assinado = this.assinar(xml, cert);
    const meta: QrMeta = { dhEmi, vNF: total, tpEmis: params.contingencia ? '9' : '1', privKey: cert.privateKey, ...this.destMeta(params) };
    const xmlFinal = this.inserirQrCode(assinado, chave, contexto, meta);
    return this.transmitir(xmlFinal, chave, contexto, cert, tributos);
  }

  gerarXmlContingencia(params: EmitirNFeParams, contexto: NFeTransmissaoContexto): { xml: string; chave: string } {
    const cert = this.extrairCertificado(contexto.certificadoPfx, contexto.senhaCertificado);
    if (!params.contingencia) throw new Error('Contingência exige dhCont e xJust');
    const { xml, chave, dhEmi, total } = this.montarXml(params, contexto);
    const assinado = this.assinar(xml, cert);
    const meta: QrMeta = { dhEmi, vNF: total, tpEmis: '9', privKey: cert.privateKey, ...this.destMeta(params) };
    return { xml: this.inserirQrCode(assinado, chave, contexto, meta), chave };
  }

  async reenviar(xmlAssinado: string, chave: string, contexto: NFeTransmissaoContexto): Promise<NFeResultado> {
    const cert = this.extrairCertificado(contexto.certificadoPfx, contexto.senhaCertificado);
    const totalXml = this.bloco(xmlAssinado, 'ICMSTot');
    const vTotTrib = totalXml ? Number(this.tag(totalXml, 'vTotTrib') || 0) : undefined;
    return this.transmitir(xmlAssinado, chave, contexto, cert, { tributosAproximados: vTotTrib });
  }

  private destMeta(params: EmitirNFeParams): Pick<QrMeta, 'destDoc' | 'destInd'> {
    const cpf = this.digits(params.destinatario.cpf || '');
    const cnpj = this.digits(params.destinatario.cnpj || '');
    if (cnpj) return { destDoc: cnpj, destInd: '1' };
    if (cpf) return { destDoc: cpf, destInd: '2' };
    return {};
  }

  private async transmitir(
    xmlFinal: string,
    chave: string,
    contexto: NFeTransmissaoContexto,
    cert: Certificado,
    tributos: TributosCalculados = {},
  ): Promise<NFeResultado> {
    const base: Omit<NFeResultado, 'status'> = {
      chaveAcesso: chave,
      numeroNfe: contexto.numero,
      serieNfe: contexto.serie,
      xmlAssinado: xmlFinal,
      ...tributos,
    };
    let resposta: RespostaSefaz;
    try {
      resposta = await this.soap(
        'NfeAutorizacao4',
        `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${this.lote()}</idLote><indSinc>1</indSinc>${xmlFinal}</enviNFe>`,
        contexto,
        cert,
      );
    } catch (error) {
      if (error instanceof SefazRedeError) {
        this.logger.warn(`Falha de rede na autorização NFC-e ${chave}: ${error.message}`);
        return { status: 'ERRO_REDE', ...base, xMotivo: error.message };
      }
      throw error;
    }

    if (resposta.cStat === '103' && resposta.nRec) {
      const nRec = resposta.nRec;
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        await new Promise((r) => setTimeout(r, 3000));
        resposta = await this.consultarRecibo(nRec, contexto, cert);
        if (resposta.cStat !== '105') break;
      }
      if (CSTAT_PROCESSANDO.includes(resposta.cStat || '')) {
        return { status: 'PROCESSANDO', ...base, recibo: resposta.nRec, cStat: resposta.cStat, xMotivo: resposta.xMotivo };
      }
    }

    // 104 significa apenas que o lote foi processado. A autorização é indicada
    // pelo cStat do protNFe (100 ou 150), nunca pelo retorno externo do lote.
    if (resposta.cStat === '104' && !resposta.protocolo) {
      return { status: 'PROCESSANDO', ...base, recibo: resposta.nRec, cStat: resposta.cStat, xMotivo: resposta.xMotivo };
    }
    if (!CSTAT_AUTORIZADAS.includes(resposta.cStat || '') || resposta.rejeicao) {
      return {
        status: 'REJEITADA',
        ...base,
        chaveAcesso: resposta.chave || chave,
        cStat: resposta.cStat,
        xMotivo: resposta.xMotivo,
        xmlAutorizado: resposta.rawXml,
      };
    }
    return {
      status: 'AUTORIZADA',
      ...base,
      chaveAcesso: resposta.chave || chave,
      protocolo: resposta.protocolo,
      xmlAutorizado: resposta.rawXml,
      qrCodeUrl: this.tag(xmlFinal, 'qrCode') ?? undefined,
      cStat: resposta.cStat,
      xMotivo: resposta.xMotivo,
    };
  }

  async cancelar(chaveAcesso: string, motivo: string, contexto: NFeTransmissaoContexto): Promise<NFeEventoResultado> {
    if (motivo.trim().length < 15) throw new Error('O motivo do cancelamento deve ter ao menos 15 caracteres');
    const cert = this.extrairCertificado(contexto.certificadoPfx, contexto.senhaCertificado);
    const consulta = await this.consultar(chaveAcesso, contexto);
    if (!consulta.protocolo) throw new Error('NFC-e não possui protocolo autorizado para cancelamento');
    const nSeq = 1;
    const id = `ID110111${chaveAcesso}${String(nSeq).padStart(2, '0')}`;
    const corpo = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${id}"><cOrgao>23</cOrgao><tpAmb>${this.tpAmb(contexto)}</tpAmb><CNPJ>${this.digits(chaveAcesso).slice(6, 20)}</CNPJ><chNFe>${chaveAcesso}</chNFe><dhEvento>${this.dataHora()}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>${nSeq}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${consulta.protocolo}</nProt><xJust>${this.escapar(motivo)}</xJust></detEvento></infEvento></evento>`;
    const assinado = this.assinar(corpo, cert);
    const resposta = await this.soap(
      'RecepcaoEvento4',
      `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${this.lote()}</idLote>${assinado}</envEvento>`,
      contexto,
      cert,
    );
    return {
      cStat: resposta.cStat,
      xMotivo: resposta.xMotivo,
      protocolo: resposta.protocolo,
      xmlEvento: assinado,
      xmlResposta: resposta.rawXml,
    };
  }

  async consultar(chaveAcesso: string, contexto: NFeTransmissaoContexto) {
    const cert = this.extrairCertificado(contexto.certificadoPfx, contexto.senhaCertificado);
    const resposta = await this.soap(
      'NfeConsultaProtocolo4',
      `<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${this.tpAmb(contexto)}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chaveAcesso}</chNFe></consSitNFe>`,
      contexto,
      cert,
    );
    return { status: resposta.cStat || 'DESCONHECIDO', protocolo: resposta.protocolo, cStat: resposta.cStat, xMotivo: resposta.xMotivo };
  }

  async inutilizar(serie: number, numeroInicial: number, numeroFinal: number, justificativa: string, contexto: NFeTransmissaoContexto): Promise<NFeEventoResultado> {
    if (justificativa.trim().length < 15) throw new Error('A justificativa da inutilização deve ter ao menos 15 caracteres');
    if (numeroFinal < numeroInicial) throw new Error('Faixa de numeração inválida');
    if (numeroFinal - numeroInicial > 99) throw new Error('A inutilização permite no máximo 100 números por evento');
    const cert = this.extrairCertificado(contexto.certificadoPfx, contexto.senhaCertificado);
    const cnpj = this.digits(contexto.cnpj || '');
    const ano = this.dataHora().slice(2, 4);
    const modelo = '65';
    const cUf = '23';
    const serieChave = String(serie).padStart(3, '0');
    const numeroInicialChave = String(numeroInicial).padStart(9, '0');
    const numeroFinalChave = String(numeroFinal).padStart(9, '0');
    const id = `ID${cUf}${ano}${cnpj}${modelo}${serieChave}${numeroInicialChave}${numeroFinalChave}`;
    const corpo = `<inutNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><infInut Id="${id}"><tpAmb>${this.tpAmb(contexto)}</tpAmb><xServ>INUTILIZAR</xServ><cUF>${cUf}</cUF><ano>${ano}</ano><CNPJ>${cnpj}</CNPJ><mod>${modelo}</mod><serie>${serie}</serie><nNFIni>${numeroInicial}</nNFIni><nNFFin>${numeroFinal}</nNFFin><xJust>${this.escapar(justificativa)}</xJust></infInut></inutNFe>`;
    const assinado = this.assinar(corpo, cert);
    const resposta = await this.soap(
      'NfeInutilizacao4',
      assinado,
      contexto,
      cert,
    );
    return {
      cStat: resposta.cStat,
      xMotivo: resposta.xMotivo,
      protocolo: resposta.protocolo,
      xmlEvento: assinado,
      xmlResposta: resposta.rawXml,
    };
  }

  private montarXml(params: EmitirNFeParams, contexto: NFeTransmissaoContexto) {
    const cnpj = this.digits(params.negocio.cnpj).padStart(14, '0');
    const ufSigla = String(params.negocio.uf || '').trim().toUpperCase();
    if (ufSigla !== 'CE') throw new Error('A NFC-e deste gateway exige emitente localizado no Ceará (UF CE)');
    const uf = this.uf(ufSigla);
    const codigoMunicipio = this.digits(params.negocio.codigoMunicipio || '');
    if (codigoMunicipio.length !== 7) throw new Error('Código IBGE do município do emitente não configurado');
    const cidade = this.textoXml(params.negocio.cidade).trim();
    if (cidade.length < 2 || cidade.length > 60) {
      throw new Error(`Cidade do emitente inválida para o XML NFC-e: informe entre 2 e 60 caracteres (recebido ${cidade.length})`);
    }
    if (contexto.serie < 1 || contexto.serie > 899) throw new Error('Série da NFC-e deve estar entre 1 e 899 para emissão normal');
    const numero = String(contexto.numero).padStart(9, '0');
    const serie = String(contexto.serie).padStart(3, '0');
    const dhEmi = this.dataHora();
    const aamm = dhEmi.slice(2, 4) + dhEmi.slice(5, 7);
    const cNF = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
    const tpEmis = params.contingencia ? '9' : '1';
    const semDv = `${uf}${aamm}${cnpj}65${serie}${numero}${tpEmis}${cNF}`;
    const chave = `${semDv}${this.mod11(semDv)}`;

    let vBC = 0;
    let vICMS = 0;
    let vPIS = 0;
    let vCOFINS = 0;
    let vTotTribFederal = 0;
    let vTotTribEstadual = 0;
    let vTotTribMunicipal = 0;

    const regimeNormal = params.negocio.regimeTributario === 3;
    const totalProdutos = Number(params.itens.reduce((sum, item) => sum + item.vProd, 0).toFixed(2));
    const descontoTotal = Number(params.descontoTotal || 0);
    const frete = Number(params.frete || 0);
    const outrasDespesas = Number(params.outrasDespesas || 0);
    if (descontoTotal < 0 || descontoTotal > totalProdutos) throw new Error('Desconto total inválido para a NFC-e');
    if (frete < 0 || outrasDespesas < 0) throw new Error('Frete ou outras despesas não podem ser negativos');
    const total = Number((totalProdutos - descontoTotal + frete + outrasDespesas).toFixed(2));
    if (total >= 200000) throw new Error('NFC-e não permitida para valor igual ou superior a R$ 200.000,00 — emita NF-e modelo 55');
    const somaPagamentos = params.pagamentos.reduce((sum, p) => sum + p.vPag, 0);
    const troco = Number(params.troco || 0);
    if (Math.abs(somaPagamentos - troco - total) > 0.01) {
      throw new Error(`Pagamentos menos troco (R$ ${(somaPagamentos - troco).toFixed(2)}) devem ser iguais ao valor da NFC-e (R$ ${total.toFixed(2)})`);
    }

    const valoresBrutos = params.itens.map((item) => Number(item.vProd.toFixed(2)));
    const descontosItens = this.ratear(descontoTotal, valoresBrutos);
    const fretesItens = this.ratear(frete, valoresBrutos);
    const outrasDespesasItens = this.ratear(outrasDespesas, valoresBrutos);
    const temAlgumaEstimativa = params.itens.some((item) => {
      const fiscal = item.fiscal;
      return fiscal?.aliqTributosFederais != null
        || fiscal?.aliqTributosEstaduais != null
        || fiscal?.aliqTributosMunicipais != null;
    });
    const estimativaConfigurada = params.itens.length > 0 && params.itens.every((item, index) => {
      const fiscal = item.fiscal;
      const aliquotas = [fiscal?.aliqTributosFederais, fiscal?.aliqTributosEstaduais, fiscal?.aliqTributosMunicipais].map(Number);
      const completas = aliquotas.every((aliquota) => Number.isFinite(aliquota) && aliquota >= 0 && aliquota <= 100);
      const fonteVigente = Boolean(fiscal?.fonteTributosAproximados?.trim() && fiscal?.vigenciaTributosAproximados);
      if (temAlgumaEstimativa && (!completas || !fonteVigente)) {
        throw new Error(`Estimativa aproximada incompleta ou inválida no item ${index + 1}`);
      }
      return completas && fonteVigente;
    });
    const fontesTributosAproximados = estimativaConfigurada
      ? [...new Set(params.itens.map((item) => {
          const fonte = item.fiscal?.fonteTributosAproximados?.trim();
          const vigencia = item.fiscal?.vigenciaTributosAproximados;
          return fonte ? `${fonte}${vigencia ? ` (vigência ${vigencia})` : ''}` : '';
        }).filter(Boolean))].join('; ')
      : undefined;

    const itens = params.itens.map((item, index) => {
      if (!/^\d{8}$/.test(this.digits(item.ncm))) throw new Error(`NCM inválido ou ausente no item ${index + 1}`);
      if (!/^\d{4}$/.test(this.digits(item.cfop))) throw new Error(`CFOP inválido ou ausente no item ${index + 1}`);
      if (item.qCom <= 0 || item.vUnCom < 0) throw new Error(`Quantidade ou preço inválido no item ${index + 1}`);
      const vProd = valoresBrutos[index];
      const vDesc = descontosItens[index];
      const vFrete = fretesItens[index];
      const vOutro = outrasDespesasItens[index];
      const baseOperacao = Number((vProd - vDesc + vFrete + vOutro).toFixed(2));
      const fiscal = item.fiscal || { origem: 0 };
      const orig = fiscal.origem ?? 0;
      let icms: string;
      if (regimeNormal) {
        const cst = String(fiscal.cstIcms || '00');
        if (['40', '41', '50'].includes(cst)) {
          icms = `<ICMS><ICMS${cst === '41' ? '41' : cst === '50' ? '50' : '40'}><orig>${orig}</orig><CST>${cst}</CST></ICMS${cst === '41' ? '41' : cst === '50' ? '50' : '40'}></ICMS>`;
        } else if (cst === '00' || cst === '20') {
          const aliq = Number(fiscal.aliqIcms || 0);
          if (aliq <= 0) throw new Error(`Aliquota de ICMS não configurada no item ${index + 1} (regime normal exige CST 00 com alíquota)`);
          const pRedBC = Number(fiscal.pRedBC || 0);
          if (cst === '20' && pRedBC <= 0) throw new Error(`Redução da base de ICMS obrigatória para CST 20 no item ${index + 1}`);
          if (pRedBC < 0 || pRedBC >= 100) throw new Error(`Redução da base de ICMS inválida no item ${index + 1}`);
          const baseICMS = cst === '20' ? Number((baseOperacao * (1 - pRedBC / 100)).toFixed(2)) : baseOperacao;
          const vItem = Number((baseICMS * aliq / 100).toFixed(2));
          vBC += baseICMS;
          vICMS += vItem;
          const grupo = cst === '00' ? 'ICMS00' : 'ICMS20';
          icms = `<ICMS><${grupo}><orig>${orig}</orig><CST>${cst}</CST><modBC>3</modBC>${cst === '20' ? `<pRedBC>${pRedBC.toFixed(4)}</pRedBC>` : ''}<vBC>${this.decimal(baseICMS)}</vBC><pICMS>${aliq.toFixed(2)}</pICMS><vICMS>${this.decimal(vItem)}</vICMS></${grupo}></ICMS>`;
        } else {
          throw new Error(`CST de ICMS '${cst}' não suportado no item ${index + 1}. Suportados: 00, 20, 40, 41, 50.`);
        }
      } else {
        const csosn = String(fiscal.csosn || '102');
        const mei = params.negocio.regimeTributario === 4;
        const aceitos = mei ? ['102', '300'] : ['102', '400'];
        if (!aceitos.includes(csosn)) {
          throw new Error(`CSOSN '${csosn}' não suportado para CRT=${params.negocio.regimeTributario} no item ${index + 1}. Permitidos neste módulo: ${aceitos.join(', ')}.`);
        }
        const grupo = csosn === '300' ? 'ICMSSN300' : csosn === '400' ? 'ICMSSN400' : 'ICMSSN102';
        icms = `<ICMS><${grupo}><orig>${orig}</orig><CSOSN>${csosn}</CSOSN></${grupo}></ICMS>`;
      }

      let pis: string;
      let cofins: string;
      const aliqPis = Number(fiscal.aliqPis || 0);
      const cstPis = String(fiscal.cstPis || (regimeNormal ? (aliqPis > 0 ? '01' : '99') : '06'));
      if (['01', '02'].includes(cstPis)) {
        if (aliqPis <= 0) throw new Error(`Alíquota PIS não configurada no item ${index + 1}`);
        const vItem = Number((baseOperacao * aliqPis / 100).toFixed(2));
        vPIS += vItem;
        pis = `<PIS><PISAliq><CST>${cstPis}</CST><vBC>${this.decimal(baseOperacao)}</vBC><pPIS>${aliqPis.toFixed(2)}</pPIS><vPIS>${this.decimal(vItem)}</vPIS></PISAliq></PIS>`;
      } else if (['04', '05', '06', '07', '08', '09'].includes(cstPis)) {
        pis = `<PIS><PISNT><CST>${cstPis}</CST></PISNT></PIS>`;
      } else if (['49', '99'].includes(cstPis)) {
        const basePis = aliqPis > 0 ? baseOperacao : 0;
        const vItem = Number((basePis * aliqPis / 100).toFixed(2));
        vPIS += vItem;
        pis = `<PIS><PISOutr><CST>${cstPis}</CST><vBC>${this.decimal(basePis)}</vBC><pPIS>${aliqPis.toFixed(2)}</pPIS><vPIS>${this.decimal(vItem)}</vPIS></PISOutr></PIS>`;
      } else {
        throw new Error(`CST PIS '${cstPis}' não suportado no item ${index + 1}`);
      }

      const aliqCofins = Number(fiscal.aliqCofins || 0);
      const cstCofins = String(fiscal.cstCofins || (regimeNormal ? (aliqCofins > 0 ? '01' : '99') : '06'));
      if (['01', '02'].includes(cstCofins)) {
        if (aliqCofins <= 0) throw new Error(`Alíquota COFINS não configurada no item ${index + 1}`);
        const vItem = Number((baseOperacao * aliqCofins / 100).toFixed(2));
        vCOFINS += vItem;
        cofins = `<COFINS><COFINSAliq><CST>${cstCofins}</CST><vBC>${this.decimal(baseOperacao)}</vBC><pCOFINS>${aliqCofins.toFixed(2)}</pCOFINS><vCOFINS>${this.decimal(vItem)}</vCOFINS></COFINSAliq></COFINS>`;
      } else if (['04', '05', '06', '07', '08', '09'].includes(cstCofins)) {
        cofins = `<COFINS><COFINSNT><CST>${cstCofins}</CST></COFINSNT></COFINS>`;
      } else if (['49', '99'].includes(cstCofins)) {
        const baseCofins = aliqCofins > 0 ? baseOperacao : 0;
        const vItem = Number((baseCofins * aliqCofins / 100).toFixed(2));
        vCOFINS += vItem;
        cofins = `<COFINS><COFINSOutr><CST>${cstCofins}</CST><vBC>${this.decimal(baseCofins)}</vBC><pCOFINS>${aliqCofins.toFixed(2)}</pCOFINS><vCOFINS>${this.decimal(vItem)}</vCOFINS></COFINSOutr></COFINS>`;
      } else {
        throw new Error(`CST COFINS '${cstCofins}' não suportado no item ${index + 1}`);
      }

      let tributoFederalItem = 0;
      let tributoEstadualItem = 0;
      let tributoMunicipalItem = 0;
      if (estimativaConfigurada) {
        tributoFederalItem = Number((baseOperacao * Number(fiscal.aliqTributosFederais) / 100).toFixed(2));
        tributoEstadualItem = Number((baseOperacao * Number(fiscal.aliqTributosEstaduais) / 100).toFixed(2));
        tributoMunicipalItem = Number((baseOperacao * Number(fiscal.aliqTributosMunicipais) / 100).toFixed(2));
        vTotTribFederal += tributoFederalItem;
        vTotTribEstadual += tributoEstadualItem;
        vTotTribMunicipal += tributoMunicipalItem;
      }
      const vTotTribItem = estimativaConfigurada
        ? `<vTotTrib>${this.decimal(tributoFederalItem + tributoEstadualItem + tributoMunicipalItem)}</vTotTrib>`
        : '';
      // XSD 4.00: vTotTrib é o primeiro filho de <imposto>, antes de ICMS.
      const cest = fiscal.cest ? `<CEST>${this.digits(fiscal.cest)}</CEST>` : '';
      const vFreteTag = vFrete > 0 ? `<vFrete>${this.decimal(vFrete)}</vFrete>` : '';
      const vDescTag = vDesc > 0 ? `<vDesc>${this.decimal(vDesc)}</vDesc>` : '';
      const vOutroTag = vOutro > 0 ? `<vOutro>${this.decimal(vOutro)}</vOutro>` : '';
      // cStat 373 (homologação): descrição do PRIMEIRO item deve ser exatamente a frase obrigatória
      const homolog = contexto.ambiente === 'HOMOLOGACAO';
      const descricao = homolog && index === 0 ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' : item.nome;
      return `<det nItem="${index + 1}"><prod><cProd>${index + 1}</cProd><cEAN>${this.escapar(item.cEAN || 'SEM GTIN')}</cEAN><xProd>${this.escapar(descricao)}</xProd><NCM>${this.digits(item.ncm)}</NCM>${cest}<CFOP>${this.digits(item.cfop)}</CFOP><uCom>${this.escapar(item.uCom)}</uCom><qCom>${this.decimalN(item.qCom, 4)}</qCom><vUnCom>${this.decimalN(item.vUnCom, 10)}</vUnCom><vProd>${this.decimal(vProd)}</vProd><cEANTrib>${this.escapar(item.cEANTrib || item.cEAN || 'SEM GTIN')}</cEANTrib><uTrib>${this.escapar(item.uCom)}</uTrib><qTrib>${this.decimalN(item.qCom, 4)}</qTrib><vUnTrib>${this.decimalN(item.vUnCom, 10)}</vUnTrib>${vFreteTag}${vDescTag}${vOutroTag}<indTot>1</indTot></prod><imposto>${vTotTribItem}${icms}${pis}${cofins}</imposto></det>`;
    }).join('');

    const dest = this.montarDestinatario(params);
    const pag = params.pagamentos.map((p) => {
      const card = p.card
        ? `<card><tpIntegra>${p.card.tpIntegra}</tpIntegra>${p.card.CNPJ ? `<CNPJ>${this.digits(p.card.CNPJ)}</CNPJ>` : ''}${p.card.tBand ? `<tBand>${this.digits(p.card.tBand).padStart(2, '0').slice(-2)}</tBand>` : ''}${p.card.cAut ? `<cAut>${this.escapar(p.card.cAut)}</cAut>` : ''}${p.card.CNPJReceb ? `<CNPJReceb>${this.digits(p.card.CNPJReceb)}</CNPJReceb>` : ''}${p.card.idTermPag ? `<idTermPag>${this.escapar(p.card.idTermPag)}</idTermPag>` : ''}</card>`
        : '';
      const xPag = p.xPag ? `<xPag>${this.escapar(p.xPag)}</xPag>` : '';
      return `<detPag><tPag>${this.escapar(p.tPag)}</tPag>${xPag}<vPag>${this.decimal(p.vPag)}</vPag>${card}</detPag>`;
    }).join('');

    const contingencia = params.contingencia
      ? `<dhCont>${params.contingencia.dhCont}</dhCont><xJust>${this.escapar(params.contingencia.xJust)}</xJust>`
      : '';
    const obsHomolog = contexto.ambiente === 'HOMOLOGACAO' ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' : '';
    const obsTributos = estimativaConfigurada && fontesTributosAproximados
      ? `Tributos aproximados calculados com base em ${fontesTributosAproximados}`
      : '';
    const infCpl = [params.observacao, obsHomolog, obsTributos].filter(Boolean).join(' | ');
    vTotTribFederal = Number(vTotTribFederal.toFixed(2));
    vTotTribEstadual = Number(vTotTribEstadual.toFixed(2));
    vTotTribMunicipal = Number(vTotTribMunicipal.toFixed(2));
    const vTotTrib = Number((vTotTribFederal + vTotTribEstadual + vTotTribMunicipal).toFixed(2));
    const vTroco = troco > 0 ? `<vTroco>${this.decimal(troco)}</vTroco>` : '';

    const indPres = params.entrega ? '4' : '1';
    const inf = `<infNFe Id="NFe${chave}" versao="4.00"><ide><cUF>${uf}</cUF><cNF>${cNF}</cNF><natOp>VENDA</natOp><mod>65</mod><serie>${contexto.serie}</serie><nNF>${contexto.numero}</nNF><dhEmi>${dhEmi}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>${codigoMunicipio}</cMunFG><tpImp>4</tpImp><tpEmis>${tpEmis}</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>${this.tpAmb(contexto)}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>${indPres}</indPres><procEmi>0</procEmi><verProc>walker-salgados</verProc>${contingencia}</ide><emit><CNPJ>${cnpj}</CNPJ><xNome>${this.escapar(params.negocio.razaoSocial)}</xNome><xFant>${this.escapar(params.negocio.nomeFantasia)}</xFant><enderEmit><xLgr>${this.escapar(params.negocio.logradouro)}</xLgr><nro>${this.escapar(params.negocio.numero)}</nro><xBairro>${this.escapar(params.negocio.bairro)}</xBairro><cMun>${codigoMunicipio}</cMun><xMun>${this.escapar(cidade)}</xMun><UF>${this.escapar(ufSigla)}</UF><CEP>${this.digits(params.negocio.cep)}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderEmit><IE>${this.digits(params.negocio.ie || '')}</IE><CRT>${params.negocio.regimeTributario}</CRT></emit>${dest}${itens}<total><ICMSTot><vBC>${this.decimal(vBC)}</vBC><vICMS>${this.decimal(vICMS)}</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${this.decimal(totalProdutos)}</vProd><vFrete>${this.decimal(frete)}</vFrete><vSeg>0.00</vSeg><vDesc>${this.decimal(descontoTotal)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>${this.decimal(vPIS)}</vPIS><vCOFINS>${this.decimal(vCOFINS)}</vCOFINS><vOutro>${this.decimal(outrasDespesas)}</vOutro><vNF>${this.decimal(total)}</vNF>${estimativaConfigurada ? `<vTotTrib>${this.decimal(vTotTrib)}</vTotTrib>` : ''}</ICMSTot></total><transp><modFrete>9</modFrete></transp><pag>${pag}${vTroco}</pag>${infCpl ? `<infAdic><infCpl>${this.escapar(infCpl.slice(0, 500))}</infCpl></infAdic>` : ''}</infNFe>`;
    const unsigned = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${inf}</NFe>`;
    const tributos = estimativaConfigurada ? {
      tributosAproximados: vTotTrib,
      tributosFederaisAproximados: vTotTribFederal,
      tributosEstaduaisAproximados: vTotTribEstadual,
      tributosMunicipaisAproximados: vTotTribMunicipal,
      fontesTributosAproximados,
    } : {};
    return { xml: unsigned, chave, tributos, dhEmi, total };
  }

  private montarDestinatario(params: EmitirNFeParams): string {
    const d = params.destinatario;
    const cpf = this.digits(d.cpf || '');
    const cnpj = this.digits(d.cnpj || '');
    if (!cpf && !cnpj) return '';
    const doc = cpf ? `<CPF>${cpf}</CPF>` : `<CNPJ>${cnpj}</CNPJ>`;
    const nome = d.nome ? `<xNome>${this.escapar(d.nome)}</xNome>` : '';
    let ender = '';
    if (d.logradouro && d.cidade && d.uf) {
      const codigoMun = this.digits(d.codigoMunicipio || '');
      ender = `<enderDest><xLgr>${this.escapar(d.logradouro)}</xLgr><nro>${this.escapar(d.numero || 'S/N')}</nro><xBairro>${this.escapar(d.bairro || 'CENTRO')}</xBairro>${codigoMun.length === 7 ? `<cMun>${codigoMun}</cMun>` : ''}<xMun>${this.escapar(d.cidade)}</xMun><UF>${this.escapar(String(d.uf).toUpperCase())}</UF>${d.cep ? `<CEP>${this.digits(d.cep)}</CEP>` : ''}<cPais>1058</cPais><xPais>BRASIL</xPais></enderDest>`;
    }
    return `<dest>${doc}${nome}${ender}<indIEDest>9</indIEDest></dest>`;
  }

  private inserirQrCode(assinado: string, chave: string, contexto: NFeTransmissaoContexto, meta: QrMeta): string {
    const qrCode = this.urlQrCodeMeta(chave, contexto, meta, assinado);
    const qrBase = contexto.ambiente === 'HOMOLOGACAO'
      ? 'http://nfceh.sefaz.ce.gov.br/pages/ShowNFCe.html'
      : 'http://nfce.sefaz.ce.gov.br/pages/ShowNFCe.html';
    const supl = `<infNFeSupl><qrCode>${this.escapar(qrCode)}</qrCode><urlChave>${this.escapar(qrBase)}</urlChave></infNFeSupl>`;
    // No XSD 4.00, infNFeSupl é filho de <NFe> (irmão de infNFe e Signature),
    // nunca dentro de <infNFe>. Após a assinatura, inserir antes de <Signature>.
    let xmlFinal = assinado.replace(/<(?:ds:)?Signature/, `${supl}<Signature`);
    if (xmlFinal === assinado) xmlFinal = assinado.replace(/<\/NFe>/, `${supl}</NFe>`);
    if (xmlFinal === assinado) throw new Error('Não foi possível inserir o QR Code no XML assinado');
    return xmlFinal;
  }

  /**
   * URL do QR Code conforme o pattern oficial do XSD (leiaute 4.00):
   * v2 online:  chave|2|tpAmb|cscId|SHA1hex(seq+csc)
   * v2 offline: chave|2|tpAmb|dia|vNF|hexDigestValue|cscId|SHA1hex(seq+csc)
   * v3 online:  chave|3|tpAmb
   * v3 offline: chave|3|tpAmb|dia|vNF|indDest|docDest|assinatura RSA base64
   */
  private urlQrCodeMeta(chave: string, contexto: NFeTransmissaoContexto, meta: QrMeta, assinado = ''): string {
    const csc = contexto.csc.trim();
    const cscId = this.digits(contexto.cscId).replace(/^0+/, '') || '0';
    const base = contexto.ambiente === 'HOMOLOGACAO'
      ? 'http://nfceh.sefaz.ce.gov.br/pages/ShowNFCe.html'
      : 'http://nfce.sefaz.ce.gov.br/pages/ShowNFCe.html';
    const tpAmb = this.tpAmb(contexto);
    const versao = this.qrVersao === '3' ? '3' : '2';

    if (meta.tpEmis !== '9') {
      if (versao === '3') return `${base}?p=${chave}|3|${tpAmb}`;
      const seq = `${chave}|2|${tpAmb}|${cscId}`;
      return `${base}?p=${seq}|${this.sha1hex(seq + csc)}`;
    }

    const dia = meta.dhEmi.slice(8, 10);
    const vNF = this.decimal(meta.vNF);
    if (versao === '3') {
      const seq = `${chave}|3|${tpAmb}|${dia}|${vNF}|${meta.destInd || ''}|${meta.destDoc || ''}`;
      if (!meta.privKey) throw new Error('Chave privada é obrigatória para o QR Code v3 off-line');
      const assinatura = sign('sha1', Buffer.from(seq, 'utf8'), meta.privKey).toString('base64');
      return `${base}?p=${seq}|${assinatura}`;
    }
    const digestB64 = assinado.match(/<DigestValue>([^<]+)<\/DigestValue>/)?.[1] || '';
    // O pattern do XSD exige 56 hex = conversão da STRING base64 do DigestValue
    // (28 caracteres) para hexadecimal ASCII, não a re-codificação dos bytes.
    const digHex = digestB64 ? Buffer.from(digestB64, 'utf8').toString('hex') : '0'.repeat(56);
    const seq = `${chave}|2|${tpAmb}|${dia}|${vNF}|${digHex}|${cscId}`;
    return `${base}?p=${seq}|${this.sha1hex(seq + csc)}`;
  }

  private sha1hex(valor: string): string {
    return createHash('sha1').update(valor).digest('hex');
  }

  private assinar(xml: string, cert: Certificado): string {
    const signer = new SignedXml({ privateKey: cert.privateKey, publicCert: cert.certificadoAssinatura });
    const id = xml.match(/<(?:infNFe|infEvento|infInut)[^>]*\sId="([^"]+)"/)?.[1];
    if (!id) throw new Error('XML fiscal sem atributo Id para assinatura');
    const alvo = xml.includes('<infNFe ') ? 'infNFe' : xml.includes('<infEvento ') ? 'infEvento' : 'infInut';
    const xpath = `//*[local-name(.)='${alvo}']`;
    signer.addReference({ xpath, uri: `#${id}`, transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'], digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1' });
    signer.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
    signer.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
    signer.computeSignature(xml, { location: { reference: xpath, action: 'after' } });
    return signer.getSignedXml();
  }

  private async consultarRecibo(nRec: string, contexto: NFeTransmissaoContexto, cert: Certificado) {
    return this.soap('NfeRetAutorizacao4', `<consReciNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${this.tpAmb(contexto)}</tpAmb><nRec>${nRec}</nRec></consReciNFe>`, contexto, cert);
  }

  private soap(servico: string, payload: string, contexto: NFeTransmissaoContexto, cert: Certificado): Promise<RespostaSefaz> {
    const endpoints: Record<string, string> = {
      NfeAutorizacao4: 'NfeAutorizacao/NFeAutorizacao4.asmx',
      NfeRetAutorizacao4: 'NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
      NfeConsultaProtocolo4: 'NfeConsulta/NfeConsulta4.asmx',
      NfeInutilizacao4: 'nfeinutilizacao/nfeinutilizacao4.asmx',
      RecepcaoEvento4: 'recepcaoevento/recepcaoevento4.asmx',
    };
    const actions: Record<string, string> = {
      NfeAutorizacao4: 'nfeAutorizacaoLote',
      NfeRetAutorizacao4: 'nfeRetAutorizacaoLote',
      NfeConsultaProtocolo4: 'nfeConsultaNF',
      NfeInutilizacao4: 'nfeInutilizacaoNF',
      RecepcaoEvento4: 'nfeRecepcaoEvento',
    };
    const wsdlNames: Record<string, string> = {
      NfeAutorizacao4: 'NFeAutorizacao4',
      NfeRetAutorizacao4: 'NFeRetAutorizacao4',
      NfeConsultaProtocolo4: 'NFeConsultaProtocolo4',
      NfeInutilizacao4: 'NFeInutilizacao4',
      RecepcaoEvento4: 'RecepcaoEvento4',
    };
    const endpoint = `${contexto.ambiente === 'HOMOLOGACAO' ? this.homologacao : this.producao}/${endpoints[servico]}`;
    const url = new URL(endpoint);
    const action = `http://www.portalfiscal.inf.br/nfe/wsdl/${wsdlNames[servico]}/${actions[servico]}`;
    const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${wsdlNames[servico]}">${payload}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
    return new Promise((resolve, reject) => {
      const req = request({ hostname: url.hostname, servername: url.hostname, path: url.pathname, method: 'POST', ca: carregarCAsSefaz(), cert: cert.certificado, key: cert.privateKey, timeout: 45_000, headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`, SOAPAction: action, 'Content-Length': Buffer.byteLength(envelope) } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const rawXml = Buffer.concat(chunks).toString('utf8');
          const resposta = this.parseRespostaSefaz(rawXml);
          if (res.statusCode && res.statusCode >= 400 && !resposta.cStat) {
            const detalhe = rawXml.replace(/\s+/g, ' ').trim().slice(0, 1200);
            reject(new SefazRedeError(`SVRS retornou HTTP ${res.statusCode}${detalhe ? `: ${detalhe}` : ''}`));
          } else resolve(resposta);
        });
      });
      req.on('timeout', () => req.destroy(new SefazRedeError(`Timeout na operação ${servico}`)));
      req.on('error', (error) => reject(new SefazRedeError(`Falha na comunicação com a SVRS: ${error.message}`)));
      req.end(envelope);
    });
  }

  private extrairCertificado(pfx: Buffer, senha: string): Certificado {
    return extrairCertificadoA1(pfx, senha);
  }

  private parseRespostaSefaz(rawXml: string): RespostaSefaz {
    const protNfe = this.bloco(rawXml, 'protNFe');
    const rejeicao = this.bloco(rawXml, 'rejeicaoNFe') || this.bloco(rawXml, 'rejeicaoEvento');
    const retEvento = this.bloco(rawXml, 'retEvento');
    const retInut = this.bloco(rawXml, 'retInutNFe');
    return {
      rawXml,
      cStat: (protNfe && this.tag(protNfe, 'cStat'))
        || (rejeicao && this.tag(rejeicao, 'cStat'))
        || (retEvento && this.tag(retEvento, 'cStat'))
        || (retInut && this.tag(retInut, 'cStat'))
        || this.tag(rawXml, 'cStat'),
      xMotivo: (protNfe && this.tag(protNfe, 'xMotivo'))
        || (rejeicao && this.tag(rejeicao, 'xMotivo'))
        || (retEvento && this.tag(retEvento, 'xMotivo'))
        || (retInut && this.tag(retInut, 'xMotivo'))
        || this.tag(rawXml, 'xMotivo'),
      chave: (protNfe && this.tag(protNfe, 'chNFe')) || this.tag(rawXml, 'chNFe'),
      protocolo: (protNfe && this.tag(protNfe, 'nProt')) || this.tag(rawXml, 'nProt'),
      nRec: this.tag(rawXml, 'nRec'),
      rejeicao: Boolean(rejeicao),
    };
  }

  private bloco(xml: string, tag: string) { return xml.match(new RegExp(`<[^>]*${tag}[^>]*>[\\s\\S]*?</[^>]*${tag}>`))?.[0]; }
  private tag(xml: string, tag: string) { return xml.match(new RegExp(`<[^>]*${tag}[^>]*>([^<]*)</[^>]*${tag}>`))?.[1]; }
  private tpAmb(c: NFeTransmissaoContexto) { return c.ambiente === 'HOMOLOGACAO' ? '2' : '1'; }
  private lote() { return String(Date.now()).slice(-15); }
  private dataHora(date = new Date()): string {
    const partes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, hourCycle: 'h23' }).formatToParts(date);
    const g = (t: string) => partes.find((p) => p.type === t)?.value ?? '00';
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}-03:00`;
  }
  private decimal(value: number) { return Number(value || 0).toFixed(2); }
  private decimalN(value: number, casas: number) { return Number(value || 0).toFixed(casas); }
  private ratear(total: number, bases: number[]): number[] {
    if (!bases.length) return [];
    const valorTotal = Number(total.toFixed(2));
    const somaBases = bases.reduce((sum, base) => sum + Math.max(0, base), 0);
    if (somaBases <= 0) return bases.map((_, index) => index === 0 ? valorTotal : 0);
    let rateado = 0;
    return bases.map((base, index) => {
      const valor = index === bases.length - 1
        ? Number((valorTotal - rateado).toFixed(2))
        : Number((valorTotal * Math.max(0, base) / somaBases).toFixed(2));
      rateado = Number((rateado + valor).toFixed(2));
      return valor;
    });
  }
  private digits(value: string) { return String(value ?? '').replace(/\D/g, ''); }
  private uf(value: string) { const ufs: Record<string, string> = { AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17' }; const uf = ufs[value.toUpperCase()]; if (!uf) throw new Error(`UF não suportada: ${value}`); return uf; }
  private mod11(value: string) { let total = 0; let weight = 2; for (let i = value.length - 1; i >= 0; i--) { total += Number(value[i]) * weight; weight = weight === 9 ? 2 : weight + 1; } const rest = total % 11; return rest === 0 || rest === 1 ? '0' : String(11 - rest); }
  private textoXml(value: string) { return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); }
  private escapar(value: string) { return this.textoXml(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
}
