import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { CheckoutDto } from './dto/checkout.dto';
import { EstoqueService } from '../estoque/estoque.service';
import { ImprimirService } from '../imprimir/imprimir.service';
import { CaixaService } from '../caixa/caixa.service';
import { StatusPedido, MetodoPagamento, StatusPagamento, TipoMovimentacao, TipoEntrega } from '@prisma/client';
import { calcularPrecoFinal } from '../../common/utils/preco';

const TRANSICOES_VALIDAS: Record<StatusPedido, StatusPedido[]> = {
  [StatusPedido.PENDENTE]: [StatusPedido.CONFIRMADO, StatusPedido.CANCELADO],
  [StatusPedido.CONFIRMADO]: [StatusPedido.PREPARANDO, StatusPedido.CANCELADO],
  [StatusPedido.PREPARANDO]: [StatusPedido.PRONTO, StatusPedido.CANCELADO],
  [StatusPedido.PRONTO]: [StatusPedido.SAIU_PARA_ENTREGA, StatusPedido.ENTREGUE, StatusPedido.CANCELADO],
  [StatusPedido.SAIU_PARA_ENTREGA]: [StatusPedido.ENTREGUE, StatusPedido.CANCELADO],
  [StatusPedido.ENTREGUE]: [],
  [StatusPedido.CANCELADO]: [],
};

