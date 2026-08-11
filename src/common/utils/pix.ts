/**
 * Gera o payload BR Code (EMV® Merchant-Presented QR) usado pelo PIX.
 * Referência: Manual de Padrões para Iniciação do PIX (Banco Central).
 */

function addField(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * O BR Code do PIX exige apenas caracteres ASCII imprimíveis e,
 * conforme o manual, o nome do recebedor deve vir em MAIÚSCULAS.
 * Remove acentos e caracteres não-ASCII, evitando que bytes multibyte
 * desalinhem os campos de comprimento do payload.
 */
function toAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^ -~]/g, '') // remove qualquer não-ASCII restante
    .toUpperCase()
    .trim();
}

function crc16(payload: string): string {
  // CRC-16/CCITT-FALSE (padrão do PIX): polinômio 0x1021, init 0xFFFF, sem reflexão
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface GerarPixParams {
  chave: string;
  valor: number;
  nome?: string;
  cidade?: string;
  txid?: string;
}

/**
 * Monta o payload PIX copia-e-cola.
 * - chave: CPF/CNPJ (apenas dígitos), e-mail, telefone (+55DDDNUMERO) ou chave aleatória
 * - valor: valor da transação em reais
 */
export function gerarPayloadPix({ chave, valor, nome = '', cidade = '', txid = '***' }: GerarPixParams): string {
  const chaveLimpa = toAscii(chave).replace(/\s+/g, '');

  const gui = addField('00', 'br.gov.bcb.pix');
  const chaveCampo = addField('01', chaveLimpa);
  const merchantAccount = addField('26', gui + chaveCampo);

  const valorFormatado = valor.toFixed(2);
  const payloadFormat = addField('00', '01');
  const mcc = addField('52', '0000');
  const currency = addField('53', '986');
  const amount = valor > 0 ? addField('54', valorFormatado) : '';
  const country = addField('58', 'BR');
  const name = addField('59', toAscii(nome || 'PIX').slice(0, 25));
  const city = addField('60', toAscii(cidade || 'BRASIL').slice(0, 15));
  const txidCampo = addField('05', (txid || '***').slice(0, 25));
  const additional = addField('62', txidCampo);

  const semCrc =
    payloadFormat +
    merchantAccount +
    mcc +
    currency +
    amount +
    country +
    name +
    city +
    additional;

  return semCrc + addField('63', crc16(semCrc + '6304'));
}
