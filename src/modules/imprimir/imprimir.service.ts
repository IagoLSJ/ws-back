import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infra/database/prisma.service';
import { gerarComandaHtml } from './templates/comanda.template';
import { gerarCupomHtml } from './templates/cupom.template';
import { CriarImpressoraDto } from './dto/criar-impressora.dto';
import { AtualizarImpressoraDto } from './dto/atualizar-impressora.dto';

@Injectable()
export class ImprimirService {
  private readonly logger = new Logger(ImprimirService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('print-job') private printQueue: Queue,
  ) {}

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
        negocio: { select: { id: true, nome: true, logoUrl: true } },
        mesa: { select: { numero: true } },
      },
    });
    if (!pedido || pedido.negocioId !== negocioId) throw new NotFoundException('Pedido não encontrado');

    const mesaNumero = pedido.mesa?.numero?.toString();

    const logoUrl = (pedido.negocio as any).logoUrl || undefined;
    const negocioNome = pedido.negocio.nome;

    const comandaBase = {
      numeroPedido: pedido.id.slice(0, 8).toUpperCase(),
      cliente: pedido.contato || undefined,
      mesa: mesaNumero,
      tipoEntrega: pedido.tipoEntrega || undefined,
      endereco: pedido.endereco ? formatarEndereco(pedido.endereco as any) : undefined,
      status: traduzirStatus(pedido.status),
      itens: pedido.itens.map(i => ({
        nome: i.produtoNome,
        quantidade: Number(i.quantidade),
        modificadores: extrairModificadores(i.modificadores),
        observacao: undefined,
      })),
      observacao: pedido.observacao || undefined,
      criadoEm: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(pedido.criadoEm),
      logoUrl,
      negocioNome,
    };

    const html = gerarComandaHtml(comandaBase);

    let enviadoParaRede = false;
    const dados = { ...comandaBase, papelLargura: 80 };
    if (impressoraId) {
      const imp = await this.prisma.impressoraConfig.findUnique({ where: { id: impressoraId } });
      if (imp?.conexao === 'REDE' && imp.enderecoIp) {
        try {
          const papelLargura = imp.papelLargura || 80;
          const htmlAjustado = gerarComandaHtml({ ...dados, papelLargura });
          await this.enviarTcp(imp.enderecoIp, imp.porta || 9100, htmlAjustado);
          enviadoParaRede = true;
        } catch (err) {
          this.logger.error(`Erro ao imprimir comanda na impressora ${imp.id}: ${err}`);
        }
      } else if (imp) {
        this.logger.warn(`Impressora ${imp.id} é ${imp.conexao} - backend só suporta REDE. A impressão deve ser feita pelo frontend (QZ Tray/WebUSB).`);
      }
    } else {
      const impressoras = await this.prisma.impressoraConfig.findMany({ where: { negocioId, ativo: true, tipoUso: 'COZINHA' } });
      if (!impressoras.length) {
        this.logger.warn(`Nenhuma impressora ativa configurada para o negócio ${negocioId}`);
      }
      for (const imp of impressoras) {
        if (imp.conexao === 'REDE' && imp.enderecoIp) {
          try {
            const papelLargura = imp.papelLargura || 80;
            const htmlAjustado = gerarComandaHtml({ ...dados, papelLargura });
            await this.enviarTcp(imp.enderecoIp, imp.porta || 9100, htmlAjustado);
            enviadoParaRede = true;
          } catch (err) {
            this.logger.error(`Erro ao imprimir comanda na impressora ${imp.id} (${imp.enderecoIp}:${imp.porta}): ${err}`);
          }
        } else if (imp.conexao !== 'REDE') {
          this.logger.warn(`Impressora ${imp.id} é ${imp.conexao} - ignorada pelo backend (necessário QZ Tray no frontend para impressão)`);
        }
      }
    }

    if (!enviadoParaRede) {
      this.logger.log(`Comanda do pedido ${pedidoId} não foi enviada para nenhuma impressora REDE. Aguardando frontend via QZ Tray/WebUSB...`);
    }

    return { html, enviadoParaRede };
  }

  async imprimirCupom(negocioId: string, pedidoId: string, impressoraId?: string, usuarioId?: string): Promise<{ html: string; enviadoParaRede: boolean }> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        itens: true,
        pagamentos: true,
        negocio: { include: { configuracoes: true } },
      },
    });
    if (!pedido || pedido.negocioId !== negocioId) throw new NotFoundException('Pedido não encontrado');

    const pagamento = pedido.pagamentos[0];
    const totalItens = pedido.itens.reduce((s, i) => s + Number(i.precoUnitario) * Number(i.quantidade), 0);
    const taxaFrete = Number(pedido.taxaFrete) || 0;
    const config = pedido.negocio.configuracoes;
    const endEmitente = config?.endereco ? formatarEndereco(config.endereco as any) : undefined;

    const statusTraduzido = traduzirStatus(pedido.status);
    const html = gerarCupomHtml({
      negocioNome: pedido.negocio.nome,
      razaoSocial: config?.razaoSocial || undefined,
      cnpj: config?.cnpj || undefined,
      ie: config?.ie || undefined,
      enderecoEmitente: endEmitente,
      numeroPedido: pedido.id.slice(0, 8).toUpperCase(),
      numeroNfe: pedido.numeroNfe || undefined,
      serieNfe: pedido.serieNfe || undefined,
      cliente: pedido.contato || undefined,
      clienteCpf: pedido.clienteCpf || undefined,
      clienteNome: pedido.clienteNome || undefined,
      status: statusTraduzido,
      itens: pedido.itens.map(i => ({
        nome: i.produtoNome,
        quantidade: Number(i.quantidade),
        precoUnitario: Number(i.precoUnitario),
        modificadores: extrairModificadores(i.modificadores),
      })),
      subtotal: totalItens,
      desconto: 0,
      taxaFrete,
      total: Number(pedido.total),
      formaPagamento: pagamento ? this.traduzirPagamento(pagamento.metodo) : 'N/A',
      troco: pedido.troco ? Number(pedido.troco) : undefined,
      tipoEntrega: pedido.tipoEntrega || undefined,
      endereco: pedido.endereco ? formatarEndereco(pedido.endereco as any) : undefined,
      observacao: pedido.observacao || undefined,
      criadoEm: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(pedido.criadoEm),
      chaveAcesso: pedido.chaveAcesso || undefined,
      qrCodeUrl: pedido.qrCodeUrl || undefined,
      tributosAproximados: pedido.tributosAproximados ? Number(pedido.tributosAproximados) : undefined,
    });

    let enviadoParaRede = false;
    if (impressoraId) {
      enviadoParaRede = await this.enviarParaImpressora(impressoraId, html);
    } else {
      // Se tem operador logado, tenta achar a impressora dele primeiro
      let impressoras: any[];
      if (usuarioId) {
        const impDoOperador = await this.prisma.impressoraConfig.findFirst({
          where: { negocioId, ativo: true, tipoUso: 'OPERADOR', operadorId: usuarioId },
        });
        if (impDoOperador?.conexao === 'REDE' && impDoOperador.enderecoIp) {
          const ok = await this.enviarTcp(impDoOperador.enderecoIp, impDoOperador.porta || 9100, html);
          return { html, enviadoParaRede: ok };
        }
      }
      // Fallback: imprime em qualquer impressora OPERADOR
      impressoras = await this.prisma.impressoraConfig.findMany({ where: { negocioId, ativo: true, conexao: 'REDE', tipoUso: 'OPERADOR' } });
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

  async obterComandaEscPos(negocioId: string, pedidoId: string): Promise<Buffer> {
    const { html } = await this.imprimirComanda(negocioId, pedidoId);
    return this.htmlToEscPos(html);
  }

  async obterCupomEscPos(negocioId: string, pedidoId: string): Promise<Buffer> {
    const { html } = await this.imprimirCupom(negocioId, pedidoId);
    return this.htmlToEscPos(html);
  }

  private async enviarParaImpressora(impressoraId: string, html: string): Promise<boolean> {
    const imp = await this.prisma.impressoraConfig.findUnique({ where: { id: impressoraId } });
    if (!imp || !imp.ativo) return false;

    if (imp.conexao === 'REDE' && imp.enderecoIp) {
      return this.enviarTcp(imp.enderecoIp, imp.porta || 9100, html);
    }
    return false;
  }

  private async enviarTcp(host: string, port: number, html: string): Promise<boolean> {
    try {
      const data = this.htmlToEscPos(html);
      await this.printQueue.add('print', { host, port, data }, {
        attempts: 2,
        backoff: { type: 'fixed', delay: 2000 },
      });
      this.logger.log(`Job de impressão enfileirado para ${host}:${port}`);
      return true;
    } catch (err) {
      this.logger.error(`Erro ao enfileirar impressão para ${host}:${port}: ${err}`);
      return false;
    }
  }

  private htmlToEscPos(html: string): Buffer {
    let text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<tr[^>]*>/gi, '')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<td[^>]*>/gi, '')
      .replace(/<\/td>/gi, ' ')
      .replace(/<div[^>]*>/gi, '')
      .replace(/<\/div>/gi, '\n')
      .replace(/<span[^>]*>/gi, '')
      .replace(/<\/span>/gi, '')
      .replace(/<h1>/gi, '')
      .replace(/<\/h1>/gi, '\n')
      .replace(/<h2>/gi, '')
      .replace(/<\/h2>/gi, '\n')
      .replace(/<strong>/gi, '')
      .replace(/<\/strong>/gi, '')
      .replace(/<hr>/gi, '\n-----------------------------\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s*\n\s*/g, '\n')
      .trim();

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const buf: number[] = [];

    buf.push(0x1B, 0x40);
    buf.push(0x1B, 0x61, 0x00);

    for (const line of lines) {
      const isCenter = line.includes('☕');
      const isBold = line.includes('COMANDA') || line.includes('TOTAL');

      if (isCenter) buf.push(0x1B, 0x61, 0x01);
      if (isBold) buf.push(0x1B, 0x45, 0x01);

      const cleanLine = line.replace(/Endereco: |Endereço: /gi, '').replace(/☕/g, '').trim();
      if (cleanLine) {
        const maxLen = 48;
        const lines = cleanLine.length > maxLen
          ? [cleanLine.substring(0, maxLen), cleanLine.substring(maxLen)]
          : [cleanLine];
        for (const l of lines) {
          const encoded = Buffer.from(l.trim().substring(0, maxLen) + '\n', 'latin1');
          for (const b of encoded) buf.push(b);
        }
      }

      if (isBold) buf.push(0x1B, 0x45, 0x00);
      if (isCenter) buf.push(0x1B, 0x61, 0x00);
    }

    buf.push(0x1B, 0x64, 0x03);
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

function extrairModificadores(modificadores: unknown): string[] | undefined {
  if (!modificadores) return undefined;
  const arr = Array.isArray(modificadores) ? modificadores : [];
  return arr.map((m: any) => (typeof m === 'string' ? m : m.nome ?? m.opcaoNome ?? ''));
}

function formatarEndereco(e: Record<string, any>): string {
  const parts: string[] = [];
  if (e.logradouro || e.rua) parts.push(e.logradouro || e.rua);
  if (e.numero) parts.push(e.numero);
  if (e.complemento) parts.push(e.complemento);
  if (e.bairro) parts.push(e.bairro);
  if (e.cidade) parts.push(e.cidade);
  if (e.estado) parts.push(e.estado);
  if (e.cep) parts.push(`CEP: ${e.cep}`);
  return parts.join(', ') || '';
}

function traduzirStatus(status: string): string {
  const mapa: Record<string, string> = {
    PENDENTE: 'Pendente',
    CONFIRMADO: 'Confirmado',
    PREPARANDO: 'Preparando',
    SAIU_PARA_ENTREGA: 'Saiu p/ Entrega',
    ENTREGUE: 'Entregue',
    CANCELADO: 'Cancelado',
  };
  return mapa[status] || status;
}
