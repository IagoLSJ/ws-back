import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import * as net from 'net';
import { gerarComandaHtml } from './templates/comanda.template';
import { gerarCupomHtml } from './templates/cupom.template';
import { CriarImpressoraDto } from './dto/criar-impressora.dto';
import { AtualizarImpressoraDto } from './dto/atualizar-impressora.dto';

@Injectable()
export class ImprimirService {
  private readonly logger = new Logger(ImprimirService.name);

  constructor(private prisma: PrismaService) {}

  async listarImpressoras(negocioId: string) {
    return this.prisma.impressoraConfig.findMany({ where: { negocioId }, orderBy: { criadoEm: 'desc' } });
  }

  async criarImpressora(negocioId: string, dto: CriarImpressoraDto) {
    return this.prisma.impressoraConfig.create({ data: { negocioId, ...dto } });
  }

  async atualizarImpressora(id: string, negocioId: string, dto: AtualizarImpressoraDto) {
    const exists = await this.prisma.impressoraConfig.findFirst({ where: { id, negocioId } });
    if (!exists) throw new NotFoundException('Impressora não encontrada');
    return this.prisma.impressoraConfig.update({ where: { id }, data: dto });
  }

  async removerImpressora(id: string, negocioId: string) {
    const exists = await this.prisma.impressoraConfig.findFirst({ where: { id, negocioId } });
    if (!exists) throw new NotFoundException('Impressora não encontrada');
    return this.prisma.impressoraConfig.delete({ where: { id } });
  }

