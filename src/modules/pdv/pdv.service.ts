import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { EstoqueService } from '../estoque/estoque.service';
import { ImprimirService } from '../imprimir/imprimir.service';
import { CaixaService } from '../caixa/caixa.service';
import { ContasReceberService } from '../contas-receber/contas-receber.service';
import { FiscalService } from '../fiscal/fiscal.service';
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
  private readonly logger = new Logger(PdvService.name);
  constructor(
    private prisma: PrismaService,
    private estoqueService: EstoqueService,
    private imprimirService: ImprimirService,
    private caixaService: CaixaService,
    private contasReceberService: ContasReceberService,
    private fiscalService: FiscalService,
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

    // Verifica caixa aberto dentro da transação
    const [caixa] = await this.prisma.$transaction([
      this.prisma.caixa.findFirst({
        where: { negocioId, status: 'ABERTO', ...(usuarioId ? { operadorId: usuarioId } : {}) },
      }),
    ]);
    if (!caixa) throw new BadRequestException('Nenhum caixa aberto encontrado');

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

    const sessionId = `pdv-${negocioId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // TRANSAÇÃO ÚNICA: pedido + estoque + caixa
    const pedido = await this.prisma.$transaction(async (tx) => {
      const p = await tx.pedido.create({
        data: {
          negocioId,
          sessionId,
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
          where: { negocioId, produtoId: item.produtoId },
        });
        if (!ei || Number(ei.quantidadeAtual) < Number(item.quantidade)) {
          throw new BadRequestException(`Estoque insuficiente para "${produto!.nome}"`);
        }
        const qtd = Number(item.quantidade);
        const qtdAntes = Number(ei.quantidadeAtual);
        await tx.estoqueItem.update({
          where: { id: ei.id },
          data: { quantidadeAtual: { decrement: qtd } },
        });
        await tx.movimentacaoEstoque.create({
          data: {
            negocioId,
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

      // Registro no caixa DENTRO da transação
      if (!isCrediario) {
        await tx.caixaMovimento.create({
          data: {
            caixaId: caixa.id,
            tipo: 'PAGAMENTO' as any,
            valor: valorTotal,
            formaPagamento: dto.pagamento.metodo,
            pedidoId: p.id,
            descricao: `Venda #${p.id.slice(0, 8)}`,
          },
        });
      }

      // Crediário: cria conta a receber
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

      return p;
    });

    // Fire-and-forget: impressão e NF-e (fora da transação)
    this.imprimirService.imprimirComanda(negocioId, pedido.id).catch((err) => {
      this.logger.error(`Erro ao imprimir comanda para pedido ${pedido.id}: ${err}`);
    });

    this.fiscalService.emitirNFe(negocioId, pedido.id).catch((err) => {
      this.logger.error(`Erro ao emitir NF-e para pedido ${pedido.id}: ${err}`);
    });

    return pedido;
  }
}
