import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { StorageService } from '../../infra/storage/storage.service';
import { CriarProdutoDto } from './dto/criar-produto.dto';
import { AtualizarProdutoDto } from './dto/atualizar-produto.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ProdutosService {
  private readonly logger = new Logger(ProdutosService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private storage: StorageService,
  ) {}

  private cacheKey(negocioId: string) {
    return `catalog:v2:${negocioId}:products`;
  }

  private async invalidateCache(negocioId: string) {
    await this.redis.del(this.cacheKey(negocioId));
  }

  private normalizeImagens(produto: any): void {
    if (produto.imagens) {
      for (const img of produto.imagens) {
        img.url = this.storage.normalizeUrl(img.url);
      }
    }
  }

  async create(negocioId: string, dto: CriarProdutoDto) {
    const produto = await this.prisma.produto.create({
      data: {
        negocioId,
        categoriaId: dto.categoriaId,
        nome: dto.nome,
        descricao: dto.descricao,
        preco: dto.preco,
        tipoDesconto: dto.tipoDesconto,
        valorDesconto: dto.valorDesconto,
        sku: dto.sku,
        status: 'ATIVO',
        destaque: dto.destaque || false,
        ordem: dto.ordem || 0,
        controlaEstoque: dto.controlaEstoque ?? true,
        gruposModificadores: dto.gruposModificadores
          ? {
              create: dto.gruposModificadores.map((g) => ({
                nome: g.nome,
                obrigatorio: g.obrigatorio || false,
                minSelecao: g.minSelecao || 0,
                maxSelecao: g.maxSelecao || 1,
                ordem: g.ordem || 0,
                opcoes: {
                  create: g.opcoes.map((o) => ({
                    nome: o.nome,
                    precoExtra: o.precoExtra || 0,
                    ordem: o.ordem || 0,
                  })),
                },
              })),
            }
          : undefined,
      },
      include: {
        categoria: true,
        imagens: { orderBy: { ordem: 'asc' } },
        gruposModificadores: { include: { opcoes: true } },
      },
    });

    await this.invalidateCache(negocioId);

    if (produto.controlaEstoque) {
      const config = await this.prisma.configuracaoNegocio.findUnique({
        where: { negocioId },
      });
      await this.prisma.estoqueItem.create({
        data: {
          negocioId,
          produtoId: produto.id,
          quantidadeAtual: 0,
          estoqueMinimo: config?.estoqueMinimoPadrao ?? 5,
        },
      });
    }

    return produto;
  }

  async findAll(negocioId: string) {
    const produtos = await this.prisma.produto.findMany({
      where: { negocioId },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
      include: {
        categoria: true,
        imagens: { orderBy: { ordem: 'asc' } },
        gruposModificadores: { include: { opcoes: true }, orderBy: { ordem: 'asc' } },
        estoqueItem: { select: { quantidadeAtual: true, estoqueMinimo: true } },
        _count: { select: { pedidoItens: true } },
      },
    });
    for (const p of produtos) this.normalizeImagens(p);
    return produtos;
  }

  async findOne(negocioId: string, id: string) {
    const produto = await this.prisma.produto.findFirst({
      where: { id, negocioId },
      include: {
        categoria: true,
        imagens: { orderBy: { ordem: 'asc' } },
        gruposModificadores: { include: { opcoes: true }, orderBy: { ordem: 'asc' } },
        estoqueItem: true,
      },
    });
    if (!produto) throw new NotFoundException('Produto não encontrado');
    this.normalizeImagens(produto);
    return produto;
  }

  async update(negocioId: string, id: string, dto: AtualizarProdutoDto) {
    await this.findOne(negocioId, id);

    const data: any = { ...dto };
    delete data.gruposModificadores;

    const produto = await this.prisma.$transaction(async (tx) => {
      if (dto.gruposModificadores) {
        const oldOpcoes = await tx.opcaoModificador.findMany({
          where: { grupo: { produtoId: id } },
          select: { id: true },
        });
        if (oldOpcoes.length) {
          await tx.carrinhoItemOpcao.deleteMany({
            where: { opcaoId: { in: oldOpcoes.map((o) => o.id) } },
          });
        }

        await tx.grupoModificador.deleteMany({ where: { produtoId: id } });

        for (const g of dto.gruposModificadores) {
          const grupo = await tx.grupoModificador.create({
            data: {
              produtoId: id,
              nome: g.nome!,
              obrigatorio: g.obrigatorio ?? false,
              minSelecao: g.minSelecao ?? 0,
              maxSelecao: g.maxSelecao ?? 1,
              ordem: g.ordem ?? 0,
            },
          });
          if (g.opcoes?.length) {
            await tx.opcaoModificador.createMany({
              data: g.opcoes.map((o) => ({
                grupoId: grupo.id,
                nome: o.nome!,
                precoExtra: o.precoExtra ?? 0,
                ordem: o.ordem ?? 0,
              })),
            });
          }
        }
      }

      return tx.produto.update({
        where: { id },
        data,
        include: {
          categoria: true,
          imagens: { orderBy: { ordem: 'asc' } },
          gruposModificadores: { include: { opcoes: true } },
        },
      });
    });

    this.normalizeImagens(produto);
    await this.invalidateCache(negocioId);
    return produto;
  }

  async remove(negocioId: string, id: string) {
    await this.findOne(negocioId, id);

    const pedidoCount = await this.prisma.pedidoItem.count({ where: { produtoId: id } });
    if (pedidoCount > 0) {
      throw new BadRequestException(
        'Produto possui pedidos vinculados. Remova o vínculo antes de excluir.',
      );
    }

    const imagens = await this.prisma.imagemProduto.findMany({ where: { produtoId: id } });
    for (const img of imagens) {
      const key = this.storage.extractKey(img.url);
      if (key) {
        try {
          await this.storage.deleteObject(key);
        } catch (e) {
          this.logger.warn(`Falha ao deletar imagem do storage: ${key}`);
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.carrinhoItem.deleteMany({ where: { produtoId: id } });
      await tx.produto.delete({ where: { id } });
    });

    await this.invalidateCache(negocioId);
  }

  async requestUploadUrl(negocioId: string, produtoId: string, fileName: string, fileSize?: number) {
    await this.findOne(negocioId, produtoId);

    const MAX_SIZE = 5 * 1024 * 1024;
    if (fileSize && fileSize > MAX_SIZE) {
      throw new BadRequestException('A imagem deve ter no máximo 5MB');
    }

    const ext = fileName.split('.').pop();
    const key = `produtos/${negocioId}/${produtoId}/${uuidv4()}.${ext}`;
    const url = await this.storage.getPresignedUploadUrl(key);

    return { url, key };
  }

  async confirmUpload(negocioId: string, produtoId: string, key: string) {
    const produto = await this.findOne(negocioId, produtoId);

    const existente = await this.prisma.imagemProduto.findFirst({
      where: { produtoId },
    });

    if (existente) {
      const oldKey = this.storage.extractKey(existente.url);
      if (oldKey) {
        try {
          await this.storage.deleteObject(oldKey);
        } catch (e) {
          this.logger.warn(`Falha ao deletar imagem antiga: ${oldKey}`);
        }
      }
      await this.prisma.imagemProduto.delete({ where: { id: existente.id } });
    }

    return this.prisma.imagemProduto.create({
      data: {
        produtoId,
        url: this.storage.getPublicUrl(key),
        ordem: 0,
        principal: true,
      },
    });
  }

  async buscarPorCodigoBarras(negocioId: string, codigo: string) {
    const produto = await this.prisma.produto.findFirst({
      where: { negocioId, codigoBarras: codigo, status: 'ATIVO' },
      include: {
        categoria: true,
        imagens: { orderBy: { ordem: 'asc' } },
        gruposModificadores: { include: { opcoes: true }, orderBy: { ordem: 'asc' } },
        estoqueItem: { select: { quantidadeAtual: true, estoqueMinimo: true } },
      },
    });
    if (!produto) throw new NotFoundException('Produto não encontrado para este código');
    this.normalizeImagens(produto);
    return produto;
  }

  async deleteImage(negocioId: string, produtoId: string, imagemId: string) {
    await this.findOne(negocioId, produtoId);

    const img = await this.prisma.imagemProduto.findFirst({
      where: { id: imagemId, produtoId },
    });
    if (!img) throw new NotFoundException('Imagem não encontrada');

    const key = this.storage.extractKey(img.url);
    if (key) {
      try {
        await this.storage.deleteObject(key);
      } catch (e) {
        this.logger.warn(`Falha ao deletar imagem do storage: ${key}`);
      }
    }

    await this.prisma.imagemProduto.delete({ where: { id: imagemId } });
  }

  async vitrine(slug: string) {
    const negocio = await this.prisma.negocio.findUnique({
      where: { slug, ativo: true },
      select: {
        id: true,
        nome: true,
        slug: true,
        descricao: true,
        logoUrl: true,
        bannerUrl: true,
        configuracoes: { select: { taxaFrete: true, endereco: true, telefoneContato: true } },
        taxasFreteBairro: { where: { ativo: true }, select: { bairro: true, taxa: true } },
      },
    });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');

    const cacheKey = `catalog:v2:${negocio.id}:products`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const produtos = await this.prisma.produto.findMany({
      where: {
        negocioId: negocio.id,
        status: 'ATIVO',
      },
      orderBy: [{ destaque: 'desc' }, { ordem: 'asc' }, { criadoEm: 'desc' }],
      include: {
        categoria: { select: { id: true, nome: true } },
        imagens: { where: { principal: true }, take: 1 },
        gruposModificadores: {
          include: { opcoes: { where: { ativo: true } } },
          orderBy: { ordem: 'asc' },
        },
      },
    });

    const categoriasMap = new Map<string, { id: string; nome: string }>();
    for (const p of produtos) {
      if (p.categoria && !categoriasMap.has(p.categoria.id)) {
        categoriasMap.set(p.categoria.id, p.categoria);
      }
    }

    for (const p of produtos) this.normalizeImagens(p);
    const result = { negocio, categorias: Array.from(categoriasMap.values()), produtos };
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }
}
