import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { EstoqueService } from '../estoque/estoque.service';
import { ImprimirService } from '../imprimir/imprimir.service';
import { CaixaService } from '../caixa/caixa.service';
import { ContasReceberService } from '../contas-receber/contas-receber.service';
import { FiscalService } from '../fiscal/fiscal.service';
import { FinalizarPdvDto } from './dto/finalizar-pdv.dto';
import { StatusPedido, MetodoPagamento, StatusPagamento, TipoMovimentacao, RoleNegocio } from '@prisma/client';
import { calcularPrecoFinal } from '../../common/utils/preco';
import { converterPeso } from '../../common/utils/unidade';
import { calcularTaxaCartao } from '../../common/utils/taxa-cartao';

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
    private redis: RedisService,
  ) {}

  async calcularTotais(negocioId: string, dto: FinalizarPdvDto, usuarioId?: string, role?: string) {
    await this.caixaService.exigirCaixaAberto(negocioId, usuarioId);

    if (!dto.itens.length) {
      throw new BadRequestException('Nenhum item na venda');
    }

    // Normaliza pagamentos: aceita o novo formato (array) e o legado (objeto único)
    const isLegado = !Array.isArray(dto.pagamentos);
    const pagamentos = isLegado && dto.pagamento ? [dto.pagamento] : (dto.pagamentos ?? []);
    if (!pagamentos.length) {
      throw new BadRequestException('Informe ao menos uma forma de pagamento');
    }

    const produtos = await this.prisma.produto.findMany({
      where: {
        id: { in: dto.itens.map((i) => i.produtoId) },
        status: 'ATIVO',
      },
      include: { negocio: { select: { id: true, cidade: true } } },
    });

    if (produtos.length !== dto.itens.length) {
      throw new BadRequestException('Alguns produtos não encontrados ou inativos');
    }

    // Valida que todos os produtos pertencem ao negócio da venda ou à mesma cidade
    // (SUPER_ADMIN pode vender produtos de qualquer cidade)
    if (role !== RoleNegocio.SUPER_ADMIN) {
      const negocioVenda = await this.prisma.negocio.findUnique({
        where: { id: negocioId },
        select: { cidade: true },
      });
      for (const produto of produtos) {
        const pertence =
          produto.negocioId === negocioId ||
          (negocioVenda?.cidade && produto.negocio.cidade === negocioVenda.cidade);
        if (!pertence) {
          throw new BadRequestException(
            `Produto "${produto.nome}" pertence a outro negócio de outra cidade e não pode ser vendido aqui`,
          );
        }
      }
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
      // Etiqueta da balança (código Toledo) já traz o valor embutido
      const precoEtiqueta = item.precoUnitario;
      const quantidade = precoEtiqueta !== undefined ? 1 : (item.quantidade ?? 1);
      if (precoEtiqueta === undefined && produto.vendaPorPeso) {
        if (!Number.isFinite(quantidade) || quantidade < 0.001) {
          throw new BadRequestException(`Peso inválido para "${produto.nome}"`);
        }
      } else if (precoEtiqueta === undefined) {
        if (!Number.isInteger(quantidade) || quantidade < 1) {
          throw new BadRequestException(`Quantidade inválida para "${produto.nome}"`);
        }
      }
      let precoUnitario = precoEtiqueta !== undefined ? precoEtiqueta : calcularPrecoFinal(produto);

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
        quantidade,
        modificadores: modificadores.length ? modificadores : undefined,
      };
    }));

    const subtotalItens = Number(itensData.reduce((acc, i) =>
      acc + Math.round(i.precoUnitario * i.quantidade * 100) / 100, 0).toFixed(2));
    const totalAposDesconto = aplicarDesconto(subtotalItens, dto.descontoTotal);
    const descontoTotal = Math.max(0, Math.round((subtotalItens - totalAposDesconto) * 100) / 100);
    let valorTotal = Math.max(0, Math.round(totalAposDesconto * 100) / 100);

    // Taxa de frete (entrega): taxa do bairro ou taxa fixa do negócio
    let taxaFrete = 0;
    if (dto.tipoEntrega === 'ENTREGA') {
      const config = await this.prisma.configuracaoNegocio.findUnique({ where: { negocioId } });
      const bairro = dto.endereco?.bairro;
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
      valorTotal = Math.round((valorTotal + taxaFrete) * 100) / 100;
    }

    // Taxa de cartão (repasse)
    // - Método único (legado ou array de uma linha): faixa aplicada sobre o total
    // - Misto: faixa aplicada apenas sobre a soma das parcelas de cartão
    let taxaCartao = 0;
    const ehCartao = (m: MetodoPagamento) =>
      m === MetodoPagamento.CARTAO_CREDITO || m === MetodoPagamento.CARTAO_DEBITO;
    // Linha única: evita recalcular a taxa sobre uma base que já inclui a taxa
    const ehMetodoUnico = pagamentos.length === 1;
    if (ehMetodoUnico) {
      if (ehCartao(pagamentos[0].metodo)) {
        const config = await this.prisma.configuracaoNegocio.findUnique({ where: { negocioId } });
        const faixas = Array.isArray(config?.taxaCartaoFaixas)
          ? (config.taxaCartaoFaixas as { ate: number; valor: number }[])
          : [];
        taxaCartao = calcularTaxaCartao(valorTotal, faixas);
        valorTotal = Math.round((valorTotal + taxaCartao) * 100) / 100;
      }
    } else {
      const somaCartao = pagamentos.reduce(
        (s, p) => s + (ehCartao(p.metodo) ? Number(p.valor ?? 0) : 0),
        0,
      );
      if (somaCartao > 0) {
        const config = await this.prisma.configuracaoNegocio.findUnique({ where: { negocioId } });
        const faixas = Array.isArray(config?.taxaCartaoFaixas)
          ? (config.taxaCartaoFaixas as { ate: number; valor: number }[])
          : [];
        taxaCartao = calcularTaxaCartao(somaCartao, faixas);
        valorTotal = Math.round((valorTotal + taxaCartao) * 100) / 100;
      }
    }

    // Em método único, preenche a parcela com o total final (incluindo taxa)
    if (ehMetodoUnico) {
      pagamentos[0].valor = valorTotal;
    }

    // Valida que a soma das parcelas cobre exatamente o total da venda
    const somaParcelas = pagamentos.reduce((s, p) => s + Number(p.valor ?? 0), 0);
    if (Math.abs(somaParcelas - valorTotal) > 0.01) {
      if (somaParcelas < valorTotal) {
        throw new BadRequestException(
          `Pagamento insuficiente. Faltam R$ ${(valorTotal - somaParcelas).toFixed(2)}`
        );
      }
      throw new BadRequestException(
        `Valor dos pagamentos (R$ ${somaParcelas.toFixed(2)}) excede o total da venda (R$ ${valorTotal.toFixed(2)})`
      );
    }

    // Troco: apenas dinheiro gera troco (valorPago maior que a parcela em dinheiro)
    let troco: number | undefined;
    let somaDinheiroExtra = 0;
    for (const p of pagamentos) {
      if (p.metodo !== MetodoPagamento.DINHEIRO) continue;
      const valor = Number(p.valor ?? 0);
      if (p.valorPago !== undefined && Number(p.valorPago) < valor) {
        throw new BadRequestException(
          `Valor recebido em dinheiro (R$ ${Number(p.valorPago).toFixed(2)}) menor que a parcela em dinheiro (R$ ${valor.toFixed(2)})`
        );
      }
      somaDinheiroExtra += Number(p.valorPago ?? valor) - valor;
    }
    troco = somaDinheiroExtra > 0 ? Math.round(somaDinheiroExtra * 100) / 100 : undefined;

    const somaCrediario = pagamentos
      .filter((p) => p.metodo === MetodoPagamento.CREDIARIO)
      .reduce((s, p) => s + Number(p.valor ?? 0), 0);
    const isCrediario = somaCrediario > 0;

    if (isCrediario) {
      if (!dto.clienteId) throw new BadRequestException('Selecione um cliente para venda a prazo');
      if (!dto.dataVencimento) throw new BadRequestException('Informe a data de vencimento');
      const cliente = await this.prisma.cliente.findUnique({ where: { id: dto.clienteId } });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      if (Number(cliente.saldoDevedor) + somaCrediario > Number(cliente.limiteCredito)) {
        throw new BadRequestException(
          `Cliente não tem limite de crédito suficiente. Saldo devedor atual: R$ ${Number(cliente.saldoDevedor).toFixed(2)}, Limite: R$ ${Number(cliente.limiteCredito).toFixed(2)}`
        );
      }
    }

    return { produtos, itensData, valorTotal, descontoTotal, taxaFrete, taxaCartao, troco, isCrediario, somaCrediario, pagamentos, caixa };
  }

  async preview(negocioId: string, dto: FinalizarPdvDto, usuarioId?: string, role?: string) {
    const { valorTotal, taxaFrete, taxaCartao } = await this.calcularTotais(negocioId, dto, usuarioId, role);
    return { total: valorTotal, taxaFrete, taxaCartao };
  }

  async checkout(negocioId: string, dto: FinalizarPdvDto, usuarioId?: string, role?: string) {
    if (dto.idempotencyKey) {
      const existente = await this.prisma.pedido.findFirst({
        where: { negocioId, idempotencyKey: dto.idempotencyKey },
        include: { itens: true, pagamentos: true },
      });
      if (existente) return existente;
    }

    const {
      produtos,
      itensData,
      valorTotal,
      descontoTotal,
      taxaFrete,
      taxaCartao,
      troco,
      somaCrediario,
      pagamentos,
      caixa,
    } = await this.calcularTotais(negocioId, dto, usuarioId, role);

    // PIX: impede divergência entre o valor exibido no QR e a parcela informada
    for (const p of pagamentos) {
      if (p.metodo === MetodoPagamento.PIX && p.valorPago !== undefined) {
        if (Math.abs(Number(p.valorPago) - Number(p.valor)) > 0.01) {
          throw new BadRequestException(
            `Valor do PIX (${Number(p.valorPago).toFixed(2)}) não confere com a parcela informada (${Number(p.valor).toFixed(2)})`,
          );
        }
      }
    }

    const sessionId = `pdv-${negocioId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // TRANSAÇÃO ÚNICA: pedido + estoque + caixa
    // Timeout elevado (30s) porque vendas com muitos itens geram várias queries
    // de estoque; o padrão do Prisma (5s) estoura em produção.
    const pedido = await this.prisma.$transaction(async (tx) => {
      const p = await tx.pedido.create({
        data: {
          negocioId,
          sessionId,
          usuarioId,
          status: StatusPedido.CONFIRMADO,
          total: valorTotal,
          descontoTotal,
          tipoEntrega: dto.tipoEntrega ?? 'RETIRADA',
          endereco: dto.endereco ?? undefined,
          observacao: dto.observacao,
          agendadoPara: dto.agendadoPara ? new Date(dto.agendadoPara) : undefined,
          clienteId: dto.clienteId || undefined,
          clienteCpf: dto.clienteCpf || undefined,
          clienteNome: dto.clienteNome || undefined,
          idempotencyKey: dto.idempotencyKey || undefined,
          troco: troco || undefined,
          taxaFrete: taxaFrete > 0 ? taxaFrete : undefined,
          taxaCartao: taxaCartao || undefined,
          itens: { create: itensData.map(i => ({
            produtoId: i.produtoId,
            produtoNome: i.produtoNome,
            precoUnitario: i.precoUnitario,
            quantidade: i.quantidade,
            modificadores: i.modificadores ?? undefined,
          })) },
          pagamentos: {
            create: pagamentos.map(pg => {
              const digits = (v?: string) => String(v || '').replace(/\D/g, '');
              const dados: Record<string, any> = {};
              if (pg.valorPago !== undefined) dados.valorPago = Number(pg.valorPago);
              if (pg.tpIntegra) dados.tpIntegra = pg.tpIntegra;
              if (pg.cnpjPagamento) dados.cnpj = digits(pg.cnpjPagamento);
              if (pg.tBand) dados.tBand = digits(pg.tBand).padStart(2, '0');
              if (pg.cAut) dados.cAut = String(pg.cAut).trim();
              if (pg.cnpjReceb) dados.CNPJReceb = digits(pg.cnpjReceb);
              if (pg.terminalPagamento) dados.idTermPag = String(pg.terminalPagamento).trim();
              return {
                valor: Math.round(Number(pg.valor) * 100) / 100,
                metodo: pg.metodo,
                status: pg.metodo === MetodoPagamento.CREDIARIO
                  ? StatusPagamento.PENDENTE
                  : StatusPagamento.APROVADO,
                ...(Object.keys(dados).length ? { dadosPagamento: dados } : {}),
              };
            }),
          },
        },
        include: { itens: true, pagamentos: true },
      });

      // Movimentação de estoque dentro da transação
      // Busca todos os estoques em uma única query (reduz round-trips no loop)
      const produtosComEstoque = itensData.filter((i) => {
        const pr = produtos.find((p) => p.id === i.produtoId);
        return pr?.controlaEstoque;
      });
      let estoquePorProduto = new Map<string, any>();
      if (produtosComEstoque.length) {
        const estoques = await tx.estoqueItem.findMany({
          where: { produtoId: { in: produtosComEstoque.map((i) => i.produtoId) } },
        });
        for (const e of estoques) {
          if (!e.produtoId) continue;
          if (!estoquePorProduto.has(e.produtoId) || e.negocioId === negocioId) {
            estoquePorProduto.set(e.produtoId, e);
          }
        }
      }

      // Agrupa por estoqueItem: com 71+ itens, o loop com update+create por item
      // gera ~142 round-trips sequenciais e estoura o timeout da transação.
      // O agrupamento também corrige quantidadeAntes quando o mesmo produto
      // aparece mais de uma vez na venda.
      const porEstoque = new Map<string, { ei: any; produto: any; qtd: number }>();
      for (const item of p.itens) {
        const produto = produtos.find((pr) => pr.id === item.produtoId);
        if (!produto?.controlaEstoque) continue;
        const ei = estoquePorProduto.get(item.produtoId);
        if (!ei) {
          throw new BadRequestException(`Estoque insuficiente para "${produto.nome}"`);
        }
        // Venda por peso: a quantidade é informada em kg e convertida para a unidade do estoque
        const qtd = produto.vendaPorPeso
          ? converterPeso(Number(item.quantidade), 'kg', ei.unidade)
          : Number(item.quantidade);
        const existente = porEstoque.get(ei.id);
        if (existente) {
          existente.qtd += qtd;
        } else {
          porEstoque.set(ei.id, { ei, produto, qtd });
        }
      }

      const updates: Promise<any>[] = [];
      const movimentacoes: any[] = [];
      for (const { ei, produto, qtd } of porEstoque.values()) {
        const qtdAntes = Number(ei.quantidadeAtual ?? 0);
        if (qtdAntes < qtd) {
          throw new BadRequestException(`Estoque insuficiente para "${produto.nome}"`);
        }
        updates.push(
          tx.estoqueItem.update({
            where: { id: ei.id },
            data: { quantidadeAtual: { decrement: qtd } },
          }),
        );
        movimentacoes.push({
          negocioId: ei.negocioId,
          estoqueItemId: ei.id,
          usuarioId: usuarioId ?? null,
          tipo: TipoMovimentacao.SAIDA_VENDA,
          quantidade: qtd,
          quantidadeAntes: qtdAntes,
          quantidadeApos: qtdAntes - qtd,
          motivo: `PDV #${p.id.slice(0, 8)}`,
          referencia: p.id,
        });
      }
      if (updates.length) await Promise.all(updates);
      if (movimentacoes.length) await tx.movimentacaoEstoque.createMany({ data: movimentacoes });

      // Registro no caixa DENTRO da transação (um movimento por parcela não-crediária)
      if (somaCrediario < valorTotal) {
        for (const pg of pagamentos) {
          if (pg.metodo === MetodoPagamento.CREDIARIO) continue;
          await tx.caixaMovimento.create({
            data: {
              caixaId: caixa.id,
              tipo: 'PAGAMENTO' as any,
              valor: Math.round(Number(pg.valor) * 100) / 100,
              formaPagamento: pg.metodo,
              pedidoId: p.id,
              descricao: `Venda #${p.id.slice(0, 8)}`,
            },
          });
        }
      }

      // Crediário: cria conta a receber apenas da parcela a prazo
      if (somaCrediario > 0 && dto.clienteId && dto.dataVencimento) {
        await tx.contaReceber.create({
          data: {
            clienteId: dto.clienteId,
            negocioId,
            pedidoId: p.id,
            valorTotal: somaCrediario,
            dataVencimento: new Date(dto.dataVencimento),
          },
        });
        await tx.cliente.update({
          where: { id: dto.clienteId },
          data: { saldoDevedor: { increment: somaCrediario } },
        });
      }

      return p;
    }, { timeout: 30000 });

    // Invalida cache da vitrine após a venda (estoque pode ter zerado)
    await this.redis.del(`catalog:v2:${negocioId}:products`).catch(() => {});

    // Invalida cache do caixa (novo movimento PAGAMENTO)
    await this.caixaService.invalidarCaixaAtual(negocioId, usuarioId);

    // Fire-and-forget: impressão (fora da transação)
    this.imprimirService.imprimirComanda(negocioId, pedido.id).catch((err) => {
      this.logger.error(`Erro ao imprimir comanda para pedido ${pedido.id}: ${err}`);
    });

    // Prepara o documento fiscal e enfileira a transmissão (retry/contingência na fila emissao-nfce)
    try {
      await this.fiscalService.emitirNFe(negocioId, pedido.id);
    } catch (err) {
      this.logger.error(`Erro ao preparar NF-e para pedido ${pedido.id}: ${err}`);
    }

    return pedido;
  }
}