@Injectable()
export class PedidosService {
  private readonly logger = new Logger(PedidosService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private estoqueService: EstoqueService,
    private imprimirService: ImprimirService,
    private caixaService: CaixaService,
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

  private verificarAberto(horario: { dias?: { abertura: string; fechamento: string; fechado: boolean }[] } | null): boolean {
    return this.verificarAbertoEm(horario, new Date());
  }

  private verificarAbertoEm(horario: { dias?: { abertura: string; fechamento: string; fechado: boolean }[] } | null, data: Date): boolean {
    if (!horario?.dias?.length) return true;
    const hoje = horario.dias[data.getDay()];
    if (!hoje || hoje.fechado) return false;
    const minutos = data.getHours() * 60 + data.getMinutes();
    const [hInicio, mInicio] = (hoje.abertura || '00:00').split(':').map(Number);
    const [hFim, mFim] = (hoje.fechamento || '23:59').split(':').map(Number);
    return minutos >= (hInicio * 60 + mInicio) && minutos <= (hFim * 60 + mFim);
  }

  private async baixarEstoque(negocioId: string, pedido: any, usuarioId?: string) {
    const tx = this.prisma;
    await this.baixarEstoqueTx(tx as any, negocioId, pedido, usuarioId);
  }

  private async baixarEstoqueTx(tx: any, negocioId: string, pedido: any, usuarioId?: string) {
    for (const item of pedido.itens) {
      const estoqueItem = await tx.estoqueItem.findFirst({
        where: { negocioId, produtoId: item.produtoId },
        include: { produto: { select: { controlaEstoque: true, vendaPorPeso: true } } },
      });
      if (!estoqueItem || !estoqueItem.produto?.controlaEstoque || estoqueItem.produto.vendaPorPeso) continue;

      const jaBaixado = await tx.movimentacaoEstoque.findFirst({
        where: {
          estoqueItemId: estoqueItem.id,
          tipo: TipoMovimentacao.SAIDA_VENDA,
          referencia: pedido.id,
        },
      });
      if (jaBaixado) continue;

      const qtd = Number(item.quantidade);
      const qtdAntes = Number(estoqueItem.quantidadeAtual);
      await tx.estoqueItem.update({
        where: { id: estoqueItem.id },
        data: { quantidadeAtual: { decrement: qtd } },
      });
      await tx.movimentacaoEstoque.create({
        data: {
          negocioId,
          estoqueItemId: estoqueItem.id,
          usuarioId: usuarioId ?? null,
          tipo: TipoMovimentacao.SAIDA_VENDA,
          quantidade: qtd,
          quantidadeAntes: qtdAntes,
          quantidadeApos: qtdAntes - qtd,
          motivo: `Pedido #${pedido.id.slice(0, 8)}`,
          referencia: pedido.id,
        },
      });
    }
  }

  private async estornarEstoque(negocioId: string, pedido: any, usuarioId?: string) {
    const tx = this.prisma;
    await this.estornarEstoqueTx(tx as any, negocioId, pedido, usuarioId);
  }

  private async estornarEstoqueTx(tx: any, negocioId: string, pedido: any, usuarioId?: string) {
    for (const item of pedido.itens) {
      const mov = await tx.movimentacaoEstoque.findFirst({
        where: {
          estoqueItem: { negocioId, produtoId: item.produtoId },
          tipo: TipoMovimentacao.SAIDA_VENDA,
          referencia: pedido.id,
        },
        include: { estoqueItem: { select: { id: true, quantidadeAtual: true } } },
      });
      if (!mov) continue;

      const qtd = Number(item.quantidade);
      const qtdAntes = Number(mov.estoqueItem.quantidadeAtual);
      await tx.estoqueItem.update({
        where: { id: mov.estoqueItemId },
        data: { quantidadeAtual: { increment: qtd } },
      });
      await tx.movimentacaoEstoque.create({
        data: {
          negocioId,
          estoqueItemId: mov.estoqueItemId,
          usuarioId: usuarioId ?? null,
          tipo: TipoMovimentacao.ENTRADA,
          quantidade: qtd,
          quantidadeAntes: qtdAntes,
          quantidadeApos: qtdAntes + qtd,
          motivo: `Estorno pedido #${pedido.id.slice(0, 8)}`,
          referencia: pedido.id,
        },
      });
    }
  }

  async checkout(slug: string, sessionId: string, dto: CheckoutDto, usuarioId?: string) {
    const negocioId = await this.resolveNegocioId(slug);

    // Idempotency: se já processou este checkout, retorna pedido existente
    if (dto.idempotencyKey) {
      const existente = await this.redis.get(`checkout:${dto.idempotencyKey}`);
      if (existente) {
        return this.buscar(existente);
      }
    }

    const config = await this.prisma.configuracaoNegocio.findUnique({ where: { negocioId } });

    // Verifica horário de funcionamento
    const aberto = this.verificarAberto(config?.horarioFuncionamento as any);
    if (!aberto) {
      if (!dto.agendadoPara) {
        throw new BadRequestException(
          'O estabelecimento está fechado agora. Você pode agendar o pedido para entrega futura durante o horário de funcionamento.'
        );
      }
      const agendado = new Date(dto.agendadoPara);
      const agora = new Date();
      if (agendado <= agora) {
        throw new BadRequestException('Data agendada deve ser no futuro, durante o horário de funcionamento.');
      }
      // Verifica se o horário agendado está dentro do horário de funcionamento
      if (!this.verificarAbertoEm(config?.horarioFuncionamento as any, agendado)) {
        throw new BadRequestException('O horário agendado está fora do horário de funcionamento.');
      }
    }

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
                vendaPorPeso: true,
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

    const produtosComGrupos = await this.prisma.produto.findMany({
      where: { id: { in: carrinho.itens.map((i) => i.produto.id) }, negocioId },
      include: {
        gruposModificadores: {
          where: { obrigatorio: true },
          include: { opcoes: true },
        },
      },
    });
    for (const item of carrinho.itens) {
      const prod = produtosComGrupos.find((p) => p.id === item.produto.id);
      if (!prod) continue;
      for (const grupo of prod.gruposModificadores) {
        const hasOption = item.opcoesSelecionadas.some((o) =>
          grupo.opcoes.some((op) => op.id === o.opcaoId),
        );
        if (!hasOption) {
          throw new BadRequestException(
            `"${item.produto.nome}" requer seleção obrigatória em "${grupo.nome}"`,
          );
        }
      }
    }

    for (const item of carrinho.itens) {
      if (!item.produto.controlaEstoque || item.produto.vendaPorPeso) continue;
      const estoqueItem = await this.prisma.estoqueItem.findFirst({
        where: { negocioId, produtoId: item.produto.id },
      });
      if (!estoqueItem || estoqueItem.quantidadeAtual < Number(item.quantidade)) {
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

    const totalProdutos = itensData.reduce((acc, i) => acc + i.precoUnitario * Number(i.quantidade), 0);

    let mesaData: { mesaId?: string; mesaNumero?: number } = {};
    if (dto.tipoEntrega === 'MESA' && !dto.mesaId) {
      throw new BadRequestException('mesaId é obrigatório para tipoEntrega MESA');
    }
    if (dto.mesaId) {
      const mesa = await this.prisma.mesa.findFirst({
        where: { id: dto.mesaId, negocioId, ativa: true },
      });
      if (!mesa) throw new BadRequestException('Mesa inválida ou inativa');
      mesaData = { mesaId: mesa.id, mesaNumero: mesa.numero };
    }

    let taxaFrete = 0;
    if (dto.tipoEntrega === 'ENTREGA') {
      const bairro = dto.enderecoEntrega?.bairro;
      if (bairro) {
        const taxaBairro = await this.prisma.taxaFreteBairro.findFirst({
          where: { negocioId, bairro: { equals: bairro, mode: 'insensitive' }, ativo: true },
        });
        if (taxaBairro) {
          taxaFrete = Number(taxaBairro.taxa);
        }
      }
      if (taxaFrete === 0) {
        taxaFrete = Number(config?.taxaFrete ?? 0);
      }
    }
    const valorTotal = Math.round((totalProdutos + taxaFrete) * 100) / 100;

    const pedido = await this.prisma.pedido.create({
      data: {
        negocioId,
        sessionId,
        usuarioId,
        status: StatusPedido.PENDENTE,
        total: valorTotal,
        tipoEntrega: mesaData.mesaId ? TipoEntrega.MESA : dto.tipoEntrega as TipoEntrega,
        taxaFrete: mesaData.mesaId ? 0 : (taxaFrete > 0 ? taxaFrete : undefined),
        observacao: dto.observacao,
        endereco: mesaData.mesaId ? undefined : (dto.enderecoEntrega ? JSON.parse(JSON.stringify(dto.enderecoEntrega)) : undefined),
        contato: dto.contato,
        agendadoPara: dto.agendadoPara
          ? (() => {
              const data = new Date(dto.agendadoPara);
              if (isNaN(data.getTime())) {
                throw new BadRequestException('Data de agendamento inválida');
              }
              if (data <= new Date()) {
                throw new BadRequestException('Agendamento deve ser no futuro');
              }
              return data;
            })()
          : undefined,
        ...mesaData,
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
      await this.caixaService.exigirCaixaAberto(negocioId, usuarioId);
      await this.prisma.pedido.update({
        where: { id: pedido.id },
        data: { status: StatusPedido.CONFIRMADO },
      });
      pedido.status = StatusPedido.CONFIRMADO;
      await this.baixarEstoque(negocioId, pedido, usuarioId);
      await this.caixaService.registrarPagamento(negocioId, pedido.id, valorTotal, 'DINHEIRO', usuarioId);
    }

    this.imprimirService.imprimirComanda(negocioId, pedido.id).catch((err) => {
      this.logger.error(`Erro ao imprimir comanda automaticamente para pedido ${pedido.id}: ${err}`);
    });

    await this.prisma.carrinhoItem.deleteMany({ where: { carrinhoId: carrinho.id } });

    // Salva idempotency key
    if (dto.idempotencyKey) {
      await this.redis.setex(`checkout:${dto.idempotencyKey}`, 86400, pedido.id);
    }

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

  async buscar(id: string, sessionId?: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: { itens: true, pagamentos: true },
    });
    if (!pedido) throw new NotFoundException('Pedido não encontrado');
    if (sessionId && pedido.sessionId !== sessionId) {
      throw new NotFoundException('Pedido não encontrado');
    }
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

    const permitidas = TRANSICOES_VALIDAS[pedido.status];
    if (!permitidas.includes(status)) {
      throw new BadRequestException(
        `Transição inválida: ${pedido.status} → ${status}`,
      );
    }

    const statusFaturamento: StatusPedido[] = [
      StatusPedido.CONFIRMADO,
      StatusPedido.PREPARANDO,
      StatusPedido.PRONTO,
      StatusPedido.SAIU_PARA_ENTREGA,
      StatusPedido.ENTREGUE,
    ];

    const jaFaturou = statusFaturamento.includes(pedido.status);
    const vaiFaturar = statusFaturamento.includes(status);

    return this.prisma.$transaction(async (tx) => {
      if (vaiFaturar && !jaFaturou) {
        await this.baixarEstoqueTx(tx, pedido.negocioId, pedido, usuarioId);
      }

      if (status === StatusPedido.CANCELADO && pedido.status !== StatusPedido.CANCELADO) {
        if (jaFaturou) {
          await this.estornarEstoqueTx(tx, pedido.negocioId, pedido, usuarioId);
        }
      }

      return tx.pedido.update({
        where: { id },
        data: { status },
        include: { itens: true, pagamentos: true },
      });
    });
  }

  async confirmarPagamento(id: string, usuarioId?: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: {
        itens: true,
        pagamentos: true,
      },
    });
    if (!pedido) throw new NotFoundException('Pedido não encontrado');

    const pagamentoPendente = pedido.pagamentos.find(
      (p) => p.status === StatusPagamento.PENDENTE,
    );
    if (!pagamentoPendente) {
      throw new BadRequestException('Nenhum pagamento pendente para confirmar');
    }

    await this.caixaService.exigirCaixaAberto(pedido.negocioId, usuarioId);

    await this.prisma.$transaction(async (tx) => {
      await tx.pagamento.update({
        where: { id: pagamentoPendente.id },
        data: { status: StatusPagamento.APROVADO },
      });

      if (pedido.status === StatusPedido.PENDENTE) {
        await tx.pedido.update({
          where: { id },
          data: { status: StatusPedido.CONFIRMADO },
        });
      }

      if (!pedido.itens.length) return;

      const estoqueItens = await tx.estoqueItem.findMany({
        where: {
          negocioId: pedido.negocioId,
          produtoId: { in: pedido.itens.map((i) => i.produtoId) },
        },
        include: { produto: { select: { controlaEstoque: true, vendaPorPeso: true } } },
      });

      for (const item of pedido.itens) {
        const estoqueItem = estoqueItens.find((e) => e.produtoId === item.produtoId);
        if (!estoqueItem || !estoqueItem.produto?.controlaEstoque || estoqueItem.produto.vendaPorPeso) continue;

        const jaBaixado = await tx.movimentacaoEstoque.findFirst({
          where: {
            estoqueItemId: estoqueItem.id,
            tipo: TipoMovimentacao.SAIDA_VENDA,
            referencia: pedido.id,
          },
        });
        if (jaBaixado) continue;

        await tx.estoqueItem.update({
          where: { id: estoqueItem.id },
          data: { quantidadeAtual: { decrement: Number(item.quantidade) } },
        });

        await tx.movimentacaoEstoque.create({
          data: {
            negocioId: pedido.negocioId,
            estoqueItemId: estoqueItem.id,
            usuarioId,
            tipo: TipoMovimentacao.SAIDA_VENDA,
            quantidade: Number(item.quantidade),
            quantidadeAntes: estoqueItem.quantidadeAtual,
            quantidadeApos: estoqueItem.quantidadeAtual - Number(item.quantidade),
            motivo: `Confirmação pagamento #${pedido.id.slice(0, 8)}`,
            referencia: pedido.id,
          },
        });
      }
    });

    await this.caixaService.registrarPagamento(
      pedido.negocioId,
      pedido.id,
      Number(pedido.total),
      pagamentoPendente.metodo,
      usuarioId,
    );

    return this.prisma.pedido.findUnique({
      where: { id },
      include: { itens: true, pagamentos: true },
    });
  }
}
