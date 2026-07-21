import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { EstoqueService } from '../estoque/estoque.service';
import { ImprimirService } from '../imprimir/imprimir.service';
import { CaixaService } from '../caixa/caixa.service';
import { ContasReceberService } from '../contas-receber/contas-receber.service';
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
    private caixaService: CaixaService,
    private contasReceberService: ContasReceberService,
  ) {}

  async checkout(negocioId: string, dto: FinalizarPdvDto, usuarioId?: string) {
    await this.caixaService.exigirCaixaAberto(negocioId, usuarioId);

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

    // Validação de estoque (fora da transação, apenas leitura)
    for (const item of dto.itens) {
      const produto = produtos.find((p) => p.id === item.produtoId)!;
      if (!produto.controlaEstoque || produto.vendaPorPeso) continue;
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

    const isCrediario = dto.pagamento.metodo === MetodoPagamento.CREDIARIO;

    if (isCrediario) {
      if (!dto.clienteId) throw new BadRequestException('Selecione um cliente para venda a prazo');
      if (!dto.dataVencimento) throw new BadRequestException('Informe a data de vencimento');
      const cliente = await this.prisma.cliente.findUnique({ where: { id: dto.clienteId } });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      if (Number(cliente.saldoDevedor) + valorTotal > Number(cliente.limiteCredito)) {
        throw new BadRequestException(
          `Cliente não tem limite de crédito suficiente. Saldo devedor atual: R$ ${Number(cliente.saldoDevedor).toFixed(2)}, Limite: R$ ${Number(cliente.limiteCredito).toFixed(2)}`
        );
      }
    }

    // TRANSAÇÃO: pedido + estoque + contas + caixa
    const pedido = await this.prisma.$transaction(async (tx) => {
      const p = await tx.pedido.create({
        data: {
          negocioId,
          sessionId: `pdv-${negocioId}-${Date.now()}`,
          usuarioId,
          status: StatusPedido.CONFIRMADO,
          total: valorTotal,
          tipoEntrega: dto.tipoEntrega ?? 'RETIRADA',
          endereco: dto.endereco ?? undefined,
          observacao: dto.observacao,
          agendadoPara: dto.agendadoPara ? new Date(dto.agendadoPara) : undefined,
          clienteId: dto.clienteId || undefined,
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
              status: isCrediario ? StatusPagamento.PENDENTE : StatusPagamento.APROVADO,
              ...(dto.pagamento.valorPago ? { dadosPagamento: { valorPago: dto.pagamento.valorPago } } : {}),
            },
          },
        },
        include: { itens: true, pagamentos: true },
      });

      // Movimentação de estoque dentro da transação
      for (const item of p.itens) {
        const produto = produtos.find((pr) => pr.id === item.produtoId);
        if (!produto?.controlaEstoque || produto.vendaPorPeso) continue;
        const ei = await tx.estoqueItem.findFirst({
          where: { negocioId: produto.negocioId, produtoId: item.produtoId },
        });
        if (!ei) continue;
        const qtd = Number(item.quantidade);
        const qtdAntes = Number(ei.quantidadeAtual);
        await tx.estoqueItem.update({
          where: { id: ei.id },
          data: { quantidadeAtual: { decrement: qtd } },
        });
        await tx.movimentacaoEstoque.create({
          data: {
            negocioId: produto.negocioId,
            estoqueItemId: ei.id,
            usuarioId: usuarioId ?? null,
            tipo: TipoMovimentacao.SAIDA_VENDA,
            quantidade: qtd,
            quantidadeAntes: qtdAntes,
            quantidadeApos: qtdAntes - qtd,
            motivo: `PDV #${p.id.slice(0, 8)}`,
            referencia: p.id,
          },
        });
      }

      // Crediário: cria conta a receber e atualiza saldo devedor
      if (isCrediario && dto.clienteId && dto.dataVencimento) {
        await tx.contaReceber.create({
          data: {
            clienteId: dto.clienteId,
            negocioId,
            pedidoId: p.id,
            valorTotal,
            dataVencimento: new Date(dto.dataVencimento),
          },
        });
        await tx.cliente.update({
          where: { id: dto.clienteId },
          data: { saldoDevedor: { increment: valorTotal } },
        });
      }

      // Não registra pagamento no caixa dentro da transação (caixaService usa prisma próprio)
      return p;
    });

    this.imprimirService.imprimirComanda(negocioId, pedido.id).catch(() => {});

    if (!isCrediario) {
      await this.caixaService.registrarPagamento(negocioId, pedido.id, valorTotal, dto.pagamento.metodo, usuarioId);
    }

    return pedido;
  }
}
