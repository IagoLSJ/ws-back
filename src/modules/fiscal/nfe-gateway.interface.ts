export interface NFeItemFiscal {
  origem: number;
  csosn?: string;
  cstIcms?: string;
  cstPis?: string;
  cstCofins?: string;
  pRedBC?: number;
  aliqIcms?: number;
  aliqPis?: number;
  aliqCofins?: number;
  aliqTributosFederais?: number;
  aliqTributosEstaduais?: number;
  aliqTributosMunicipais?: number;
  fonteTributosAproximados?: string;
  vigenciaTributosAproximados?: string;
  cest?: string;
}

export interface NFeItem {
  nome: string;
  ncm: string;
  cfop: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  cEAN?: string;
  cEANTrib?: string;
  fiscal?: NFeItemFiscal;
}

export interface NFeDestinatario {
  cpf?: string;
  cnpj?: string;
  nome?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  codigoMunicipio?: string;
  uf?: string;
  cep?: string;
}

export interface NFePagamento {
  tPag: string; // 01=Dinheiro 03=Credito 04=Debito 05=CreditoLoja 17=PIX 91=Pagamento posterior (IN 142/2025-CE) 99=Outros
  vPag: number;
  xPag?: string;
  card?: {
    tpIntegra: '1' | '2';
    CNPJ?: string;
    tBand?: string;
    cAut?: string;
    CNPJReceb?: string;
    idTermPag?: string;
  };
}

export interface EmitirNFeParams {
  negocio: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string;
    ie?: string;
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    codigoMunicipio?: string;
    uf: string;
    cep: string;
    regimeTributario: number; // 1=SimplesNacional, 2=SimplesExcesso, 3=Normal, 4=MEI
  };
  destinatario: NFeDestinatario;
  itens: NFeItem[];
  pagamentos: NFePagamento[];
  numeroPedido?: string;
  observacao?: string;
  descontoTotal?: number;
  frete?: number;
  outrasDespesas?: number;
  troco?: number;
  entrega?: boolean;
  contingencia?: { dhCont: string; xJust: string };
}

export interface NFeTransmissaoContexto {
  ambiente: 'HOMOLOGACAO' | 'PRODUCAO';
  serie: number;
  numero: number;
  cnpj: string;
  cscId: string;
  csc: string;
  certificadoPfx: Buffer;
  senhaCertificado: string;
}

export type NFeStatus = 'AUTORIZADA' | 'REJEITADA' | 'PROCESSANDO' | 'ERRO_REDE';

export interface NFeResultado {
  status: NFeStatus;
  chaveAcesso?: string;
  numeroNfe: number;
  serieNfe: number;
  xmlPath?: string;
  xmlAssinado?: string;
  xmlAutorizado?: string;
  qrCodeUrl?: string;
  protocolo?: string;
  recibo?: string;
  cStat?: string;
  xMotivo?: string;
  tributosAproximados?: number;
  tributosFederaisAproximados?: number;
  tributosEstaduaisAproximados?: number;
  tributosMunicipaisAproximados?: number;
  fontesTributosAproximados?: string;
}

export interface NFeEventoResultado {
  cStat?: string;
  xMotivo?: string;
  protocolo?: string;
  xmlEvento?: string;
  xmlResposta?: string;
}

export interface NFeEconfParams {
  chaveAcesso: string;
  nSeq: number;
  valor: number;
  dataPagamento: string; // AAAA-MM-DD
  indPag?: '0' | '1';
  tPag?: string;
  xPag?: string;
}

export interface INfeGateway {
  emitir(params: EmitirNFeParams, contexto: NFeTransmissaoContexto): Promise<NFeResultado>;
  gerarXmlContingencia(params: EmitirNFeParams, contexto: NFeTransmissaoContexto): { xml: string; chave: string };
  reenviar(xmlAssinado: string, chave: string, contexto: NFeTransmissaoContexto): Promise<NFeResultado>;
  cancelar(chaveAcesso: string, motivo: string, contexto: NFeTransmissaoContexto): Promise<NFeEventoResultado>;
  econf(params: NFeEconfParams, contexto: NFeTransmissaoContexto): Promise<NFeEventoResultado>;
  consultar(chaveAcesso: string, contexto: NFeTransmissaoContexto): Promise<{ status: string; protocolo?: string; cStat?: string; xMotivo?: string }>;
  inutilizar(serie: number, numeroInicial: number, numeroFinal: number, justificativa: string, contexto: NFeTransmissaoContexto): Promise<NFeEventoResultado>;
}
