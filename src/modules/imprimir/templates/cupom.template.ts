interface DadosCupom {
  negocioNome: string;
  numeroPedido: string;
  cliente?: string;
  status?: string;
  itens: Array<{ nome: string; quantidade: number; precoUnitario: number; modificadores?: string[] }>;
  subtotal: number;
  desconto: number;
  taxaFrete: number;
  total: number;
  formaPagamento: string;
  tipoEntrega?: string;
  endereco?: string;
  observacao?: string;
  criadoEm: string;
}

function linha(nome: string, valor: string): string {
  const dots = '.'.repeat(Math.max(2, 36 - nome.length - valor.length));
  return `${nome}${dots}${valor}`;
}

export function gerarCupomHtml(dados: DadosCupom): string {
  const itensHtml = dados.itens.map(i => {
    const totalItem = (i.precoUnitario * i.quantidade).toFixed(2);
    return `
    <tr>
      <td colspan="2" style="font-size:13px;font-weight:bold;padding-top:4px">${i.quantidade}x ${i.nome}</td>
      <td style="font-size:13px;text-align:right;padding-top:4px">R$ ${totalItem}</td>
    </tr>
    ${i.modificadores?.length ? `<tr><td colspan="3" style="font-size:10px;color:#666;padding-left:8px">${i.modificadores.join(', ')}</td></tr>` : ''}
  `}).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cupom</title>
<style>
  @page { margin: 0; size: 80mm 300mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; padding: 6mm 4mm; color: #000; }
  h1 { text-align: center; font-size: 16px; margin-bottom: 2px; }
  h2 { text-align: center; font-size: 13px; font-weight: normal; margin-bottom: 6px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .header { text-align: center; font-size: 11px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  .total-row td { font-size: 15px; font-weight: bold; padding-top: 4px; }
  .footer { text-align: center; margin-top: 10px; font-size: 10px; border-top: 1px dashed #000; padding-top: 6px; }
  .obs { margin-top: 6px; font-size: 11px; color: #e11d48; }
</style></head><body>
  <h1>${dados.negocioNome}</h1>
  <h2>CUPOM NÃO FISCAL</h2>
  <hr>
  <div class="header">
    Pedido #${dados.numeroPedido}<br>
    ${dados.status ? 'Status: ' + dados.status + '<br>' : ''}
    ${dados.criadoEm}<br>
    ${dados.cliente ? 'Contato: ' + dados.cliente : ''}
  </div>
  <hr>
  <table>${itensHtml}</table>
  <hr>
  <table style="font-size:12px">
    ${dados.desconto > 0 ? `<tr><td>Desconto</td><td></td><td style="text-align:right">- R$ ${dados.desconto.toFixed(2)}</td></tr>` : ''}
    ${dados.taxaFrete > 0 ? `<tr><td>Frete</td><td></td><td style="text-align:right">R$ ${dados.taxaFrete.toFixed(2)}</td></tr>` : ''}
    <tr class="total-row"><td colspan="2">TOTAL</td><td style="text-align:right">R$ ${dados.total.toFixed(2)}</td></tr>
  </table>
  <hr>
  <div style="text-align:center;font-size:12px">
    Forma de pagamento: <strong>${dados.formaPagamento}</strong>
  </div>
  ${dados.tipoEntrega ? '<div style="text-align:center;font-size:11px;margin-top:4px">Tipo: ' + dados.tipoEntrega + '</div>' : ''}
  ${dados.endereco ? '<div style="text-align:center;font-size:11px">Endereço: ' + dados.endereco + '</div>' : ''}
  ${dados.observacao ? '<div class="obs">Obs: ' + dados.observacao + '</div>' : ''}
  <hr>
  <div class="footer">Volte sempre! 🎉</div>
</body></html>`;
}
