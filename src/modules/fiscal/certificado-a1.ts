import { createPrivateKey } from 'node:crypto';
import * as forge from 'node-forge';

export interface CertificadoPem {
  privateKey: string;
  certificado: string;
  certificadoAssinatura: string;
}

export interface InfoCertificadoA1 {
  validoDe: Date;
  validoAte: Date;
  cnpj?: string;
}

const OID_CNPJ = '2.16.764.3.2.1';

export function lerInfoCertificadoA1(pfx: Buffer, senha: string): InfoCertificadoA1 {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const cert = certBags.find((bag) => bag.cert)?.cert;
  if (!cert) throw new Error('PFX não contém certificado X.509');
  let cnpj: string | undefined;
  try {
    const attr = cert.subject.getField(OID_CNPJ);
    if (attr?.value) {
      const texto = forge.util.bytesToHex(attr.value as string).match(/[0-9a-f]{28}/)?.[0];
      if (texto) cnpj = texto.replace(/^00/, '');
    }
  } catch {
    cnpj = undefined;
  }
  return { validoDe: cert.validity.notBefore, validoAte: cert.validity.notAfter, cnpj };
}

/** Converts legacy PKCS#12 files to PEM for OpenSSL 3-compatible TLS. */
export function extrairCertificadoA1(pfx: Buffer, senha: string): CertificadoPem {
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
    const legacyKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    const keyBag = keyBags[0] || legacyKeyBags[0];
    const certs = certBags
      .map((bag) => bag.cert)
      .filter(Boolean)
      .map((cert) => forge.pki.certificateToPem(cert!));
    if (!keyBag?.key || !certs.length) throw new Error('A1/PFX não contém chave privada e certificado');

    const privateKey = forge.pki.privateKeyToPem(keyBag.key);
    createPrivateKey(privateKey);
    return { privateKey, certificado: certs.join(''), certificadoAssinatura: certs[0] };
  } catch (error) {
    throw new Error(`Não foi possível abrir o certificado A1: ${error instanceof Error ? error.message : 'PKCS#12 inválido'}`);
  }
}
