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
        codigoBarras: dto.codigoBarras,
        plu: dto.plu,
        precoCusto: dto.precoCusto ?? undefined,
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
          precoCusto: dto.precoCusto ?? undefined,
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

  async findAllPDV() {
    const produtos = await this.prisma.produto.findMany({
      where: { status: 'ATIVO' },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
      include: {
        categoria: true,
        imagens: { orderBy: { ordem: 'asc' } },
        gruposModificadores: { include: { opcoes: true }, orderBy: { ordem: 'asc' } },
        estoqueItem: { select: { quantidadeAtual: true, estoqueMinimo: true } },
        negocio: { select: { id: true, nome: true } },
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
    const existing = await this.findOne(negocioId, id);

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
    if (dto.precoCusto !== undefined) {
      await this.prisma.estoqueItem.updateMany({
        where: { produtoId: id },
        data: { precoCusto: dto.precoCusto },
      });
    }

    if (dto.controlaEstoque !== undefined && dto.controlaEstoque !== existing.controlaEstoque) {
      if (dto.controlaEstoque === true) {
        const existingItem = await this.prisma.estoqueItem.findFirst({
          where: { produtoId: id },
        });
        if (!existingItem) {
          const config = await this.prisma.configuracaoNegocio.findUnique({
            where: { negocioId },
          });
          await this.prisma.estoqueItem.create({
            data: {
              negocioId,
              produtoId: id,
              quantidadeAtual: 0,
              estoqueMinimo: config?.estoqueMinimoPadrao ?? 5,
              precoCusto: dto.precoCusto ?? existing.precoCusto ?? undefined,
            },
          });
        }
      } else {
        await this.prisma.estoqueItem.deleteMany({ where: { produtoId: id } });
      }
    }

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

  async buscarPorCodigoBarrasPDV(codigo: string) {
    const candidatosToledo = this.parseToledoBarcode(codigo);

    let produto: any;

    // Tenta cada formato Toledo até achar um produto
    if (candidatosToledo.length) {
      for (const fmt of candidatosToledo) {
        produto = await this.prisma.produto.findFirst({
          where: { plu: fmt.plu, status: 'ATIVO' },
          include: {
            categoria: true,
            negocio: { select: { id: true, nome: true } },
            imagens: { orderBy: { ordem: 'asc' } },
            gruposModificadores: { include: { opcoes: true }, orderBy: { ordem: 'asc' } },
            estoqueItem: { select: { quantidadeAtual: true, estoqueMinimo: true } },
          },
        });
        if (produto) {
          produto = { ...produto, preco: fmt.preco };
          break;
        }
      }
    }

    if (!produto) {
      // 1. Busca por codigoBarras
      produto = await this.prisma.produto.findFirst({
        where: { codigoBarras: codigo, status: 'ATIVO' },
        include: {
          categoria: true,
          negocio: { select: { id: true, nome: true } },
          imagens: { orderBy: { ordem: 'asc' } },
          gruposModificadores: { include: { opcoes: true }, orderBy: { ordem: 'asc' } },
          estoqueItem: { select: { quantidadeAtual: true, estoqueMinimo: true } },
        },
      });

      // 2. Fallback: busca por PLU (códigos curtos digitados manualmente)
      if (!produto && /^\d{1,10}$/.test(codigo)) {
        const pluNum = parseInt(codigo, 10);
        if (!isNaN(pluNum)) {
          produto = await this.prisma.produto.findFirst({
            where: { plu: pluNum, status: 'ATIVO' },
            include: {
              categoria: true,
              negocio: { select: { id: true, nome: true } },
              imagens: { orderBy: { ordem: 'asc' } },
              gruposModificadores: { include: { opcoes: true }, orderBy: { ordem: 'asc' } },
              estoqueItem: { select: { quantidadeAtual: true, estoqueMinimo: true } },
            },
          });
        }
      }
    }

    if (!produto) throw new NotFoundException('Produto não encontrado para este código');
    this.normalizeImagens(produto);
    return produto;
  }

  private parseToledoBarcode(codigo: string): { plu: number; preco: number }[] {
    const resultados: { plu: number; preco: number }[] = [];

    if (!codigo || codigo.length < 13 || codigo[0] !== '2') return resultados;

    // Formato A: 2 + 5(PLU) + 5(preço) + 2(verificador) = 13
    // Balanças mais antigas/padrão
    const plu5 = parseInt(codigo.substring(1, 6), 10);
    const preco5 = parseInt(codigo.substring(6, 11), 10);
    if (!isNaN(plu5) && !isNaN(preco5)) {
      resultados.push({ plu: plu5, preco: preco5 / 100 });
    }

    // Formato B: 2 + 4(PLU) + 7(preço centavos) + 2(verificador) = 13
    // Balanças Toledo/Lund novas (ex: PLU=100, R$5,12 → 2010000005125)
    const plu4 = parseInt(codigo.substring(1, 5), 10);
    const preco7 = parseInt(codigo.substring(5, 12), 10);
    if (!isNaN(plu4) && !isNaN(preco7)) {
      resultados.push({ plu: plu4, preco: preco7 / 100 });
    }

    return resultados;
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
        configuracoes: { select: { taxaFrete: true, endereco: true, telefoneContato: true, horarioFuncionamento: true } },
        taxasFreteBairro: { where: { ativo: true }, select: { bairro: true, taxa: true } },
      },
    });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');

    const aberto = this.verificarAberto(negocio.configuracoes?.horarioFuncionamento as any);

    const cacheKey = `catalog:v2:${negocio.id}:products`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      data.aberto = aberto;
      return data;
    }

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
    const result = { negocio, categorias: Array.from(categoriasMap.values()), produtos, aberto };
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  private verificarAberto(horario: { dias?: { abertura: string; fechamento: string; fechado: boolean }[] } | null): boolean {
    if (!horario?.dias?.length) return true;

    const agora = new Date();
    const hoje = horario.dias[agora.getDay()];
    if (!hoje || hoje.fechado) return false;

    const minutosAtual = agora.getHours() * 60 + agora.getMinutes();
    const [hInicio, mInicio] = (hoje.abertura || '00:00').split(':').map(Number);
    const [hFim, mFim] = (hoje.fechamento || '23:59').split(':').map(Number);

    return minutosAtual >= (hInicio * 60 + mInicio) && minutosAtual <= (hFim * 60 + mFim);
  }
}
