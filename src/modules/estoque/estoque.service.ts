import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infra/database/prisma.service';
import { ProdutoStatus } from '@prisma/client';
import { CriarEstoqueItemDto } from './dto/criar-estoque-item.dto';
import { AtualizarEstoqueItemDto } from './dto/atualizar-estoque-item.dto';
import { MovimentarEstoqueDto } from './dto/movimentar-estoque.dto';
import { TransferirEstoqueDto } from './dto/transferir-estoque.dto';

@Injectable()
export class EstoqueService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('alertas-estoque') private alertasQueue: Queue,
  ) {}

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
    return this.mapItem(item);
  }

  async remover(negocioId: string, itemId: string) {
    await this.findOne(negocioId, itemId);
    await this.prisma.estoqueItem.delete({ where: { id: itemId } });
    return { message: 'Item removido' };
  }

  async movimentar(
    negocioId: string,
    itemId: string,
    dto: MovimentarEstoqueDto,
    usuarioId?: string,
  ) {
    const item = await this.findOne(negocioId, itemId);

    const tiposEntrada = ['ENTRADA', 'TRANSFERENCIA_ENTRADA', 'INVENTARIO'];
    const isEntrada = tiposEntrada.includes(dto.tipo);

    if (!isEntrada && dto.quantidade > item.quantidadeAtual) {
      throw new BadRequestException('Estoque insuficiente');
    }

    const quantidadeAntes = item.quantidadeAtual;
    const quantidadeApos = isEntrada
      ? quantidadeAntes + dto.quantidade
      : quantidadeAntes - dto.quantidade;

    const [movimentacao] = await this.prisma.$transaction([
      this.prisma.movimentacaoEstoque.create({
        data: {
          negocioId,
          estoqueItemId: itemId,
          usuarioId: usuarioId ?? null,
          tipo: dto.tipo,
          quantidade: dto.quantidade,
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

    if (!isEntrada && quantidadeApos <= item.estoqueMinimo) {
      await this.alertasQueue.add('estoque-ruptura', {
        negocioId,
        produtoId: item.produtoId,
        produtoNome: item.nome,
        quantidadeAtual: quantidadeApos,
        estoqueMinimo: item.estoqueMinimo,
      });
    }

    return movimentacao;
  }

  async historico(negocioId: string, itemId: string) {
    await this.findOne(negocioId, itemId);
    return this.prisma.movimentacaoEstoque.findMany({
      where: { estoqueItemId: itemId, negocioId },
      orderBy: { criadoEm: 'desc' },
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
      },
    });
  }

  async transferir(negocioId: string, dto: TransferirEstoqueDto, usuarioId?: string) {
    const itemOrigem = await this.findOne(negocioId, dto.itemOrigemId);

    if (dto.quantidade > itemOrigem.quantidadeAtual) {
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

    const quantidadeAntesOrigem = itemOrigem.quantidadeAtual;
    const quantidadeAntesDestino = itemDestino.quantidadeAtual;

    const novaQtdOrigem = quantidadeAntesOrigem - dto.quantidade;

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
          tipo: 'TRANSFERENCIA_SAIDA',
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
          tipo: 'TRANSFERENCIA_ENTRADA',
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

    if (novaQtdOrigem <= itemOrigem.estoqueMinimo) {
      await this.alertasQueue.add('estoque-ruptura', {
        negocioId,
        produtoId: itemOrigem.produtoId,
        produtoNome: itemOrigem.nome,
        quantidadeAtual: novaQtdOrigem,
        estoqueMinimo: itemOrigem.estoqueMinimo,
      });
    }

    return { message: 'Transferência realizada com sucesso' };
  }

  async alertas(negocioId: string) {
    const items = await this.prisma.estoqueItem.findMany({
      where: { negocioId, quantidadeAtual: { lte: 0 } },
      include: this.include,
    });
    return items.map(this.mapItem);
  }
}
