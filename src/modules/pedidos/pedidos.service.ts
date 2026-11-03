import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { CheckoutDto } from './dto/checkout.dto';
import { EstoqueService } from '../estoque/estoque.service';
import { ImprimirService } from '../imprimir/imprimir.service';
import { CaixaService } from '../caixa/caixa.service';
import { StatusPedido, MetodoPagamento, StatusPagamento, TipoMovimentacao, TipoEntrega, TipoMovimentoCaixa } from '@prisma/client';
import { verificarAbertoEm } from '../../common/utils/horario';
import { calcularPrecoFinal } from '../../common/utils/preco';
import { converterPeso } from '../../common/utils/unidade';
import { calcularTaxaCartao } from '../../common/utils/taxa-cartao';

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
    return verificarAbertoEm(horario as any, data);
  }

  /**
   * Monta os itens do pedido respeitando o preço fechado dos combos.
   * Itens de um mesmo combo (comboRef) são rateados proporcionalmente ao preço
   * individual, de forma que a soma deles seja exatamente o preço do combo.
   */
  private montarItensPedido(carrinhoItens: any[]): { itensData: any[]; totalProdutos: number } {
    const normais = carrinhoItens.filter((i) => !i.comboRef);
    const grupos = new Map<string, any[]>();
    for (const item of carrinhoItens) {
      if (item.comboRef) {
        if (!grupos.has(item.comboRef)) grupos.set(item.comboRef, []);
        grupos.get(item.comboRef)!.push(item);
      }
    }

    const itensData: any[] = [];
    let totalProdutos = 0;

    const precoNormal = (item: any) =>
      calcularPrecoFinal(item.produto) +
      item.opcoesSelecionadas.reduce((s: number, o: any) => s + Number(o.opcao.precoExtra), 0);

    const montarItem = (item: any, precoUnitario: number) => ({
      produtoId: item.produto.id,
      produtoNome: item.produto.nome,
      precoUnitario: Math.round(precoUnitario * 100) / 100,
      quantidade: item.quantidade,
      modificadores: item.opcoesSelecionadas.map((o: any) => ({
        nome: o.opcao.nome,
        precoExtra: Number(o.opcao.precoExtra),
      })),
    });

    for (const item of normais) {
      const precoUnitario = precoNormal(item);
      itensData.push(montarItem(item, precoUnitario));
      totalProdutos += precoUnitario * Number(item.quantidade);
    }

    for (const itens of grupos.values()) {
      const comboPreco = Number(itens[0].comboPreco ?? 0);
      const pesos = itens.map((i) => ({ item: i, peso: precoNormal(i) * Number(i.quantidade) }));
      const somaPesos = pesos.reduce((s, p) => s + p.peso, 0);
      let alocada = 0;

      pesos.forEach((p, idx) => {
        const ultimo = idx === pesos.length - 1;
        let total = somaPesos > 0 ? (comboPreco * p.peso) / somaPesos : comboPreco / pesos.length;
        total = Math.max(0, total);
        if (ultimo) total = comboPreco - alocada;
        else total = Math.round(total * 100) / 100;
        alocada += total;

        const precoUnitario = Number(p.item.quantidade) > 0 ? total / Number(p.item.quantidade) : 0;
        itensData.push(montarItem(p.item, precoUnitario));
      });

      totalProdutos += comboPreco;
    }

    return { itensData, totalProdutos: Math.round(totalProdutos * 100) / 100 };
  }

  private async baixarEstoqueTx(tx: any, negocioId: string, pedido: any, usuarioId?: string) {
    const produtoIds = [...new Set(pedido.itens.map((i: any) => i.produtoId))];
    if (!produtoIds.length) return;

    const estoqueItens = await tx.estoqueItem.findMany({
      where: { negocioId, produtoId: { in: produtoIds } },
      include: { produto: { select: { controlaEstoque: true, vendaPorPeso: true } } },
    });
    if (!estoqueItens.length) {
      await this.redis.del(`catalog:v2:${negocioId}:products`).catch(() => {});
      return;
    }

    const jaBaixados = await tx.movimentacaoEstoque.findMany({
      where: {
        estoqueItemId: { in: estoqueItens.map((e: any) => e.id) },
        tipo: TipoMovimentacao.SAIDA_VENDA,
        referencia: pedido.id,
      },
      select: { estoqueItemId: true },
    });
    const jaBaixadoSet = new Set(jaBaixados.map((m: any) => m.estoqueItemId));

    const updates: Promise<any>[] = [];
    const movimentacoes: any[] = [];

    for (const item of pedido.itens) {
      const estoqueItem = estoqueItens.find((e: any) => e.produtoId === item.produtoId);
      if (!estoqueItem || !estoqueItem.produto?.controlaEstoque) continue;
      if (jaBaixadoSet.has(estoqueItem.id)) continue;

      const qtd = estoqueItem.produto.vendaPorPeso
        ? converterPeso(Number(item.quantidade), 'kg', estoqueItem.unidade)
        : Number(item.quantidade);
      const qtdAntes = Number(estoqueItem.quantidadeAtual);

      updates.push(
        tx.estoqueItem.update({
          where: { id: estoqueItem.id },
          data: { quantidadeAtual: { decrement: qtd } },
        }),
      );
      movimentacoes.push({
        negocioId,
        estoqueItemId: estoqueItem.id,
        usuarioId: usuarioId ?? null,
        tipo: TipoMovimentacao.SAIDA_VENDA,
        quantidade: qtd,
        quantidadeAntes: qtdAntes,
        quantidadeApos: qtdAntes - qtd,
        motivo: `Pedido #${pedido.id.slice(0, 8)}`,
        referencia: pedido.id,
      });
    }

    if (updates.length) await Promise.all(updates);
    if (movimentacoes.length) await tx.movimentacaoEstoque.createMany({ data: movimentacoes });

    await this.redis.del(`catalog:v2:${negocioId}:products`).catch(() => {});
  }

  private async estornarEstoqueTx(tx: any, negocioId: string, pedido: any, usuarioId?: string) {
    const movsSaida = await tx.movimentacaoEstoque.findMany({
      where: {
        estoqueItem: { negocioId },
        tipo: TipoMovimentacao.SAIDA_VENDA,
        referencia: pedido.id,
      },
      include: {
        estoqueItem: {
          select: {
            id: true,
            produtoId: true,
            quantidadeAtual: true,
            unidade: true,
            produto: { select: { vendaPorPeso: true } },
          },
        },
      },
    });
    if (!movsSaida.length) return;

    const movPorProduto = new Map<string, any>();
    for (const mov of movsSaida) {
      if (mov.estoqueItem?.produtoId) movPorProduto.set(mov.estoqueItem.produtoId, mov);
    }

    const updates: Promise<any>[] = [];
    const entradas: any[] = [];

    for (const item of pedido.itens) {
      const mov = movPorProduto.get(item.produtoId);
      if (!mov) continue;

      const qtd = mov.estoqueItem.produto?.vendaPorPeso
        ? converterPeso(Number(item.quantidade), 'kg', mov.estoqueItem.unidade)
        : Number(item.quantidade);
      const qtdAntes = Number(mov.estoqueItem.quantidadeAtual);

      updates.push(
        tx.estoqueItem.update({
          where: { id: mov.estoqueItemId },
          data: { quantidadeAtual: { increment: qtd } },
        }),
      );
      entradas.push({
        negocioId,
        estoqueItemId: mov.estoqueItemId,
        usuarioId: usuarioId ?? null,
        tipo: TipoMovimentacao.ENTRADA,
        quantidade: qtd,
        quantidadeAntes: qtdAntes,
        quantidadeApos: qtdAntes + qtd,
        motivo: `Estorno pedido #${pedido.id.slice(0, 8)}`,
        referencia: pedido.id,
      });
    }

    if (updates.length) await Promise.all(updates);
    if (entradas.length) await tx.movimentacaoEstoque.createMany({ data: entradas });

    await this.redis.del(`catalog:v2:${negocioId}:products`).catch(() => {});
  }

  async checkout(slug: string, sessionId: string, dto: CheckoutDto, usuarioId?: string) {
    const negocioId = await this.resolveNegocioId(slug);

    // Idempotency: se já processou este checkout, retorna pedido existente
    if (dto.idempotencyKey) {
      const existente = await this.redis.get(`checkout:${dto.idempotencyKey}`);
      if (existente) {
        return this.buscar(existente);
      }
      const findPedido = (this.prisma.pedido as any).findFirst;
      if (typeof findPedido === 'function') {
        const persistido = await findPedido.call(this.prisma.pedido, {
          where: { negocioId, idempotencyKey: dto.idempotencyKey },
          include: { itens: true, pagamentos: true },
        });
        if (persistido) return persistido;
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
      if (item.comboRef) continue; // combo é bundle fechado, sem seleção de modificadores
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

    const itensComEstoque = carrinho.itens.filter((i) => i.produto.controlaEstoque);
    if (itensComEstoque.length) {
      const estoqueItens = await this.prisma.estoqueItem.findMany({
        where: {
          negocioId,
          produtoId: { in: itensComEstoque.map((i) => i.produto.id) },
        },
      });
      for (const item of itensComEstoque) {
        const estoqueItem = estoqueItens.find((e) => e.produtoId === item.produto.id);
        const qtd = item.produto.vendaPorPeso
          ? converterPeso(Number(item.quantidade), 'kg', estoqueItem?.unidade)
          : Number(item.quantidade);
        if (!estoqueItem || Number(estoqueItem.quantidadeAtual) < qtd) {
          throw new BadRequestException(`Estoque insuficiente para "${item.produto.nome}"`);
        }
      }
    }

    const { itensData, totalProdutos } = this.montarItensPedido(carrinho.itens);

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
    let valorTotal = Math.round((totalProdutos + taxaFrete) * 100) / 100;

    // Taxa de cartão (repasse): crédito e débito
    let taxaCartao = 0;
    const ehCartao =
      dto.metodoPagamento === MetodoPagamento.CARTAO_CREDITO ||
      dto.metodoPagamento === MetodoPagamento.CARTAO_DEBITO;
    if (ehCartao) {
      const faixas = Array.isArray(config?.taxaCartaoFaixas)
        ? (config.taxaCartaoFaixas as { ate: number; valor: number }[])
        : [];
      taxaCartao = calcularTaxaCartao(valorTotal, faixas);
      valorTotal = Math.round((valorTotal + taxaCartao) * 100) / 100;
    }

    const troco = dto.metodoPagamento === MetodoPagamento.DINHEIRO && dto.trocoPara && dto.trocoPara > valorTotal
      ? Math.round((dto.trocoPara - valorTotal) * 100) / 100
      : undefined;

    let pedido: any;

    await this.prisma.$transaction(async (tx) => {
      pedido = await tx.pedido.create({
        data: {
          negocioId,
          sessionId,
          usuarioId,
          status: StatusPedido.PENDENTE,
          total: valorTotal,
          tipoEntrega: dto.tipoEntrega,
          taxaFrete: dto.tipoEntrega === TipoEntrega.MESA ? 0 : (taxaFrete > 0 ? taxaFrete : undefined),
          observacao: dto.observacao,
          endereco: dto.tipoEntrega === TipoEntrega.MESA ? undefined : (dto.enderecoEntrega ? dto.enderecoEntrega as any : undefined),
          contato: dto.contato,
          troco: troco || undefined,
          taxaCartao: taxaCartao || undefined,
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
          idempotencyKey: dto.idempotencyKey || undefined,
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

      // Para DINHEIRO: baixa estoque e confirma já
      if (dto.metodoPagamento === MetodoPagamento.DINHEIRO) {
        await tx.pedido.update({
          where: { id: pedido.id },
          data: { status: StatusPedido.CONFIRMADO },
        });
        pedido.status = StatusPedido.CONFIRMADO;
        await this.baixarEstoqueTx(tx as any, negocioId, pedido, usuarioId);
      }

      await tx.carrinhoItem.deleteMany({ where: { carrinhoId: carrinho.id } });

      // Salva idempotency key dentro da transação
      if (dto.idempotencyKey) {
        // A idempotency é salva no Redis (fora da tx), mas só após a tx
      }
    });

    // Idempotency: salva no Redis após transação bem-sucedida
    if (dto.idempotencyKey && pedido) {
      await this.redis.setex(`checkout:${dto.idempotencyKey}`, 86400, pedido.id).catch(() => {});
    }

    // Imprime comanda só para pagamentos confirmados
    if (dto.metodoPagamento === MetodoPagamento.DINHEIRO) {
      this.imprimirService.imprimirComanda(negocioId, pedido.id).catch((err) => {
        this.logger.error(`Erro ao imprimir comanda para pedido ${pedido.id}: ${err}`);
      });
    }

    // Registra no caixa (fora da transação, caixaService tem prisma próprio)
    if (dto.metodoPagamento === MetodoPagamento.DINHEIRO) {
      await this.caixaService.registrarPagamento(negocioId, pedido.id, valorTotal, 'DINHEIRO', usuarioId);
    }

    return pedido;
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

  async listarPorNegocio(negocioId: string, dataInicio?: string, dataFim?: string, limite?: number, pagina?: number) {
    const where: any = { negocioId };
    if (dataInicio || dataFim) {
      where.criadoEm = {};
      if (dataInicio) where.criadoEm.gte = new Date(dataInicio);
      if (dataFim) {
        const fim = new Date(dataFim);
        fim.setHours(23, 59, 59, 999);
        where.criadoEm.lte = fim;
      }
    }
    if (limite && limite > 0) {
      const take = limite;
      const skip = pagina && pagina > 1 ? (pagina - 1) * take : 0;
      const [data, total] = await this.prisma.$transaction([
        this.prisma.pedido.findMany({
          where, orderBy: { criadoEm: 'desc' }, skip, take,
          include: { itens: true, pagamentos: true },
        }),
        this.prisma.pedido.count({ where }),
      ]);
      return { data, total, pagina: pagina || 1, totalPaginas: Math.ceil(total / take) };
    }
    return this.prisma.pedido.findMany({
      where, orderBy: { criadoEm: 'desc' },
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
      include: { itens: true, pagamentos: true },
    });
    if (!pedido) throw new NotFoundException('Pedido não encontrado');

    const pagamentoPendente = pedido.pagamentos.find(
      (p) => p.status === StatusPagamento.PENDENTE,
    );
    if (!pagamentoPendente) {
      throw new BadRequestException('Nenhum pagamento pendente para confirmar');
    }

    const caixa = await this.caixaService.buscarCaixaAberto(pedido.negocioId, usuarioId);
    if (!caixa) {
      throw new BadRequestException('Nenhum caixa aberto para você. Peça ao gerente para abrir um caixa.');
    }

    const pedidoAtualizado = await this.prisma.$transaction(async (tx) => {
      const pagamentoAtualizado = await tx.pagamento.update({
        where: { id: pagamentoPendente.id },
        data: { status: StatusPagamento.APROVADO },
      });
      pedido.pagamentos = pedido.pagamentos.map((p) =>
        p.id === pagamentoAtualizado.id ? pagamentoAtualizado : p,
      );

      if (pedido.status === StatusPedido.PENDENTE) {
        await tx.pedido.update({
          where: { id },
          data: { status: StatusPedido.CONFIRMADO },
        });
        pedido.status = StatusPedido.CONFIRMADO;
      }

      await tx.caixaMovimento.create({
        data: {
          caixaId: caixa.id,
          tipo: TipoMovimentoCaixa.PAGAMENTO,
          valor: Number(pedido.total),
          formaPagamento: pagamentoPendente.metodo,
          pedidoId: pedido.id,
          descricao: `Venda #${pedido.id.slice(0, 8)}`,
        },
      });

      if (pedido.itens.length) {
        const estoqueItens = await tx.estoqueItem.findMany({
          where: {
            negocioId: pedido.negocioId,
            produtoId: { in: pedido.itens.map((i) => i.produtoId) },
          },
          include: {
            produto: { select: { controlaEstoque: true, vendaPorPeso: true } },
          },
        });

        const jaBaixados = await tx.movimentacaoEstoque.findMany({
          where: {
            estoqueItemId: { in: estoqueItens.map((e) => e.id) },
            tipo: TipoMovimentacao.SAIDA_VENDA,
            referencia: pedido.id,
          },
          select: { estoqueItemId: true },
        });
        const jaBaixadoSet = new Set(jaBaixados.map((m) => m.estoqueItemId));

        const updates: Promise<any>[] = [];
        const movimentacoes: any[] = [];

        for (const item of pedido.itens) {
          const estoqueItem = estoqueItens.find((e) => e.produtoId === item.produtoId);
          if (!estoqueItem || !estoqueItem.produto?.controlaEstoque) continue;
          if (jaBaixadoSet.has(estoqueItem.id)) continue;

          const qtd = estoqueItem.produto.vendaPorPeso
            ? converterPeso(Number(item.quantidade), 'kg', estoqueItem.unidade)
            : Number(item.quantidade);
          const qtdAntes = Number(estoqueItem.quantidadeAtual);

          updates.push(
            tx.estoqueItem.update({
              where: { id: estoqueItem.id },
              data: { quantidadeAtual: { decrement: qtd } },
            }),
          );
          movimentacoes.push({
            negocioId: pedido.negocioId,
            estoqueItemId: estoqueItem.id,
            usuarioId: usuarioId ?? null,
            tipo: TipoMovimentacao.SAIDA_VENDA,
            quantidade: qtd,
            quantidadeAntes: qtdAntes,
            quantidadeApos: qtdAntes - qtd,
            motivo: `Confirmação pagamento #${pedido.id.slice(0, 8)}`,
            referencia: pedido.id,
          });
        }

        if (updates.length) await Promise.all(updates);
        if (movimentacoes.length) await tx.movimentacaoEstoque.createMany({ data: movimentacoes });
      }

      return pedido;
    });

    await this.redis.del(`catalog:v2:${pedido.negocioId}:products`).catch(() => {});

    await this.caixaService.invalidarCaixaAtual(pedido.negocioId, usuarioId);

    return pedidoAtualizado;
  }
}
