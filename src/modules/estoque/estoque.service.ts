import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { ProdutoStatus, TipoMovimentacao } from '@prisma/client';
import { CriarEstoqueItemDto } from './dto/criar-estoque-item.dto';
import { AtualizarEstoqueItemDto } from './dto/atualizar-estoque-item.dto';
import { MovimentarEstoqueDto } from './dto/movimentar-estoque.dto';
import { TransferirEstoqueDto } from './dto/transferir-estoque.dto';

@Injectable()
export class EstoqueService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('alertas-estoque') private alertasQueue: Queue,
    private redis: RedisService,
  ) {}

  private async invalidateCatalogo(negocioId: string) {
    await this.redis.del(`catalog:v2:${negocioId}:products`);
  }

  private include = {
    produto: {
      select: { id: true, nome: true, sku: true, status: true, preco: true, controlaEstoque: true },
    },
  } as const;

  private mapItem(item: any) {
    return {
      ...item,
      nome: item.produto?.nome ?? item.nome ?? 'Sem nome',
      sku: item.produto?.sku ?? item.sku ?? null,
      ehAvulso: !item.produtoId,
      precoCusto: item.precoCusto ? Number(item.precoCusto) : null,
      quantidadeAtual: Number(item.quantidadeAtual),
      estoqueMinimo: Number(item.estoqueMinimo),
    };
  }

  async findAll(negocioId: string, query?: { page?: number; limit?: number; search?: string }) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { negocioId };
    if (query?.search) {
      where.OR = [
        { nome: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { produto: { nome: { contains: query.search, mode: 'insensitive' } } },
        { produto: { sku: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.estoqueItem.findMany({
        where,
        include: this.include,
        orderBy: { criadoEm: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.estoqueItem.count({ where }),
    ]);

    return {
      data: items.map(this.mapItem),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async criar(negocioId: string, dto: CriarEstoqueItemDto) {
    if (!dto.produtoId && !dto.nome) {
      throw new BadRequestException('Informe um produtoId ou um nome para o item avulso');
    }

    if (dto.produtoId) {
      const existente = await this.prisma.estoqueItem.findUnique({
        where: { produtoId: dto.produtoId },
      });
      if (existente) {
        throw new BadRequestException('Este produto já possui um item de estoque vinculado');
      }
    }

    const config = await this.prisma.configuracaoNegocio.findUnique({
      where: { negocioId },
    });
    const estoqueMinimoPadrao = config?.estoqueMinimoPadrao ?? 5;

    const item = await this.prisma.estoqueItem.create({
      data: {
        negocioId,
        produtoId: dto.produtoId ?? null,
        nome: dto.nome ?? null,
        sku: dto.sku ?? null,
        precoCusto: dto.precoCusto ?? undefined,
        quantidadeAtual: dto.quantidadeAtual ?? 0,
        estoqueMinimo: dto.estoqueMinimo ?? estoqueMinimoPadrao,
        unidade: dto.unidade ?? 'un',
      },
      include: this.include,
    });

    return this.mapItem(item);
  }

  async findOne(negocioId: string, itemId: string) {
    const item = await this.prisma.estoqueItem.findFirst({
      where: { id: itemId, negocioId },
      include: this.include,
    });
    if (!item) throw new NotFoundException('Item de estoque não encontrado');
    return this.mapItem(item);
  }

  async atualizar(negocioId: string, itemId: string, dto: AtualizarEstoqueItemDto) {
    await this.findOne(negocioId, itemId);
    const item = await this.prisma.estoqueItem.update({
      where: { id: itemId },
      data: dto,
      include: this.include,
    });
    await this.invalidateCatalogo(negocioId);
    return this.mapItem(item);
  }

  async remover(negocioId: string, itemId: string) {
    await this.findOne(negocioId, itemId);

    await this.prisma.$transaction(async (tx) => {
      await tx.movimentacaoEstoque.deleteMany({ where: { estoqueItemId: itemId } });
      await tx.estoqueItem.delete({ where: { id: itemId } });
    });

    await this.invalidateCatalogo(negocioId);

    return { message: 'Item removido' };
  }

  async movimentar(
    negocioId: string,
    itemId: string,
    dto: MovimentarEstoqueDto,
    usuarioId?: string,
  ) {
    const item = await this.findOne(negocioId, itemId);

    const tiposEntrada = ['ENTRADA', 'TRANSFERENCIA_ENTRADA'];
    const isEntrada = tiposEntrada.includes(dto.tipo);
    const isInventario = dto.tipo === 'INVENTARIO';

    const quantidadeAntes = Number(item.quantidadeAtual);

    if (!isInventario && dto.quantidade <= 0) {
      throw new BadRequestException('Quantidade deve ser maior que zero');
    }

    if (!isEntrada && !isInventario && dto.quantidade > quantidadeAntes) {
      throw new BadRequestException('Estoque insuficiente');
    }

    const quantidadeApos = isInventario
      ? dto.quantidade
      : isEntrada
        ? Math.round((quantidadeAntes + dto.quantidade) * 1000) / 1000
        : Math.round((quantidadeAntes - dto.quantidade) * 1000) / 1000;

    const delta = Math.round(Math.abs(quantidadeApos - quantidadeAntes) * 1000) / 1000;

    const [movimentacao] = await this.prisma.$transaction([
      this.prisma.movimentacaoEstoque.create({
        data: {
          negocioId,
          estoqueItemId: itemId,
          usuarioId: usuarioId ?? null,
          tipo: dto.tipo,
          quantidade: isInventario ? delta : dto.quantidade,
          quantidadeAntes,
          quantidadeApos,
          motivo: dto.motivo,
          referencia: dto.referencia,
        },
      }),
      this.prisma.estoqueItem.update({
        where: { id: itemId },
        data: { quantidadeAtual: quantidadeApos },
      }),
    ]);

    if (item.produtoId) {
      const novoStatus =
        quantidadeApos <= 0 ? ProdutoStatus.ESGOTADO : ProdutoStatus.ATIVO;
      await this.prisma.produto.updateMany({
        where: { id: item.produtoId, status: { not: novoStatus } },
        data: { status: novoStatus },
      });
    }

    if (!isEntrada && quantidadeApos <= Number(item.estoqueMinimo)) {
      await this.alertasQueue.add('estoque-ruptura', {
        negocioId,
        produtoId: item.produtoId,
        produtoNome: item.nome,
        quantidadeAtual: quantidadeApos,
        estoqueMinimo: Number(item.estoqueMinimo),
      });
    }

    await this.invalidateCatalogo(negocioId);

    return movimentacao;
  }

  async historico(negocioId: string, itemId: string) {
    await this.findOne(negocioId, itemId);
    const movimentacoes = await this.prisma.movimentacaoEstoque.findMany({
      where: { estoqueItemId: itemId, negocioId },
      orderBy: { criadoEm: 'desc' },
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
      },
    });
    return movimentacoes.map((m) => ({
      ...m,
      quantidade: Number(m.quantidade),
      quantidadeAntes: Number(m.quantidadeAntes),
      quantidadeApos: Number(m.quantidadeApos),
    }));
  }

  async transferir(negocioId: string, dto: TransferirEstoqueDto, usuarioId?: string) {
    if (dto.negocioDestinoId === negocioId) {
      throw new BadRequestException('O negócio de destino deve ser diferente do negócio de origem');
    }

    const itemOrigem = await this.findOne(negocioId, dto.itemOrigemId);

    if (dto.quantidade > Number(itemOrigem.quantidadeAtual)) {
      throw new BadRequestException('Estoque insuficiente para transferência');
    }

    const destinoNegocio = await this.prisma.negocio.findUnique({
      where: { id: dto.negocioDestinoId, ativo: true },
    });
    if (!destinoNegocio) throw new NotFoundException('Negócio de destino não encontrado');

    let itemDestino;

    if (itemOrigem.produtoId) {
      itemDestino = await this.prisma.estoqueItem.findFirst({
        where: { produtoId: itemOrigem.produtoId, negocioId: dto.negocioDestinoId },
      });
      if (!itemDestino) throw new NotFoundException('Produto não encontrado no estoque de destino');
    } else {
      itemDestino = await this.prisma.estoqueItem.findFirst({
        where: { nome: itemOrigem.nome, negocioId: dto.negocioDestinoId, produtoId: null },
      });

      if (!itemDestino) {
        itemDestino = await this.prisma.estoqueItem.create({
          data: {
            negocioId: dto.negocioDestinoId,
            nome: itemOrigem.nome,
            sku: itemOrigem.sku,
            unidade: itemOrigem.unidade,
            estoqueMinimo: itemOrigem.estoqueMinimo,
            quantidadeAtual: 0,
          },
        });
      }
    }

    if (itemOrigem.id === itemDestino.id) {
      throw new BadRequestException('Origem e destino devem ser diferentes');
    }

    const quantidadeAntesOrigem = Number(itemOrigem.quantidadeAtual);
    const quantidadeAntesDestino = Number(itemDestino.quantidadeAtual);

    const novaQtdOrigem = Math.round((quantidadeAntesOrigem - dto.quantidade) * 1000) / 1000;

    await this.prisma.$transaction([
      this.prisma.estoqueItem.update({
        where: { id: itemOrigem.id },
        data: { quantidadeAtual: novaQtdOrigem },
      }),
      this.prisma.estoqueItem.update({
        where: { id: itemDestino.id },
        data: { quantidadeAtual: quantidadeAntesDestino + dto.quantidade },
      }),
      this.prisma.movimentacaoEstoque.create({
        data: {
          negocioId,
          estoqueItemId: itemOrigem.id,
          usuarioId: usuarioId ?? null,
          tipo: TipoMovimentacao.TRANSFERENCIA_SAIDA,
          quantidade: dto.quantidade,
          quantidadeAntes: quantidadeAntesOrigem,
          quantidadeApos: novaQtdOrigem,
          motivo: dto.motivo || 'Transferência entre negócios',
        },
      }),
      this.prisma.movimentacaoEstoque.create({
        data: {
          negocioId: dto.negocioDestinoId,
          estoqueItemId: itemDestino.id,
          usuarioId: null,
          tipo: TipoMovimentacao.TRANSFERENCIA_ENTRADA,
          quantidade: dto.quantidade,
          quantidadeAntes: quantidadeAntesDestino,
          quantidadeApos: quantidadeAntesDestino + dto.quantidade,
          motivo: dto.motivo || 'Transferência entre negócios',
        },
      }),
    ]);

    if (novaQtdOrigem <= 0 && itemOrigem.produtoId) {
      await this.prisma.produto.updateMany({
        where: { id: itemOrigem.produtoId, status: { not: ProdutoStatus.ESGOTADO } },
        data: { status: ProdutoStatus.ESGOTADO },
      });
    }

    if (novaQtdOrigem <= Number(itemOrigem.estoqueMinimo)) {
      await this.alertasQueue.add('estoque-ruptura', {
        negocioId,
        produtoId: itemOrigem.produtoId,
        produtoNome: itemOrigem.nome,
        quantidadeAtual: novaQtdOrigem,
        estoqueMinimo: Number(itemOrigem.estoqueMinimo),
      });
    }

    await this.invalidateCatalogo(negocioId);
    await this.invalidateCatalogo(dto.negocioDestinoId);

    return { message: 'Transferência realizada com sucesso' };
  }

  async alertas(negocioId: string) {
    const items = await this.prisma.estoqueItem.findMany({
      where: { negocioId, quantidadeAtual: { lte: 0 } },
      include: this.include,
    });
    return items.map(this.mapItem);
  }

  async zerarNegativos(negocioId: string, usuarioId?: string) {
    const itens = await this.prisma.estoqueItem.findMany({
      where: { negocioId, quantidadeAtual: { lt: 0 } },
    });

    let corrigidos = 0;
    for (const item of itens) {
      const qtdAtual = Number(item.quantidadeAtual);
      await this.prisma.$transaction(async (tx) => {
        await tx.estoqueItem.update({
          where: { id: item.id },
          data: { quantidadeAtual: 0 },
        });
        await tx.movimentacaoEstoque.create({
          data: {
            negocioId,
            estoqueItemId: item.id,
            usuarioId: usuarioId ?? null,
            tipo: TipoMovimentacao.INVENTARIO,
            quantidade: Math.abs(qtdAtual),
            quantidadeAntes: qtdAtual,
            quantidadeApos: 0,
            motivo: 'Correção: estoque negativo zerado',
          },
        });
      });
      corrigidos++;
    }

    if (corrigidos > 0) {
      await this.invalidateCatalogo(negocioId);
    }

    return { corrigidos };
  }
}
