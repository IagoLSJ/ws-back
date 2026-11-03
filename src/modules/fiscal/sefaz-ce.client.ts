import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { request } from 'node:https';
import { extrairCertificadoA1 } from './certificado-a1';
import { carregarCAsSefaz } from './sefaz-ca';

export interface SefazStatusResultado {
  cStat?: string;
  xMotivo?: string;
  rawXml: string;
}

@Injectable()
export class SefazCeClient {
  private readonly statusHomologacao = 'https://nfce-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx';
  private readonly statusProducao = 'https://nfce.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx';

  async consultarStatus(
    certificadoPfx: Buffer,
    senha: string,
    ambiente: 'HOMOLOGACAO' | 'PRODUCAO',
  ): Promise<SefazStatusResultado> {
    const endpoint = ambiente === 'HOMOLOGACAO' ? this.statusHomologacao : this.statusProducao;
    const url = new URL(endpoint);
    const cert = extrairCertificadoA1(certificadoPfx, senha);
    const action = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF';
    const tpAmb = ambiente === 'HOMOLOGACAO' ? '2' : '1';
    const soap = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
      '<soap12:Body>',
      '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">',
      `<consStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>${tpAmb}</tpAmb><cUF>23</cUF><xServ>STATUS</xServ></consStatServ>`,
      '</nfeDadosMsg>',
      '</soap12:Body>',
      '</soap12:Envelope>',
    ].join('');

    return new Promise((resolve, reject) => {
      const req = request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        servername: url.hostname,
        ca: carregarCAsSefaz(),
        cert: cert.certificado,
        key: cert.privateKey,
        timeout: 45_000,
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`,
          SOAPAction: action,
          'Content-Length': Buffer.byteLength(soap),
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const rawXml = Buffer.concat(chunks).toString('utf8');
          const cStat = this.readTag(rawXml, 'cStat');
          const xMotivo = this.readTag(rawXml, 'xMotivo');
          if ((res.statusCode || 500) >= 400 && !cStat) {
            const detalhe = rawXml.replace(/\s+/g, ' ').trim().slice(0, 1200);
            reject(new ServiceUnavailableException(`SEFAZ-CE retornou HTTP ${res.statusCode}${detalhe ? `: ${detalhe}` : ''}`));
            return;
          }
          resolve({ cStat, xMotivo, rawXml });
        });
      });

      req.on('timeout', () => req.destroy(new Error('Timeout ao consultar a SEFAZ-CE')));
      req.on('error', (error) => reject(new ServiceUnavailableException(`Falha na comunicação com a SEFAZ-CE: ${error.message}`)));
      req.write(soap);
      req.end();
    });
  }

  private readTag(xml: string, tag: string): string | undefined {
    const match = xml.match(new RegExp(`<[^>]*${tag}[^>]*>([^<]*)</[^>]*${tag}>`));
    return match?.[1];
  }

}
