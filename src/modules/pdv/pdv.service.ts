import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { EstoqueService } from '../estoque/estoque.service';
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
  ) {}

  async checkout(negocioId: string, dto: FinalizarPdvDto, usuarioId?: string) {
    if (!dto.itens.length) {
      throw new BadRequestException('Nenhum item na venda');
    }

    const produtos = await this.prisma.produto.findMany({
      where: {
        id: { in: dto.itens.map((i) => i.produtoId) },
        negocioId,
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
        where: { negocioId, produtoId: item.produtoId },
      });
      if (!estoqueItem || estoqueItem.quantidadeAtual < (item.quantidade ?? 1)) {
        throw new BadRequestException(`Estoque insuficiente para "${produto.nome}"`);
      }
    }

    const itensData = dto.itens.map((item) => {
      const produto = produtos.find((p) => p.id === item.produtoId)!;
      let precoUnitario = calcularPrecoFinal(produto);
      precoUnitario = aplicarDesconto(precoUnitario, item.desconto);
      return {
        produtoId: produto.id,
        produtoNome: produto.nome,
        precoUnitario: Math.round(precoUnitario * 100) / 100,
        quantidade: item.quantidade ?? 1,
      };
    });

    let total = itensData.reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0);
    total = aplicarDesconto(total, dto.descontoTotal);
    const valorTotal = Math.max(0, Math.round(total * 100) / 100);

    const pedido = await this.prisma.pedido.create({
      data: {
        negocioId,
        sessionId: `pdv-${negocioId}-${Date.now()}`,
        usuarioId,
        status: StatusPedido.CONFIRMADO,
        total: valorTotal,
        observacao: dto.observacao,
        agendadoPara: dto.agendadoPara ? new Date(dto.agendadoPara) : undefined,
        itens: { create: itensData },
        pagamentos: {
          create: {
            valor: valorTotal,
            metodo: dto.pagamento.metodo,
            status: StatusPagamento.APROVADO,
          },
        },
      },
      include: { itens: true, pagamentos: true },
    });

    for (const item of pedido.itens) {
      const produto = produtos.find((p) => p.id === item.produtoId);
      if (!produto?.controlaEstoque) continue;
      const estoqueItem = await this.prisma.estoqueItem.findFirst({
        where: { negocioId, produtoId: item.produtoId },
      });
      if (!estoqueItem) continue;
      await this.estoqueService.movimentar(
        negocioId,
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

    return pedido;
  }
}
