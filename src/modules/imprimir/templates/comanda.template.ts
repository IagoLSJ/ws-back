import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';

interface DadosComanda {
  numeroPedido: string;
  cliente?: string;
  mesa?: string;
  tipoEntrega?: string;
  endereco?: string;
  status?: string;
  itens: Array<{ nome: string; quantidade: number; modificadores?: string[]; observacao?: string }>;
  observacao?: string;
  criadoEm: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function gerarComandaHtml(dados: DadosComanda): string {
  const itensHtml = dados.itens
    .map((i) => {
      const modificadoresHtml = i.modificadores?.length
        ? `<br><span style="font-size:11px;color:#666">${escapeHtml(i.modificadores.join(', '))}</span>`
        : '';
      const observacaoHtml = i.observacao
        ? `<br><span style="font-size:11px;color:#e11d48">Obs: ${escapeHtml(i.observacao)}</span>`
        : '';

      return `
    <tr>
      <td style="font-size:14px;font-weight:bold;padding:4px 0;vertical-align:top">${i.quantidade}x</td>
      <td style="font-size:14px;padding:4px 0 4px 6px">
        ${escapeHtml(i.nome)}
        ${modificadoresHtml}
        ${observacaoHtml}
      </td>
    </tr>`;
    })
    .join('');

  const headerLinhas = [
    dados.status ? `Status: ${escapeHtml(dados.status)}` : '',
    dados.cliente ? `Contato: ${escapeHtml(dados.cliente)}` : '',
    dados.mesa ? `Mesa: ${escapeHtml(dados.mesa)}` : '',
    dados.tipoEntrega ? `Tipo: ${escapeHtml(dados.tipoEntrega)}` : '',
    dados.endereco ? `End: ${escapeHtml(dados.endereco)}` : '',
  ]
    .filter(Boolean)
    .join('<br>');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Comanda</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; padding: 8mm 4mm; color: #000; }
  h1 { text-align: center; font-size: 18px; margin-bottom: 4px; letter-spacing: 2px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .header { text-align: center; margin-bottom: 8px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  .obs { margin-top: 8px; font-size: 11px; color: #e11d48; font-style: italic; }
  .footer { text-align: center; margin-top: 12px; font-size: 10px; border-top: 1px dashed #000; padding-top: 6px; }
</style>
</head>
<body>
  <h1>COMANDA</h1>
  <hr>
  <div class="header">
    <strong>Pedido #${escapeHtml(dados.numeroPedido)}</strong><br>
    ${headerLinhas}${headerLinhas ? '<br>' : ''}
    ${escapeHtml(dados.criadoEm)}
  </div>
  <hr>
  <table>${itensHtml}</table>
  ${dados.observacao ? `<div class="obs">${escapeHtml(dados.observacao)}</div>` : ''}
  <hr>
  <div class="footer">Obrigado!</div>
</body>
</html>`;
}

export async function imprimirComanda(dados: DadosComanda, printerInterface: string): Promise<void> {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: printerInterface,
    characterSet: CharacterSet.PC860_PORTUGUESE,
    removeSpecialCharacters: false,
    lineCharacter: '-',
    width: 42,
  });

  const conectado = await printer.isPrinterConnected();
  if (!conectado) {
    throw new Error('Impressora térmica não conectada: ' + printerInterface);
  }

  printer.alignCenter();
  printer.setTextDoubleHeight();
  printer.bold(true);
  printer.println('COMANDA');
  printer.bold(false);
  printer.setTextNormal();
  printer.drawLine();

  printer.bold(true);
  printer.println(`Pedido #${dados.numeroPedido}`);
  printer.bold(false);

  if (dados.status) printer.println(`Status: ${dados.status}`);
  if (dados.cliente) printer.println(`Contato: ${dados.cliente}`);
  if (dados.mesa) printer.println(`Mesa: ${dados.mesa}`);
  if (dados.tipoEntrega) printer.println(`Tipo: ${dados.tipoEntrega}`);
  if (dados.endereco) printer.println(`Endereco: ${dados.endereco}`);
  printer.println(dados.criadoEm);
  printer.drawLine();

  printer.alignLeft();
  printer.tableCustom([
    { text: 'Qtd', align: 'LEFT', width: 0.15, bold: true },
    { text: 'Item', align: 'LEFT', width: 0.85, bold: true },
  ]);

  for (const item of dados.itens) {
    printer.tableCustom([
      { text: `${item.quantidade}x`, align: 'LEFT', width: 0.15, bold: true },
      { text: item.nome, align: 'LEFT', width: 0.85, bold: true },
    ]);

    if (item.modificadores?.length) {
      printer.println(`   ${item.modificadores.join(', ')}`);
    }
    if (item.observacao) {
      printer.println(`   Obs: ${item.observacao}`);
    }
    printer.newLine();
  }
  printer.drawLine();

  if (dados.observacao) {
    printer.alignLeft();
    printer.println(`Obs geral: ${dados.observacao}`);
    printer.drawLine();
  }

  printer.alignCenter();
  printer.println('Obrigado!');
  printer.newLine();
  printer.newLine();

  printer.cut();

  await printer.execute();
}