  async imprimirComanda(negocioId: string, pedidoId: string, impressoraId?: string): Promise<{ html: string; enviadoParaRede: boolean }> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        itens: true,
        negocio: true,
      },
    });
    if (!pedido || pedido.negocioId !== negocioId) throw new NotFoundException('Pedido não encontrado');

    const html = gerarComandaHtml({
      numeroPedido: pedido.id.slice(0, 8).toUpperCase(),
      cliente: pedido.contato || undefined,
      tipoEntrega: pedido.tipoEntrega || undefined,
      endereco: pedido.endereco ? `${(pedido.endereco as any).logradouro || ''}, ${(pedido.endereco as any).bairro || ''}`.trim() : undefined,
      itens: pedido.itens.map(i => ({
        nome: i.produtoNome,
        quantidade: i.quantidade,
        modificadores: i.modificadores ? (Array.isArray(i.modificadores) ? i.modificadores : []) as string[] : undefined,
        observacao: undefined,
      })),
      observacao: pedido.observacao || undefined,
      criadoEm: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(pedido.criadoEm),
    });

    let enviadoParaRede = false;
    if (impressoraId) {
      enviadoParaRede = await this.enviarParaImpressora(impressoraId, html);
    } else {
      const impressoras = await this.prisma.impressoraConfig.findMany({ where: { negocioId, ativo: true, conexao: 'REDE' } });
      for (const imp of impressoras) {
        const ok = await this.enviarTcp(imp.enderecoIp!, imp.porta!, html);
        if (ok) enviadoParaRede = true;
      }
    }

    return { html, enviadoParaRede };
  }

  async imprimirCupom(negocioId: string, pedidoId: string, impressoraId?: string): Promise<{ html: string; enviadoParaRede: boolean }> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        itens: true,
        pagamentos: true,
        negocio: true,
      },
    });
    if (!pedido || pedido.negocioId !== negocioId) throw new NotFoundException('Pedido não encontrado');

    const pagamento = pedido.pagamentos[0];
    const totalItens = pedido.itens.reduce((s, i) => s + Number(i.precoUnitario) * i.quantidade, 0);
    const taxaFrete = Number(pedido.taxaFrete) || 0;

    const html = gerarCupomHtml({
      negocioNome: pedido.negocio.nome,
      numeroPedido: pedido.id.slice(0, 8).toUpperCase(),
      cliente: pedido.contato || undefined,
      itens: pedido.itens.map(i => ({
        nome: i.produtoNome,
        quantidade: i.quantidade,
        precoUnitario: Number(i.precoUnitario),
        modificadores: i.modificadores ? (Array.isArray(i.modificadores) ? i.modificadores : []) as string[] : undefined,
      })),
      subtotal: totalItens,
      desconto: 0,
      taxaFrete,
      total: Number(pedido.total),
      formaPagamento: pagamento ? this.traduzirPagamento(pagamento.metodo) : 'N/A',
      tipoEntrega: pedido.tipoEntrega || undefined,
      endereco: pedido.endereco ? `${(pedido.endereco as any).logradouro || ''}, ${(pedido.endereco as any).bairro || ''}${(pedido.endereco as any).cidade ? ' - ' + (pedido.endereco as any).cidade : ''}`.trim() : undefined,
      observacao: pedido.observacao || undefined,
      criadoEm: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(pedido.criadoEm),
    });

    let enviadoParaRede = false;
    if (impressoraId) {
      enviadoParaRede = await this.enviarParaImpressora(impressoraId, html);
    } else {
      const impressoras = await this.prisma.impressoraConfig.findMany({ where: { negocioId, ativo: true, conexao: 'REDE' } });
      for (const imp of impressoras) {
        const ok = await this.enviarTcp(imp.enderecoIp!, imp.porta!, html);
        if (ok) enviadoParaRede = true;
      }
    }

    return { html, enviadoParaRede };
  }

  async obterComandaHtml(negocioId: string, pedidoId: string): Promise<string> {
    const result = await this.imprimirComanda(negocioId, pedidoId);
    return result.html;
  }

  async obterCupomHtml(negocioId: string, pedidoId: string): Promise<string> {
    const result = await this.imprimirCupom(negocioId, pedidoId);
    return result.html;
  }

  private async enviarParaImpressora(impressoraId: string, html: string): Promise<boolean> {
    const imp = await this.prisma.impressoraConfig.findUnique({ where: { id: impressoraId } });
    if (!imp || !imp.ativo) return false;

    if (imp.conexao === 'REDE' && imp.enderecoIp) {
      return this.enviarTcp(imp.enderecoIp, imp.porta || 9100, html);
    }
    return false;
  }

  private enviarTcp(host: string, port: number, html: string): Promise<boolean> {
    return new Promise(resolve => {
      const client = new net.Socket();
      const timeout = 5000;
      client.setTimeout(timeout);

      client.connect(port, host, () => {
        this.logger.log(`Conectado à impressora ${host}:${port}`);
        client.write(this.htmlToEscPos(html));
      });

      client.on('data', () => { client.destroy(); resolve(true); });

      client.on('error', (err) => {
        this.logger.error(`Erro impressora ${host}:${port}: ${err.message}`);
        client.destroy();
        resolve(false);
      });

      client.on('timeout', () => {
        this.logger.warn(`Timeout impressora ${host}:${port}`);
        client.destroy();
        resolve(false);
      });

      client.on('close', () => resolve(true));
    });
  }

  private htmlToEscPos(html: string): Buffer {
    const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const buf: number[] = [];

    buf.push(0x1B, 0x40);
    buf.push(0x1B, 0x61, 0x00);

    for (const line of lines) {
      const isCenter = line.length > 0 && line[0] === '☕';
      const isBold = line.includes('COMANDA') || line.includes('TOTAL');

      if (isCenter) buf.push(0x1B, 0x61, 0x01);
      if (isBold) { buf.push(0x1B, 0x45, 0x01); }

      const encoded = Buffer.from(line.substring(0, 42) + '\n', 'latin1');
      for (const b of encoded) buf.push(b);

      if (isBold) { buf.push(0x1B, 0x45, 0x00); }
      if (isCenter) buf.push(0x1B, 0x61, 0x00);
    }

    buf.push(0x1B, 0x64, 0x03);
    buf.push(0x1D, 0x56, 0x41, 0x00);
    return Buffer.from(buf);
  }

  private traduzirPagamento(metodo: string): string {
    const mapa: Record<string, string> = {
      DINHEIRO: 'Dinheiro',
      CARTAO_CREDITO: 'Cartão Crédito',
      CARTAO_DEBITO: 'Cartão Débito',
      PIX: 'Pix',
      OUTRO: 'Outro',
    };
    return mapa[metodo] || metodo;
  }
}
