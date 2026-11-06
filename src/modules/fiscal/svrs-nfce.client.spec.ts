import { SvrsNfceClient } from './svrs-nfce.client';
import { EmitirNFeParams, NFeTransmissaoContexto } from './nfe-gateway.interface';

function contexto(overrides: Partial<NFeTransmissaoContexto> = {}): NFeTransmissaoContexto {
  return {
    ambiente: 'HOMOLOGACAO',
    serie: 1,
    numero: 1,
    cnpj: '23652345000100',
    cscId: '000001',
    csc: 'ABC123TOKEN',
    certificadoPfx: Buffer.from('x'),
    senhaCertificado: 'senha',
    ...overrides,
  };
}

function params(overrides: Partial<EmitirNFeParams> = {}): EmitirNFeParams {
  return {
    negocio: {
      cnpj: '23652345000100',
      razaoSocial: 'WALKER SALGADOS LTDA',
      nomeFantasia: 'Walker Salgados',
      ie: '060000015',
      logradouro: 'Rua das Flores',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Fortaleza',
      codigoMunicipio: '2304400',
      uf: 'CE',
      cep: '60000000',
      regimeTributario: 1,
    },
    destinatario: {},
    itens: [
      {
        nome: 'Salgado',
        ncm: '21069090',
        cfop: '5102',
        uCom: 'UN',
        qCom: 2,
        vUnCom: 12.5,
        vProd: 25,
        fiscal: { origem: 0, csosn: '102' },
      },
    ],
    pagamentos: [{ tPag: '01', vPag: 25 }],
    ...overrides,
  };
}

