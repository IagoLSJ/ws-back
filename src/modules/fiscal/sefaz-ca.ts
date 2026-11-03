import { existsSync, readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';

export function carregarCAsSefaz(): string[] {
  let extra = process.env.SEFAZ_CA_CERT?.replace(/\\n/g, '\n').trim();
  const arquivo = process.env.SEFAZ_CA_CERT_FILE;
  if (!extra && arquivo) {
    try {
      if (existsSync(arquivo)) {
        extra = readFileSync(arquivo, 'utf8').trim();
      } else {
        console.warn(`SEFAZ_CA_CERT_FILE aponta para caminho inexistente (${arquivo}); usando apenas as raízes do sistema`);
      }
    } catch (error) {
      console.warn(`Falha ao ler SEFAZ_CA_CERT_FILE (${arquivo}): ${error}; usando apenas as raízes do sistema`);
    }
  }
  return extra ? [...rootCertificates, extra] : [...rootCertificates];
}
