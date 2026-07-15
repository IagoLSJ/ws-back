interface DadosCupom {
  negocioNome: string;
  razaoSocial?: string;
  cnpj?: string;
  ie?: string;
  enderecoEmitente?: string;
  numeroPedido: string;
  serieNfe?: string;
  numeroNfe?: string;
  cliente?: string;
  clienteCpf?: string;
  clienteNome?: string;
  status?: string;
  itens: Array<{ nome: string; quantidade: number; precoUnitario: number; modificadores?: string[] }>;
  subtotal: number;
  desconto: number;
  taxaFrete: number;
  total: number;
  formaPagamento: string;
  troco?: number;
  tipoEntrega?: string;
  endereco?: string;
  observacao?: string;
  criadoEm: string;
  chaveAcesso?: string;
  qrCodeUrl?: string;
  tributosAproximados?: number;
}

function formatCpfCnpj(v?: string): string {
  if (!v) return 'Não informado';
  const digits = v.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return v;
}

export function gerarCupomHtml(dados: DadosCupom): string {
  const itensHtml = dados.itens.map(i => {
    const unit = i.precoUnitario.toFixed(2);
    const totalItem = (i.precoUnitario * i.quantidade).toFixed(2);
    return `
    <tr>
      <td colspan="4" style="font-size:12px;font-weight:bold;padding-top:4px">${i.quantidade}x ${i.nome}</td>
      <td style="font-size:12px;text-align:right;padding-top:4px">${totalItem}</td>
    </tr>
    <tr><td colspan="5" style="font-size:9px;color:#666;padding-left:6px">und.: R$ ${unit}${i.modificadores?.length ? ' | ' + i.modificadores.join(', ') : ''}</td></tr>
  `}).join('');

  const tributoHtml = dados.tributosAproximados && dados.tributosAproximados > 0
    ? `<tr><td colspan="4">Tributos aproximados (Lei da Transparência)</td><td style="text-align:right">R$ ${dados.tributosAproximados.toFixed(2)}</td></tr>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>NFC-e</title>
<style>
  @page { margin: 0; size: 80mm 400mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 11px; padding: 4mm 3mm; color: #000; }
  h1 { text-align: center; font-size: 14px; margin-bottom: 1px; }
  h2 { text-align: center; font-size: 11px; font-weight: bold; margin-bottom: 4px; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .header { text-align: center; font-size: 10px; margin-bottom: 4px; }
  .header b { font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  td { padding: 1px 2px; vertical-align: top; }
  .total-row td { font-size: 14px; font-weight: bold; padding-top: 3px; }
  .footer { text-align: center; margin-top: 8px; font-size: 9px; padding-top: 4px; }
  .obs { margin-top: 4px; font-size: 10px; color: #e11d48; }
  .qr { text-align: center; margin: 6px 0; }
  .qr img { width: 120px; height: 120px; image-rendering: pixelated; }
  .chave { text-align: center; font-size: 10px; font-weight: bold; letter-spacing: 1px; word-break: break-all; margin: 2px 0; }
  .small { font-size: 9px; color: #555; }
</style></head><body>
  <h1>${dados.razaoSocial || dados.negocioNome}</h1>
  <div class="header">
    ${dados.cnpj ? 'CNPJ: ' + formatCpfCnpj(dados.cnpj) + '<br>' : ''}
    ${dados.ie ? 'IE: ' + dados.ie + '<br>' : ''}
    ${dados.enderecoEmitente ? dados.enderecoEmitente + '<br>' : ''}
  </div>
  <hr>
  <h2>DANFE NFC-e</h2>
  <div class="header">
    <b>Documento Auxiliar da Nota Fiscal do Consumidor Eletrônica</b><br>
    ${dados.numeroNfe ? 'NFC-e nº ' + dados.numeroNfe : 'Pedido #' + dados.numeroPedido}
    ${dados.serieNfe ? ' | Série ' + dados.serieNfe : ''}<br>
    ${dados.criadoEm}
  </div>
  <hr>
  <div class="header" style="text-align:left">
    <b>Consumidor:</b> ${dados.clienteNome || 'NÃO IDENTIFICADO'}<br>
    CPF: ${formatCpfCnpj(dados.clienteCpf)}
    ${dados.status ? '<br>Status: ' + dados.status : ''}
  </div>
  <hr>
  <table>
    <tr style="font-size:10px;font-weight:bold"><td style="width:8%">Qtd</td><td style="width:42%">Descrição</td><td style="width:18%;text-align:right">Valor Unit.</td><td style="width:18%"></td><td style="width:14%;text-align:right">Total</td></tr>
    ${itensHtml}
  </table>
  <hr>
  <table style="font-size:11px">
    <tr><td colspan="4">Subtotal</td><td style="text-align:right">R$ ${dados.subtotal.toFixed(2)}</td></tr>
    ${dados.desconto > 0 ? `<tr><td colspan="4">Desconto</td><td style="text-align:right">- R$ ${dados.desconto.toFixed(2)}</td></tr>` : ''}
    ${dados.taxaFrete > 0 ? `<tr><td colspan="4">Frete</td><td style="text-align:right">R$ ${dados.taxaFrete.toFixed(2)}</td></tr>` : ''}
    ${tributoHtml}
    <tr class="total-row"><td colspan="4">TOTAL A PAGAR</td><td style="text-align:right">R$ ${dados.total.toFixed(2)}</td></tr>
  </table>
  <hr>
  <div style="text-align:center;font-size:12px">
    <strong>${dados.formaPagamento}</strong>
    ${dados.troco && dados.troco > 0 ? '<br>Troco: R$ ' + dados.troco.toFixed(2) : ''}
  </div>
  ${dados.tipoEntrega ? '<div style="text-align:center;font-size:10px;margin-top:3px">Tipo: ' + dados.tipoEntrega + '</div>' : ''}
  ${dados.endereco ? '<div style="text-align:center;font-size:10px">Endereço: ' + dados.endereco + '</div>' : ''}
  ${dados.observacao ? '<div class="obs">Obs: ' + dados.observacao + '</div>' : ''}
  ${dados.chaveAcesso ? `<hr><div class="chave">${dados.chaveAcesso}</div>` : ''}
  ${dados.qrCodeUrl ? `<div class="qr"><img src="${dados.qrCodeUrl}" alt="QR Code NFC-e"></div>` : ''}
  <hr>
  <div class="footer">
    Consulte pela chave de acesso em www.sefaz.xx.gov.br/nfce<br>
    Volte sempre!
  </div>
</body></html>`;
}