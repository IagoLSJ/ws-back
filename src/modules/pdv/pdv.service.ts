import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { EstoqueService } from '../estoque/estoque.service';
import { ImprimirService } from '../imprimir/imprimir.service';
import { FinalizarPdvDto } from './dto/finalizar-pdv.dto';
import { StatusPedido, MetodoPagamento, StatusPagamento, TipoMovimentacao } from '@prisma/client';
import { calcularPrecoFinal } from '../../common/utils/preco';

function aplicarDesconto(
  valor: number,
  desconto: { tipo: string; valor: number } | undefined,
): number {
  if (!desconto || desconto.valor <= 0) return valor;
  if (desconto.tipo === 'FIXO') return Math.max(0, valor - desconto.valor);
  if (desconto.tipo === 'PERCENTUAL') return Math.max(0, valor - (valor * desconto.valor) / 100);
  return valor;
}

@Injectable()
export class PdvService {
  constructor(
    private prisma: PrismaService,
    private estoqueService: EstoqueService,
    private imprimirService: ImprimirService,
  ) {}

  async checkout(negocioId: string, dto: FinalizarPdvDto, usuarioId?: string) {
    if (!dto.itens.length) {
      throw new BadRequestException('Nenhum item na venda');
    }

    const produtos = await this.prisma.produto.findMany({
      where: {
        id: { in: dto.itens.map((i) => i.produtoId) },
        status: 'ATIVO',
      },
    });

    if (produtos.length !== dto.itens.length) {
      throw new BadRequestException('Alguns produtos não encontrados ou inativos');
    }

    for (const item of dto.itens) {
      const produto = produtos.find((p) => p.id === item.produtoId)!;
      if (!produto.controlaEstoque) continue;
      const estoqueItem = await this.prisma.estoqueItem.findFirst({
        where: { negocioId: produto.negocioId, produtoId: item.produtoId },
      });
      if (!estoqueItem || estoqueItem.quantidadeAtual < (item.quantidade ?? 1)) {
        throw new BadRequestException(`Estoque insuficiente para "${produto.nome}"`);
      }
    }

    const itensData = await Promise.all(dto.itens.map(async (item) => {
      const produto = produtos.find((p) => p.id === item.produtoId)!;
      let precoUnitario = calcularPrecoFinal(produto);

      let modificadores: any[] = [];
      if (item.opcoesSelecionadas?.length) {
        const opcoes = await this.prisma.opcaoModificador.findMany({
          where: { id: { in: item.opcoesSelecionadas } },
          include: { grupo: { select: { nome: true } } },
        });
        modificadores = opcoes.map((o) => ({
          nome: o.nome,
          precoExtra: Number(o.precoExtra),
        }));
        precoUnitario += modificadores.reduce((s, m) => s + m.precoExtra, 0);
      }

      precoUnitario = aplicarDesconto(precoUnitario, item.desconto);
      return {
        produtoId: produto.id,
        produtoNome: produto.nome,
        precoUnitario: Math.round(precoUnitario * 100) / 100,
        quantidade: item.quantidade ?? 1,
        modificadores: modificadores.length ? modificadores : undefined,
      };
    }));

    let total = itensData.reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0);
    total = aplicarDesconto(total, dto.descontoTotal);
    const valorTotal = Math.max(0, Math.round(total * 100) / 100);

    const troco = dto.pagamento.valorPago && dto.pagamento.valorPago > valorTotal
      ? Math.round((dto.pagamento.valorPago - valorTotal) * 100) / 100
      : undefined;

    const pedido = await this.prisma.pedido.create({
      data: {
        negocioId,
        sessionId: `pdv-${negocioId}-${Date.now()}`,
        usuarioId,
        status: StatusPedido.CONFIRMADO,
        total: valorTotal,
        observacao: dto.observacao,
        agendadoPara: dto.agendadoPara ? new Date(dto.agendadoPara) : undefined,
        clienteCpf: dto.clienteCpf || undefined,
        clienteNome: dto.clienteNome || undefined,
        troco: troco || undefined,
        itens: { create: itensData.map(i => ({
          produtoId: i.produtoId,
          produtoNome: i.produtoNome,
          precoUnitario: i.precoUnitario,
          quantidade: i.quantidade,
          modificadores: i.modificadores ?? undefined,
        })) },
        pagamentos: {
          create: {
            valor: valorTotal,
            metodo: dto.pagamento.metodo,
            status: StatusPagamento.APROVADO,
            ...(dto.pagamento.valorPago ? { dadosPagamento: { valorPago: dto.pagamento.valorPago } } : {}),
          },
        },
      },
      include: { itens: true, pagamentos: true },
    });

    for (const item of pedido.itens) {
      const produto = produtos.find((p) => p.id === item.produtoId);
      if (!produto?.controlaEstoque) continue;
      const estoqueItem = await this.prisma.estoqueItem.findFirst({
        where: { negocioId: produto.negocioId, produtoId: item.produtoId },
      });
      if (!estoqueItem) continue;
      await this.estoqueService.movimentar(
        produto.negocioId,
        estoqueItem.id,
        {
          tipo: TipoMovimentacao.SAIDA_VENDA,
          quantidade: item.quantidade,
          motivo: `PDV #${pedido.id.slice(0, 8)}`,
          referencia: pedido.id,
        },
        usuarioId,
      );
    }

    this.imprimirService.imprimirComanda(negocioId, pedido.id).catch(() => {});

    return pedido;
  }
}