describe('SvrsNfceClient — montagem de XML NFC-e', () => {
  const client = new SvrsNfceClient();

  function montar(p: EmitirNFeParams, c = contexto()) {
    return (client as any).montarXml(p, c) as { xml: string; chave: string; tributos: Record<string, number | string | undefined> };
  }

  it('gera chave de acesso válida (44 dígitos, cUF 23, modelo 65, mod-11)', () => {
    const { chave } = montar(params());
    expect(chave).toMatch(/^\d{44}$/);
    expect(chave.slice(0, 2)).toBe('23');
    expect(chave.slice(20, 22)).toBe('65');
    const semDv = chave.slice(0, 43);
    let total = 0;
    let peso = 2;
    for (let i = semDv.length - 1; i >= 0; i--) {
      total += Number(semDv[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = total % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    expect(Number(chave[43])).toBe(dv);
  });

  it('usa CSOSN 102 e PIS/COFINS NT no Simples Nacional', () => {
    const { xml } = montar(params());
    expect(xml).toContain('<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>');
    expect(xml).toContain('<PIS><PISNT><CST>06</CST></PISNT></PIS>');
    expect(xml).toContain('<COFINS><COFINSNT><CST>06</CST></COFINSNT></COFINS>');
    expect(xml).toContain('<CRT>1</CRT>');
    expect(xml).not.toContain('vTotTrib');
  });

  it('posiciona vTotTrib antes de ICMS dentro de imposto (ordem do XSD 4.00)', () => {
    const p = params();
    p.negocio.regimeTributario = 3;
    p.itens[0].fiscal = {
      origem: 0, cstIcms: '00', cstPis: '01', cstCofins: '01', aliqIcms: 18, aliqPis: 1.65, aliqCofins: 7.6,
      aliqTributosFederais: 10, aliqTributosEstaduais: 5, aliqTributosMunicipais: 0,
      fonteTributosAproximados: 'IBPT', vigenciaTributosAproximados: '2026-10-01',
    };
    const { xml } = montar(p);
    expect(xml).toContain('<vTotTrib>3.75</vTotTrib><ICMS>');
    const iniImposto = xml.indexOf('<imposto>');
    const vTot = xml.indexOf('<vTotTrib>', iniImposto);
    const iniIcms = xml.indexOf('<ICMS>', vTot);
    const iniPis = xml.indexOf('<PIS>', iniIcms);
    expect(vTot).toBeGreaterThan(iniImposto);
    expect(vTot).toBeLessThan(iniIcms);
    expect(iniIcms).toBeLessThan(iniPis);
  });

  it('usa CST/ICMS00 com alíquotas no Regime Normal', () => {
    const p = params();
    p.negocio.regimeTributario = 3;
    p.itens[0].fiscal = {
      origem: 0, cstIcms: '00', cstPis: '01', cstCofins: '01', aliqIcms: 18, aliqPis: 1.65, aliqCofins: 7.6,
      aliqTributosFederais: 10, aliqTributosEstaduais: 5, aliqTributosMunicipais: 0,
      fonteTributosAproximados: 'IBPT', vigenciaTributosAproximados: '2026-10-01',
    };
    const { xml, tributos } = montar(p);
    expect(xml).toContain('<CRT>3</CRT>');
    expect(xml).toContain('<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>25.00</vBC><pICMS>18.00</pICMS><vICMS>4.50</vICMS></ICMS00>');
    expect(xml).toContain('<vPIS>0.41</vPIS>');
    expect(xml).toContain('<vCOFINS>1.90</vCOFINS>');
    expect(tributos.tributosAproximados).toBe(3.75);
    expect(tributos.tributosFederaisAproximados).toBe(2.5);
    expect(tributos.tributosEstaduaisAproximados).toBe(1.25);
  });

  it('calcula CST 20 com redução de base informada para o produto', () => {
    const p = params();
    p.negocio.regimeTributario = 3;
    p.itens[0].fiscal = {
      origem: 0, cstIcms: '20', pRedBC: 20, aliqIcms: 18,
      cstPis: '06', cstCofins: '06',
    };
    const { xml } = montar(p);
    expect(xml).toContain('<ICMS20><orig>0</orig><CST>20</CST><modBC>3</modBC><pRedBC>20.0000</pRedBC><vBC>20.00</vBC><pICMS>18.00</pICMS><vICMS>3.60</vICMS></ICMS20>');
    expect(xml).toContain('<PIS><PISNT><CST>06</CST></PISNT></PIS>');
    expect(xml).toContain('<COFINS><COFINSNT><CST>06</CST></COFINSNT></COFINS>');
  });

  it('não confunde tributos efetivos de ICMS/PIS/COFINS com estimativa ao consumidor', () => {
    const p = params();
    p.negocio.regimeTributario = 3;
    p.itens[0].fiscal = { origem: 0, cstIcms: '00', cstPis: '01', cstCofins: '01', aliqIcms: 18, aliqPis: 1.65, aliqCofins: 7.6 };
    const { xml, tributos } = montar(p);
    expect(xml).not.toContain('<vTotTrib>');
    expect(tributos.tributosAproximados).toBeUndefined();
  });

  it('recusa CSOSN não suportado no Simples', () => {
    const p = params();
    p.itens[0].fiscal = { origem: 0, csosn: '201' };
    expect(() => montar(p)).toThrow(/CSOSN '201' não suportado/);
  });

  it('emite MEI com CRT 4 e CSOSN permitido para operação interna', () => {
    const p = params();
    p.negocio.regimeTributario = 4;
    p.itens[0].fiscal = { origem: 0, csosn: '300' };
    const { xml } = montar(p);
    expect(xml).toContain('<CRT>4</CRT>');
    expect(xml).toContain('<ICMSSN300><orig>0</orig><CSOSN>300</CSOSN></ICMSSN300>');
  });

  it('não aceita CSOSN 400 para emitente MEI CRT 4', () => {
    const p = params();
    p.negocio.regimeTributario = 4;
    p.itens[0].fiscal = { origem: 0, csosn: '400' };
    expect(() => montar(p)).toThrow(/não suportado para CRT=4/);
  });

  it('inclui destinatário com endereço e indPres=4 em entrega', () => {
    const p = params();
    p.entrega = true;
    p.destinatario = { cpf: '52998224725', nome: 'Cliente Teste', logradouro: 'Av. Brasil', numero: '200', bairro: 'Jardim', cidade: 'Fortaleza', uf: 'CE', cep: '60100000' };
    const { xml } = montar(p);
    expect(xml).toContain('<indPres>4</indPres>');
    expect(xml).toContain('<CPF>52998224725</CPF>');
    expect(xml).toContain('<enderDest><xLgr>Av. Brasil</xLgr>');
  });

  it('emite CNPJ do destinatário na tag correta, sem classificá-lo como CPF', () => {
    const p = params();
    p.destinatario = { cnpj: '11222333000181', nome: 'Cliente Empresa' };
    const { xml } = montar(p);
    expect(xml).toContain('<CNPJ>11222333000181</CNPJ>');
    expect(xml).not.toContain('<CPF>11222333000181</CPF>');
  });

  it('emite tpEmis=9 com dhCont e xJust em contingência off-line', () => {
    const p = params();
    p.contingencia = { dhCont: '2026-09-29T10:00:00-03:00', xJust: 'Falha de comunicacao' };
    const { xml, chave } = montar(p);
    expect(xml).toContain('<tpEmis>9</tpEmis>');
    expect(xml).toContain('<dhCont>2026-09-29T10:00:00-03:00</dhCont>');
    expect(chave.slice(34, 35)).toBe('9');
  });

  it('bloqueia valor >= R$ 200.000 e pagamentos menores que o total', () => {
    const p = params();
    p.itens[0].vProd = 200000;
    p.pagamentos = [{ tPag: '01', vPag: 200000 }];
    expect(() => montar(p)).toThrow(/200.000/);
    const p2 = params();
    p2.pagamentos = [{ tPag: '01', vPag: 10 }];
    expect(() => montar(p2)).toThrow(/Pagamentos menos troco/);
  });

  it('concilia desconto, frete, despesas e o valor fiscal total', () => {
    const p = params({
      descontoTotal: 2,
      frete: 3,
      outrasDespesas: 1,
      pagamentos: [{ tPag: '01', vPag: 27 }],
    });
    const { xml } = montar(p);
    expect(xml).toContain('<vProd>25.00</vProd>');
    expect(xml).toContain('<vDesc>2.00</vDesc>');
    expect(xml).toContain('<vFrete>3.00</vFrete>');
    expect(xml).toContain('<vOutro>1.00</vOutro>');
    expect(xml).toContain('<vNF>27.00</vNF>');
  });

  it('declara troco junto com o valor recebido em dinheiro', () => {
    const p = params({
      troco: 5,
      pagamentos: [{ tPag: '01', vPag: 30 }],
    });
    const { xml } = montar(p);
    expect(xml).toContain('<vPag>30.00</vPag>');
    expect(xml).toContain('<vTroco>5.00</vTroco>');
  });

  it('em homologação a descrição do 1º item é a frase obrigatória (cStat 373), demais itens mantêm o nome', () => {
    const p = params();
    p.itens.push({ ...p.itens[0], nome: 'Refri', vProd: 6 });
    p.pagamentos = [{ tPag: '01', vPag: 31 }];
    const { xml } = montar(p);
    expect(xml).toContain('<xProd>NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</xProd>');
    expect(xml).toContain('<xProd>Refri</xProd>');
    expect(xml).toContain('AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</infCpl>');
  });

  it('em produção mantém os nomes reais dos produtos', () => {
    const { xml } = montar(params(), contexto({ ambiente: 'PRODUCAO' }));
    expect(xml).toContain('<xProd>Salgado</xProd>');
    expect(xml).not.toContain('HOMOLOGACAO');
  });

  it('insere infNFeSupl como filho de <NFe> (irmão de infNFe, antes da Signature)', () => {
    const assinado = '<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFeX"><a/></infNFe><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><x/></Signature></NFe>';
    const meta = { dhEmi: '2026-09-29T10:00:00-03:00', vNF: 25, tpEmis: '1' };
    const final = (client as any).inserirQrCode(assinado, '1'.repeat(44), contexto(), meta);
    expect(final).toContain('</infNFe><infNFeSupl>');
    expect(final).toContain('</infNFeSupl><Signature');
    expect(final).not.toContain('<infNFeSupl><qrCode></infNFe>');
  });

  it('monta QR v2 online no pattern do XSD: chave|2|tpAmb|cIdToken|hash40', () => {
    const url = (client as any).urlQrCodeMeta('1'.repeat(44), contexto({ cscId: '0000005' }), { dhEmi: '2026-09-29T10:00:00-03:00', vNF: 25, tpEmis: '1' });
    expect(url).toContain('nfceh.sefaz.ce.gov.br');
    expect(url).toContain(`?p=${'1'.repeat(44)}|2|2|5|`);
    expect(url).toMatch(/\|[0-9A-F]{40}$/);
  });

  it('hash QR v2 online reproduz o exemplo do Manual de Especificações Técnicas (DANFE NFC-e)', () => {
    const entrada = '28170800156225000131650110000151341562040824|2|1|1SEU-CODIGO-CSC-CONTRIBUINTE-36-CARACTERES';
    expect((client as any).sha1hex(entrada)).toBe('DC6AE2C2B9A992BE59679AC365E29922DE6B7511');
  });

  it('monta QR v2 offline no pattern do XSD: chave|2|tpAmb|dia|vNF|hex56|cIdToken|hash40', () => {
    const digestB64 = Buffer.alloc(20, 1).toString('base64');
    const assinado = `<NFe><Signature><DigestValue>${digestB64}</DigestValue></Signature></NFe>`;
    const url = (client as any).urlQrCodeMeta('1'.repeat(44), contexto({ cscId: '0000005' }), { dhEmi: '2026-09-29T10:00:00-03:00', vNF: 25, tpEmis: '9' }, assinado);
    expect(url).toMatch(/\?p=1{44}\|2\|2\|29\|25\.00\|[0-9a-f]{56}\|5\|[0-9A-F]{40}$/);
  });

  it('valida emitente CE e código IBGE', () => {
    const p = params();
    p.negocio.uf = 'SP';
    expect(() => montar(p)).toThrow(/Ceará/);
    const p2 = params();
    p2.negocio.codigoMunicipio = '123';
    expect(() => montar(p2)).toThrow(/IBGE/);
  });

  it('fecha corretamente o XML de consulta e do recibo', async () => {
    const c = new SvrsNfceClient();
    jest.spyOn(c as any, 'extrairCertificado').mockReturnValue({});
    const soap = jest.spyOn(c as any, 'soap').mockResolvedValue({ rawXml: '', cStat: '100' });

    await c.consultar('1'.repeat(44), contexto());
    expect(soap.mock.calls[0][1]).toContain('</consSitNFe>');
    await (c as any).consultarRecibo('123456789012345', contexto(), {});
    expect(soap.mock.calls[1][1]).toContain('</consReciNFe>');
  });

  it('gera o leiaute correto do pedido de inutilização modelo 65', async () => {
    const c = new SvrsNfceClient();
    jest.spyOn(c as any, 'extrairCertificado').mockReturnValue({});
    jest.spyOn(c as any, 'assinar').mockImplementation((xml: unknown) => String(xml));
    const soap = jest.spyOn(c as any, 'soap').mockResolvedValue({ rawXml: '', cStat: '102' });

    await c.inutilizar(1, 10, 12, 'Números não utilizados nesta operação', contexto());
    const xml = soap.mock.calls[0][1] as string;
    expect(xml).toContain('<xServ>INUTILIZAR</xServ>');
    expect(xml).toContain('<cUF>23</cUF>');
    expect(xml).toContain('<mod>65</mod>');
    expect(xml).toContain('<nNFIni>10</nNFIni><nNFFin>12</nNFFin>');
    expect(xml).not.toContain('<uf>');
    expect(xml).not.toContain('<nInf>');
    expect(xml).not.toContain('<dhEmi>');
  });

  it('monta o evento ECONF 110750 com detPag tPag 01, vPag e dPag (NT 2024.002 / IN 87/2025-CE)', async () => {
    const c = new SvrsNfceClient();
    jest.spyOn(c as any, 'extrairCertificado').mockReturnValue({});
    jest.spyOn(c as any, 'assinar').mockImplementation((xml: unknown) => String(xml));
    const soap = jest.spyOn(c as any, 'soap').mockResolvedValue({ rawXml: '<ret/>', cStat: '135' });

    const resultado = await c.econf(
      { chaveAcesso: '1'.repeat(44), nSeq: 1, valor: 40, dataPagamento: '2026-11-05' },
      contexto(),
    );

    const xml = soap.mock.calls[0][1] as string;
    expect(soap.mock.calls[0][0]).toBe('RecepcaoEvento4');
    expect(xml).toContain('<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">');
    expect(xml).toContain(`Id="ID110750${'1'.repeat(44)}01"`);
    expect(xml).toContain('<cOrgao>23</cOrgao>');
    expect(xml).toContain('<tpEvento>110750</tpEvento>');
    expect(xml).toContain('<nSeqEvento>1</nSeqEvento>');
    expect(xml).toContain('<verEvento>1.00</verEvento>');
    expect(xml).toContain('<descEvento>ECONF</descEvento>');
    expect(xml).toContain('<verAplic>WALKER-1.0</verAplic>');
    expect(xml).toContain('<indPag>1</indPag>');
    expect(xml).toContain('<tPag>01</tPag>');
    expect(xml).toContain('<vPag>40.00</vPag>');
    expect(xml).toContain('<dPag>2026-11-05</dPag>');
    expect(xml).toContain('</detPag></detEvento></infEvento></evento>');
    expect(resultado).toMatchObject({ cStat: '135', xmlEvento: expect.stringContaining('110750'), xmlResposta: '<ret/>' });
  });

  it('valida data e nSeqEvento do ECONF antes de transmitir', async () => {
    const c = new SvrsNfceClient();
    jest.spyOn(c as any, 'extrairCertificado').mockReturnValue({});
    const soap = jest.spyOn(c as any, 'soap').mockResolvedValue({ rawXml: '', cStat: '135' });

    await expect(c.econf({ chaveAcesso: '1'.repeat(44), nSeq: 1, valor: 40, dataPagamento: '05/11/2026' }, contexto()))
      .rejects.toThrow(/AAAA-MM-DD/);
    await expect(c.econf({ chaveAcesso: '1'.repeat(44), nSeq: 100, valor: 40, dataPagamento: '2026-11-05' }, contexto()))
      .rejects.toThrow(/1 e 99/);
    expect(soap).not.toHaveBeenCalled();
  });

  it('usa o cStat individual de retEvento, não o cStat 128 do lote', () => {
    const xml = '<retEnvEvento><cStat>128</cStat><xMotivo>Lote processado</xMotivo><retEvento><infEvento><cStat>136</cStat><xMotivo>Evento registrado, mas não vinculado</xMotivo><nProt>123</nProt></infEvento></retEvento></retEnvEvento>';
    const resposta = (client as any).parseRespostaSefaz(xml);
    expect(resposta.cStat).toBe('136');
    expect(resposta.protocolo).toBe('123');
  });
});
