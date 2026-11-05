import { ImprimirService } from './imprimir.service';

describe('ImprimirService — DANFE NFC-e', () => {
  it('imprime identificação do emitente a partir da configuração fiscal', async () => {
    const prisma = {
      pedido: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pedido-12345678',
          negocioId: 'neg1',
          nome: undefined,
          total: 10,
          criadoEm: new Date('2026-11-04T12:00:00Z'),
          tipoEntrega: 'RETIRADA',
          itens: [{ produtoNome: 'Produto', quantidade: 1, precoUnitario: 10 }],
          pagamentos: [{ metodo: 'DINHEIRO', valor: 10 }],
          negocio: {
            nome: 'Mercado',
            configuracoes: null,
            configuracaoFiscal: {
              razaoSocial: 'Empresa Fiscal LTDA',
              cnpj: '10976019000121',
              ie: '060000015',
              endereco: {
                logradouro: 'Rua de Teste',
                numero: '10',
                bairro: 'Centro',
                cidade: 'Fortaleza',
                estado: 'CE',
                cep: '60000000',
              },
            },
          },
        }),
      },
      documentoFiscal: { findUnique: jest.fn().mockResolvedValue(null) },
      impressoraConfig: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ImprimirService(prisma as any, { add: jest.fn() } as any);

    const { html } = await service.imprimirCupom('neg1', 'pedido-12345678');

    expect(html).toContain('<h1>Empresa Fiscal LTDA</h1>');
    expect(html).toContain('CNPJ: 10.976.019/0001-21');
    expect(html).toContain('IE: 060000015');
    expect(html).toContain('Rua de Teste, 10, Centro, Fortaleza, CE, CEP: 60000000');
  });

  it('gera o comando ESC/POS do QR Code a partir da URL da NFC-e', () => {
    const service = new ImprimirService({} as any, { add: jest.fn() } as any);
    const buffer = (service as any).htmlToEscPos(
      '<div class="qr"><img src="http://nfce.sefaz.ce.gov.br/pages/ShowNFCe.html?p=chave|2|1|1|hash" alt="QR Code NFC-e"></div>',
    ) as Buffer;

    expect(buffer.includes(Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]))).toBe(true);
    expect(buffer.includes(Buffer.from('http://nfce.sefaz.ce.gov.br/pages/ShowNFCe.html?p=chave|2|1|1|hash'))).toBe(true);
    expect(buffer.includes(Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]))).toBe(true);
  });
});
