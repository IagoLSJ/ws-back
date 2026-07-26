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
}

export interface NFeDestinatario {
  cpf?: string;
  cnpj?: string;
  nome?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}

export interface NFePagamento {
  tPag: string; // 01=Dinheiro, 03=Credito, 04=Debito, 05=CreditoLoja, 10=ValeAlimentacao, 99=Outros
  vPag: number;
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
    uf: string;
    cep: string;
    regimeTributario: number; // 1=SimplesNacional, 2=SimplesExcesso, 3=Normal
  };
  destinatario: NFeDestinatario;
  itens: NFeItem[];
  pagamentos: NFePagamento[];
  numeroPedido: string;
  observacao?: string;
}

export interface NFeResultado {
  chaveAcesso: string;
  numeroNfe: number;
  serieNfe: number;
  xmlPath?: string;
  protocolo?: string;
  tributosAproximados?: number;
}

export interface INfeGateway {
  emitir(params: EmitirNFeParams): Promise<NFeResultado>;
  cancelar(chaveAcesso: string, motivo: string): Promise<void>;
  consultar(chaveAcesso: string): Promise<{ status: string; protocolo?: string }>;
}
