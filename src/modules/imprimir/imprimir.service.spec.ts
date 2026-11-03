import { ImprimirService } from './imprimir.service';

describe('ImprimirService — DANFE NFC-e', () => {
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
