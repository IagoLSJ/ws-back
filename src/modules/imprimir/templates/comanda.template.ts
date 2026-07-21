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
  logoUrl?: string;
  negocioNome?: string;
  papelLargura?: number; // 58 ou 80 (mm)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function gerarComandaHtml(dados: DadosComanda): string {
  const itensHtml = dados.itens
    .map((i) => {
      const modificadoresHtml = i.modificadores?.length
        ? `<br><span style="font-size:20px;font-weight:bold;color:#000">${escapeHtml(i.modificadores.join(', '))}</span>`
        : '';
      const observacaoHtml = i.observacao
        ? `<br><span style="font-size:18px;font-weight:bold;color:#000">Obs: ${escapeHtml(i.observacao)}</span>`
        : '';

      return `
    <tr>
      <td style="font-size:20px;font-weight:900;padding:6px 0;vertical-align:top">${i.quantidade}x</td>
      <td style="font-size:20px;font-weight:900;padding:6px 0 6px 8px">
        ${escapeHtml(i.nome)}
        ${modificadoresHtml}
        ${observacaoHtml}
      </td>
    </tr>`;
    })
    .join('');

  const headerLinhas = [
    dados.status ? `<strong>${escapeHtml(dados.status)}</strong>` : '',
    dados.cliente ? `Contato: ${escapeHtml(dados.cliente)}` : '',
    dados.mesa ? `Mesa: ${escapeHtml(dados.mesa)}` : '',
    dados.tipoEntrega ? `Tipo: ${escapeHtml(dados.tipoEntrega)}` : '',
  ]
    .filter(Boolean)
    .join('<br>');

  // Para entrega, mostra endereco resumido
  const enderecoHtml = dados.endereco && dados.tipoEntrega === 'ENTREGA'
    ? `<br>📌 ${escapeHtml(dados.endereco)}`
    : '';

  const largura = dados.papelLargura || 80;
  const is58 = largura <= 58;

  const logoSvg = dados.logoUrl
    ? `<img src="${escapeHtml(dados.logoUrl)}" style="max-height:50px;max-width:${is58 ? 140 : 200}px;display:block;margin:0 auto 4px" />`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Comanda</title>
<style>
  @page { margin: 0; size: ${largura}mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: ${is58 ? 16 : 18}px; padding: ${is58 ? '4mm 2mm' : '6mm 4mm'}; color: #000; }
  .logo { text-align: center; margin-bottom: 6px; }
  h1 { text-align: center; font-size: ${is58 ? 20 : 22}px; font-weight: 900; margin-bottom: 2px; letter-spacing: 1px; color: #000; }
  .negocio-nome { text-align: center; font-size: ${is58 ? 18 : 20}px; font-weight: bold; color: #000; margin-bottom: 4px; }
  hr { border: none; border-top: 2px solid #000; margin: 6px 0; }
  .header { text-align: center; margin-bottom: 6px; font-size: 18px; font-weight: bold; color: #000; }
  .header strong { font-size: 20px; }
  table { width: 100%; border-collapse: collapse; }
  td { font-size: 20px; font-weight: 900; color: #000; }
  .endereco { font-size: 16px; font-weight: bold; color: #000; margin-top: 4px; padding: 4px 0; }
  .obs { margin-top: 6px; font-size: 18px; font-weight: bold; color: #000; }
  .footer { text-align: center; margin-top: 10px; font-size: 18px; font-weight: bold; border-top: 2px solid #000; padding-top: 6px; color: #000; }
</style>
</head>
<body>
  ${logoSvg}
  <h1>COMANDA</h1>
  ${dados.negocioNome ? `<div class="negocio-nome">${escapeHtml(dados.negocioNome)}</div>` : ''}
  <hr>
  <div class="header">
    <strong>Pedido #${escapeHtml(dados.numeroPedido)}</strong><br>
    ${headerLinhas}${headerLinhas ? '<br>' : ''}
    ${escapeHtml(dados.criadoEm)}
    ${enderecoHtml}
  </div>
  <hr>
  <table>${itensHtml}</table>
  ${dados.observacao ? `<div class="obs">Obs: ${escapeHtml(dados.observacao)}</div>` : ''}
  <hr>
  <div class="footer">Obrigado!</div>
</body>
</html>`;
}

export async function imprimirComanda(dados: DadosComanda, printerInterface: string): Promise<void> {
  const is58 = (dados.papelLargura || 80) <= 58;
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: printerInterface,
    characterSet: CharacterSet.PC860_PORTUGUESE,
    removeSpecialCharacters: false,
    lineCharacter: '-',
    width: is58 ? 32 : 42,
  });

  const conectado = await printer.isPrinterConnected();
  if (!conectado) {
    throw new Error('Impressora térmica não conectada: ' + printerInterface);
  }

  printer.alignCenter();
  // Logo textual: nome do negócio em destaque
  if (dados.negocioNome) {
    printer.bold(true);
    printer.setTextDoubleHeight();
    printer.println(dados.negocioNome.toUpperCase());
    printer.setTextNormal();
    printer.bold(false);
    printer.newLine();
  }
  printer.setTextDoubleHeight();
  printer.bold(true);
  printer.println('COMANDA');
  printer.bold(false);
  printer.setTextNormal();
  printer.drawLine();

  printer.bold(true);
  printer.println(`Pedido #${dados.numeroPedido}`);
  printer.bold(false);

  if (dados.status) printer.println(`${dados.status}`);
  if (dados.cliente) printer.println(`Contato: ${dados.cliente}`);
  if (dados.mesa) printer.println(`Mesa: ${dados.mesa}`);
  if (dados.tipoEntrega) printer.println(`${dados.tipoEntrega}`);
  if (dados.endereco && dados.tipoEntrega === 'ENTREGA') printer.println(`📌 ${dados.endereco}`);
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
