interface DadosComanda {
  numeroPedido: string;
  cliente?: string;
  mesa?: string;
  tipoEntrega?: string;
  endereco?: string;
  itens: Array<{ nome: string; quantidade: number; modificadores?: string[]; observacao?: string }>;
  observacao?: string;
  criadoEm: string;
}

export function gerarComandaHtml(dados: DadosComanda): string {
  const itensHtml = dados.itens.map(i => `
    <tr>
      <td style="font-size:14px;font-weight:bold;padding:4px 0">${i.quantidade}x</td>
      <td style="font-size:14px;padding:4px 0">
        ${i.nome}
        ${i.modificadores?.length ? '<br><span style="font-size:11px;color:#666">' + i.modificadores.join(', ') + '</span>' : ''}
        ${i.observacao ? '<br><span style="font-size:11px;color:#e11d48">Obs: ' + i.observacao + '</span>' : ''}
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comanda</title>
<style>
  @page { margin: 0; size: ${dados.itens.length > 8 ? '80mm auto' : '80mm 200mm'}; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; padding: 8mm 4mm; color: #000; }
  h1 { text-align: center; font-size: 18px; margin-bottom: 4px; letter-spacing: 2px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .header { text-align: center; margin-bottom: 8px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  .obs { margin-top: 8px; font-size: 11px; color: #e11d48; font-style: italic; }
  .footer { text-align: center; margin-top: 12px; font-size: 10px; border-top: 1px dashed #000; padding-top: 6px; }
</style></head><body>
  <h1>☕ COMANDA</h1>
  <hr>
  <div class="header">
    <strong>Pedido #${dados.numeroPedido}</strong><br>
    ${dados.cliente ? 'Cliente: ' + dados.cliente + '<br>' : ''}
    ${dados.mesa ? 'Mesa: ' + dados.mesa + '<br>' : ''}
    ${dados.tipoEntrega ? 'Tipo: ' + dados.tipoEntrega + '<br>' : ''}
    ${dados.endereco ? 'End: ' + dados.endereco + '<br>' : ''}
    ${dados.criadoEm}
  </div>
  <hr>
  <table>${itensHtml}</table>
  ${dados.observacao ? '<div class="obs">📝 ' + dados.observacao + '</div>' : ''}
  <hr>
  <div class="footer">Obrigado! 🍔</div>
</body></html>`;
}
