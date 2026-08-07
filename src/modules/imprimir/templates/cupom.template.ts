export interface DadosCupom {
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
  taxaCartao?: number;
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
  logoUrl?: string;
  papelLargura?: number; // 58 ou 80 (mm)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const largura = dados.papelLargura || 80;
  const is58 = largura <= 58;

  const logoSvg = dados.logoUrl
    ? `<img src="${escapeHtml(dados.logoUrl)}" style="max-height:${is58 ? 35 : 50}px;max-width:${is58 ? 120 : 200}px;display:block;margin:0 auto 4px" />`
    : '';

  const itensHtml = dados.itens.map(i => {
    const unit = i.precoUnitario.toFixed(2);
    const totalItem = (i.precoUnitario * i.quantidade).toFixed(2);
    return `
    <tr>
      <td style="font-size:${is58 ? 11 : 12}px;font-weight:bold;padding-top:4px">${i.quantidade}x ${escapeHtml(i.nome)}</td>
      <td style="font-size:${is58 ? 11 : 12}px;text-align:right;padding-top:4px">${totalItem}</td>
    </tr>
    <tr><td colspan="2" style="font-size:9px;color:#000;padding-left:6px">und.: R$ ${unit}${i.modificadores?.length ? ' | ' + escapeHtml(i.modificadores.join(', ')) : ''}</td></tr>
  `}).join('');

  const tributoHtml = dados.tributosAproximados && dados.tributosAproximados > 0
    ? `<tr><td>Tributos aproximados</td><td style="text-align:right">R$ ${dados.tributosAproximados.toFixed(2)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>NFC-e</title>
<style>
  @page { margin: 0; size: ${largura}mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: ${is58 ? 10 : 11}px; padding: ${is58 ? '3mm 2mm' : '4mm 3mm'}; color: #000; font-weight: 600; }
  h1 { text-align: center; font-size: ${is58 ? 13 : 15}px; font-weight: bold; margin-bottom: 1px; }
  h2 { text-align: center; font-size: ${is58 ? 11 : 12}px; font-weight: bold; margin-bottom: 4px; }
  hr { border: none; border-top: 2px dashed #000; margin: 4px 0; }
  .header { text-align: center; font-size: ${is58 ? 9 : 10}px; margin-bottom: 4px; }
  .header b { font-size: ${is58 ? 10 : 11}px; }
  table { width: 100%; border-collapse: collapse; font-size: ${is58 ? 10 : 11}px; }
  td { padding: 1px 2px; vertical-align: top; color: #000; }
  .total-row td { font-size: ${is58 ? 13 : 15}px; font-weight: bold; padding-top: 3px; }
  .footer { text-align: center; margin-top: 8px; font-size: 9px; font-weight: 700; padding-top: 4px; color: #000; }
  .obs { margin-top: 4px; font-size: ${is58 ? 9 : 10}px; font-weight: bold; color: #c81e1e; }
  .qr { text-align: center; margin: 6px 0; }
  .qr img { width: ${is58 ? 100 : 120}px; height: ${is58 ? 100 : 120}px; image-rendering: pixelated; }
  .logo { text-align: center; margin-bottom: 4px; }
  .logo img { image-rendering: pixelated; }
  .chave { text-align: center; font-size: 9px; font-weight: bold; letter-spacing: 1px; word-break: break-all; margin: 2px 0; color: #000; }
  .small { font-size: 9px; color: #000; }
</style>
</head>
<body>
  ${logoSvg ? `<div class="logo">${logoSvg}</div>` : ''}
  <h1>${escapeHtml(dados.razaoSocial || dados.negocioNome)}</h1>
  <div class="header">
    ${dados.cnpj ? 'CNPJ: ' + formatCpfCnpj(dados.cnpj) + '<br>' : ''}
    ${dados.ie ? 'IE: ' + escapeHtml(dados.ie) + '<br>' : ''}
    ${dados.enderecoEmitente ? escapeHtml(dados.enderecoEmitente) + '<br>' : ''}
  </div>
  <hr>
  <h2>DANFE NFC-e</h2>
  <div class="header">
    <b>Documento Auxiliar da Nota Fiscal do Consumidor Eletrônica</b><br>
    ${dados.numeroNfe ? 'NFC-e nº ' + escapeHtml(dados.numeroNfe) : 'Pedido #' + escapeHtml(dados.numeroPedido)}
    ${dados.serieNfe ? ' | Série ' + escapeHtml(dados.serieNfe) : ''}<br>
    ${escapeHtml(dados.criadoEm)}
  </div>
  <hr>
  <div class="header" style="text-align:left">
    <b>Consumidor:</b> ${escapeHtml(dados.clienteNome || 'NÃO IDENTIFICADO')}<br>
    CPF: ${formatCpfCnpj(dados.clienteCpf)}
    ${dados.status ? '<br>Status: ' + escapeHtml(dados.status) : ''}
  </div>
  <hr>
  <table>
    <tr style="font-size:${is58 ? 9 : 10}px;font-weight:bold"><td>Qtd</td><td style="text-align:right">Total</td></tr>
    ${itensHtml}
  </table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right">R$ ${dados.subtotal.toFixed(2)}</td></tr>
    ${dados.desconto > 0 ? `<tr><td>Desconto</td><td style="text-align:right">- R$ ${dados.desconto.toFixed(2)}</td></tr>` : ''}
    ${dados.taxaFrete > 0 ? `<tr><td>Frete</td><td style="text-align:right">R$ ${dados.taxaFrete.toFixed(2)}</td></tr>` : ''}
    ${dados.taxaCartao ? `<tr><td>Taxa cartão</td><td style="text-align:right">+ R$ ${dados.taxaCartao.toFixed(2)}</td></tr>` : ''}
    ${tributoHtml}
    <tr class="total-row"><td>${dados.formaPagamento === 'A Prazo' ? 'VALOR DA COMPRA' : 'TOTAL A PAGAR'}</td><td style="text-align:right">R$ ${dados.total.toFixed(2)}</td></tr>
  </table>
  <hr>
  <div style="text-align:center;font-size:${is58 ? 11 : 12}px">
    <strong>${escapeHtml(dados.formaPagamento)}</strong>
    ${dados.troco && dados.troco > 0 ? '<br>Troco: R$ ' + dados.troco.toFixed(2) : ''}
  </div>
  ${dados.tipoEntrega ? '<div style="text-align:center;font-size:10px;margin-top:3px">Tipo: ' + escapeHtml(dados.tipoEntrega) + '</div>' : ''}
  ${dados.endereco ? '<div style="text-align:center;font-size:10px">Endereço: ' + escapeHtml(dados.endereco) + '</div>' : ''}
  ${dados.observacao ? '<div class="obs">Obs: ' + escapeHtml(dados.observacao) + '</div>' : ''}
  ${dados.chaveAcesso ? `<hr><div class="chave">${dados.chaveAcesso}</div>` : ''}
  ${dados.qrCodeUrl ? `<div class="qr"><img src="${dados.qrCodeUrl}" alt="QR Code NFC-e"></div>` : ''}
  <hr>
  <div class="footer">
    Consulte pela chave de acesso em www.sefaz.xx.gov.br/nfce<br>
    Volte sempre!
  </div>
</body>
</html>`;
}
