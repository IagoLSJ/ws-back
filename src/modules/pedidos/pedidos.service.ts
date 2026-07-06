import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { CheckoutDto } from './dto/checkout.dto';
import { EstoqueService } from '../estoque/estoque.service';
import { StatusPedido, MetodoPagamento, StatusPagamento, TipoMovimentacao } from '@prisma/client';
import { calcularPrecoFinal } from '../../common/utils/preco';

@Injectable()
export class PedidosService {
  constructor(
    private prisma: PrismaService,
    private estoqueService: EstoqueService,
  ) {}

  private async resolveNegocioId(slug: string): Promise<string> {
    const negocio = await this.prisma.negocio.findUnique({
      where: { slug, ativo: true },
      select: { id: true },
    });
    if (!negocio) {
      const byId = await this.prisma.negocio.findUnique({
        where: { id: slug, ativo: true },
        select: { id: true },
      });
      if (!byId) throw new NotFoundException('Negócio não encontrado');
      return byId.id;
    }
    return negocio.id;
  }

  private async baixarEstoque(negocioId: string, pedido: any, usuarioId?: string) {
    for (const item of pedido.itens) {
      const estoqueItem = await this.prisma.estoqueItem.findFirst({
        where: { negocioId, produtoId: item.produtoId },
        include: { produto: { select: { controlaEstoque: true } } },
      });
      if (!estoqueItem || !estoqueItem.produto?.controlaEstoque) continue;

      const jaBaixado = await this.prisma.movimentacaoEstoque.findFirst({
        where: {
          estoqueItemId: estoqueItem.id,
          tipo: TipoMovimentacao.SAIDA_VENDA,
          referencia: pedido.id,
        },
      });
      if (jaBaixado) continue;

      await this.estoqueService.movimentar(
        negocioId,
        estoqueItem.id,
        {
          tipo: TipoMovimentacao.SAIDA_VENDA,
          quantidade: item.quantidade,
          motivo: `Pedido #${pedido.id.slice(0, 8)}`,
          referencia: pedido.id,
        },
        usuarioId,
      );
    }
  }

  private async estornarEstoque(negocioId: string, pedido: any, usuarioId?: string) {
    for (const item of pedido.itens) {
      const mov = await this.prisma.movimentacaoEstoque.findFirst({
        where: {
          estoqueItem: { negocioId, produtoId: item.produtoId },
          tipo: TipoMovimentacao.SAIDA_VENDA,
          referencia: pedido.id,
        },
        include: { estoqueItem: { select: { id: true } } },
      });
      if (!mov) continue;

      await this.estoqueService.movimentar(
        negocioId,
        mov.estoqueItemId,
        {
          tipo: TipoMovimentacao.ENTRADA,
          quantidade: item.quantidade,
          motivo: `Estorno pedido #${pedido.id.slice(0, 8)}`,
          referencia: pedido.id,
        },
        usuarioId,
      );
    }
  }

  async checkout(slug: string, sessionId: string, dto: CheckoutDto, usuarioId?: string) {
    const negocioId = await this.resolveNegocioId(slug);

    const config = await this.prisma.configuracaoNegocio.findUnique({ where: { negocioId } });

    const carrinho = await this.prisma.carrinho.findUnique({
      where: { negocioId_sessionId: { negocioId, sessionId } },
      include: {
        itens: {
          include: {
            produto: {
              select: {
                id: true,
                nome: true,
                preco: true,
                tipoDesconto: true,
                valorDesconto: true,
                controlaEstoque: true,
              },
            },
            opcoesSelecionadas: { include: { opcao: true } },
          },
        },
      },
    });

    if (!carrinho || !carrinho.itens.length) {
      throw new BadRequestException('Carrinho vazio');
    }

    for (const item of carrinho.itens) {
      if (!item.produto.controlaEstoque) continue;
      const estoqueItem = await this.prisma.estoqueItem.findFirst({
        where: { negocioId, produtoId: item.produto.id },
      });
      if (!estoqueItem || estoqueItem.quantidadeAtual < item.quantidade) {
        throw new BadRequestException(`Estoque insuficiente para "${item.produto.nome}"`);
      }
    }

    const itensData = carrinho.itens.map((item) => {
      const precoBase = calcularPrecoFinal(item.produto);
      const extraOpcoes = item.opcoesSelecionadas.reduce(
        (s, o) => s + Number(o.opcao.precoExtra),
        0,
      );
      const precoUnitario = precoBase + extraOpcoes;
      return {
        produtoId: item.produto.id,
        produtoNome: item.produto.nome,
        precoUnitario: Math.round(precoUnitario * 100) / 100,
        quantidade: item.quantidade,
        modificadores: item.opcoesSelecionadas.map((o) => ({
          nome: o.opcao.nome,
          precoExtra: Number(o.opcao.precoExtra),
        })),
      };
    });

    const totalProdutos = itensData.reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0);
    const taxaFrete = dto.tipoEntrega === 'ENTREGA' ? Number(config?.taxaFrete ?? 0) : 0;
    const valorTotal = Math.round((totalProdutos + taxaFrete) * 100) / 100;

    const pedido = await this.prisma.pedido.create({
      data: {
        negocioId,
        sessionId,
        usuarioId,
        status: StatusPedido.PENDENTE,
        total: valorTotal,
        tipoEntrega: dto.tipoEntrega,
        taxaFrete: taxaFrete > 0 ? taxaFrete : undefined,
        observacao: dto.observacao,
        endereco: dto.enderecoEntrega ? JSON.parse(JSON.stringify(dto.enderecoEntrega)) : undefined,
        contato: dto.contato,
        agendadoPara: dto.agendadoPara ? new Date(dto.agendadoPara) : undefined,
        itens: { create: itensData },
        pagamentos: {
          create: {
            valor: valorTotal,
            metodo: dto.metodoPagamento,
            status:
              dto.metodoPagamento === MetodoPagamento.DINHEIRO
                ? StatusPagamento.APROVADO
                : StatusPagamento.PENDENTE,
          },
        },
      },
      include: { itens: true, pagamentos: true },
    });

    if (dto.metodoPagamento === MetodoPagamento.DINHEIRO) {
      await this.prisma.pedido.update({
        where: { id: pedido.id },
        data: { status: StatusPedido.CONFIRMADO },
      });
      pedido.status = StatusPedido.CONFIRMADO;
      await this.baixarEstoque(negocioId, pedido, usuarioId);
    }

    await this.prisma.carrinhoItem.deleteMany({ where: { carrinhoId: carrinho.id } });

    return this.prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { itens: true, pagamentos: true },
    });
  }

  async listarPorSession(slug: string, sessionId: string) {
    const negocioId = await this.resolveNegocioId(slug);
    return this.prisma.pedido.findMany({
      where: { negocioId, sessionId },
      orderBy: { criadoEm: 'desc' },
      include: { itens: true, pagamentos: true },
    });
  }

  async buscar(id: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: { itens: true, pagamentos: true },
    });
    if (!pedido) throw new NotFoundException('Pedido não encontrado');
    return pedido;
  }

  async listarPorNegocio(negocioId: string) {
    return this.prisma.pedido.findMany({
      where: { negocioId },
      orderBy: { criadoEm: 'desc' },
      include: { itens: true, pagamentos: true },
    });
  }

  async atualizarStatus(id: string, status: StatusPedido, usuarioId?: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: { itens: true },
    });
    if (!pedido) throw new NotFoundException('Pedido não encontrado');

    const statusFaturamento: StatusPedido[] = [
      StatusPedido.CONFIRMADO,
      StatusPedido.PREPARANDO,
      StatusPedido.PRONTO,
      StatusPedido.SAIU_PARA_ENTREGA,
      StatusPedido.ENTREGUE,
    ];

    const jaFaturou = statusFaturamento.includes(pedido.status);
    const vaiFaturar = statusFaturamento.includes(status);

    if (vaiFaturar && !jaFaturou) {
      await this.baixarEstoque(pedido.negocioId, pedido, usuarioId);
    }

    if (status === StatusPedido.CANCELADO && pedido.status !== StatusPedido.CANCELADO) {
      if (jaFaturou) {
        await this.estornarEstoque(pedido.negocioId, pedido, usuarioId);
      }
    }

    return this.prisma.pedido.update({
      where: { id },
      data: { status },
      include: { itens: true, pagamentos: true },
    });
  }
}
