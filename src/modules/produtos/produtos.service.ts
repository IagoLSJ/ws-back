import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { StorageService } from '../../infra/storage/storage.service';
import { CriarProdutoDto } from './dto/criar-produto.dto';
import { AtualizarProdutoDto } from './dto/atualizar-produto.dto';
import { AjusteMassaProdutoDto, CampoAjusteMassa, OperacaoAjusteMassa, TipoAjusteMassa } from './dto/ajuste-massa-produto.dto';
import { v4 as uuidv4 } from 'uuid';
import { verificarAbertoEm } from '../../common/utils/horario';
import { RoleNegocio } from '@prisma/client';

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

  private async invalidatePDVCache() {
    try {
      await this.redis.del('pdv:produtos:v1');
    } catch {
      // cache indisponível — ok
    }
  }

  private normalizeImagens(produto: any): void {
    if (produto.imagens) {
      for (const img of produto.imagens) {
        img.url = this.storage.normalizeUrl(img.url);
      }
    }
  }

  private validarGruposModificadores(grupos: { nome?: string; opcoes?: { nome?: string }[] }[] | undefined): void {
    if (!grupos?.length) return;

    const nomesGrupos = grupos.map((g) => (g.nome || '').trim().toLowerCase());
    for (let i = 0; i < nomesGrupos.length; i++) {
      if (nomesGrupos[i] && nomesGrupos.indexOf(nomesGrupos[i]) !== i) {
        throw new BadRequestException(`O produto possui grupos de modificadores com o mesmo nome: "${grupos[i].nome}"`);
      }
    }

    for (const g of grupos) {
      const nomesOpcoes = (g.opcoes || []).map((o) => (o.nome || '').trim().toLowerCase());
      for (let i = 0; i < nomesOpcoes.length; i++) {
        if (nomesOpcoes[i] && nomesOpcoes.indexOf(nomesOpcoes[i]) !== i) {
          throw new BadRequestException(
            `O grupo "${g.nome}" possui opções duplicadas: "${g.opcoes?.[i]?.nome}"`,
          );
        }
      }
    }
  }

  async create(negocioId: string, dto: CriarProdutoDto) {
    if (dto.plu) {
      const comPlu = await this.prisma.produto.findFirst({
        where: { negocioId, plu: dto.plu },
        select: { id: true },
      });
      if (comPlu) throw new BadRequestException(`O PLU ${dto.plu} já está em uso por outro produto`);
    }

    this.validarGruposModificadores(dto.gruposModificadores);

    const produto = await this.prisma.produto.create({
      data: {
        negocioId,
        categoriaId: dto.categoriaId,
        nome: dto.nome,
        descricao: dto.descricao,
        marca: dto.marca,
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
        vendaPorPeso: dto.vendaPorPeso ?? false,
        unidadeMedida: dto.unidadeMedida,
        ncm: dto.ncm,
        cfop: dto.cfop,
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
    await this.invalidatePDVCache();

    if (produto.controlaEstoque) {
      const config = await this.prisma.configuracaoNegocio.findUnique({
        where: { negocioId },
      });
      await this.prisma.estoqueItem.create({
        data: {
          negocioId,
          produtoId: produto.id,
          quantidadeAtual: dto.quantidadeAtual ?? 0,
          estoqueMinimo: dto.estoqueMinimo ?? config?.estoqueMinimoPadrao ?? 5,
          precoCusto: dto.precoCusto ?? undefined,
          unidade: dto.unidade ?? dto.unidadeMedida ?? 'un',
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

  /**
   * Filtro de localidade do PDV. SUPER_ADMIN não tem filtro (vê tudo);
   * os demais vêem apenas produtos do próprio negócio ou de negócios da mesma cidade.
   */
  private async filtroLocalPDV(negocioId: string, role?: string) {
    if (role === RoleNegocio.SUPER_ADMIN) return {};

    const negocio = await this.prisma.negocio.findUnique({
      where: { id: negocioId },
      select: { cidade: true },
    });

    if (negocio?.cidade) {
      return { OR: [{ negocioId }, { negocio: { cidade: negocio.cidade } }] };
    }

    return { negocioId };
  }

  async findAllPDV(negocioId?: string, role?: string) {
    const cacheKey = negocioId ? `pdv:produtos:${negocioId}:v1` : 'pdv:produtos:v1';
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // cache corrompido — segue para recarregar
      }
    }

    const where: any = {
      status: 'ATIVO',
      OR: [
        { controlaEstoque: false },
        { estoqueItem: { quantidadeAtual: { gt: 0 } } },
      ],
    };
    if (negocioId) {
      where.AND = [await this.filtroLocalPDV(negocioId, role)];
    }

    const produtos = await this.prisma.produto.findMany({
      where,
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

    try {
      await this.redis.setex(cacheKey, 60, JSON.stringify(produtos));
    } catch {
      // cache indisponível — ok
    }
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

    if (dto.plu) {
      const comPlu = await this.prisma.produto.findFirst({
        where: { negocioId, plu: dto.plu, NOT: { id } },
        select: { id: true },
      });
      if (comPlu) throw new BadRequestException(`O PLU ${dto.plu} já está em uso por outro produto`);
    }

    this.validarGruposModificadores(dto.gruposModificadores);

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
              quantidadeAtual: dto.quantidadeAtual ?? 0,
              estoqueMinimo: dto.estoqueMinimo ?? config?.estoqueMinimoPadrao ?? 5,
              precoCusto: dto.precoCusto ?? existing.precoCusto ?? undefined,
              unidade: dto.unidade ?? dto.unidadeMedida ?? 'un',
            },
          });
        }
      } else {
        await this.prisma.estoqueItem.deleteMany({ where: { produtoId: id } });
      }
    }

    await this.invalidateCache(negocioId);
    await this.invalidatePDVCache();
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
    await this.invalidatePDVCache();
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

        const imagem = await this.prisma.imagemProduto.create({
      data: {
        produtoId,
        url: this.storage.getPublicUrl(key),
        ordem: 0,
        principal: true,
      },
    });

    // Invalida o cache da vitrine/catálogo público para a foto aparecer
    await this.invalidateCache(negocioId);

    return imagem;
  }

  async buscarPorCodigoBarras(negocioId: string, codigo: string) {    const produto = await this.prisma.produto.findFirst({
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

  async buscarPorCodigoBarrasPDV(codigo: string, negocioId?: string, role?: string) {
    const candidatosToledo = this.parseToledoBarcode(codigo);
    const local = negocioId ? await this.filtroLocalPDV(negocioId, role) : {};

    let produto: any;

    // Tenta cada formato Toledo até achar um produto
    if (candidatosToledo.length) {
      for (const fmt of candidatosToledo) {
        produto = await this.prisma.produto.findFirst({
          where: { plu: fmt.plu, status: 'ATIVO', ...local },
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
        where: { codigoBarras: codigo, status: 'ATIVO', ...local },
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
            where: { plu: pluNum, status: 'ATIVO', ...local },
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
    if (produto.controlaEstoque && Number(produto.estoqueItem?.quantidadeAtual ?? 0) <= 0) {
      throw new NotFoundException('Produto não encontrado para este código');
    }
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
        configuracoes: { select: { taxaFrete: true, endereco: true, telefoneContato: true, horarioFuncionamento: true, taxaCartaoFaixas: true } },
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
        OR: [
          { controlaEstoque: false },
          { estoqueItem: { quantidadeAtual: { gt: 0 } } },
        ],
      },
      orderBy: [{ destaque: 'desc' }, { ordem: 'asc' }, { criadoEm: 'desc' }],
      include: {
        categoria: { select: { id: true, nome: true, ordem: true } },
        imagens: { where: { principal: true }, take: 1 },
        gruposModificadores: {
          include: { opcoes: { where: { ativo: true } } },
          orderBy: { ordem: 'asc' },
        },
      },
    });

    const categoriasMap = new Map<string, { id: string; nome: string; ordem: number }>();
    for (const p of produtos) {
      if (p.categoria && !categoriasMap.has(p.categoria.id)) {
        categoriasMap.set(p.categoria.id, p.categoria);
      }
    }

    for (const p of produtos) this.normalizeImagens(p);
    const combos = await this.prisma.combo.findMany({
      where: { negocioId: negocio.id, ativo: true },
      orderBy: [{ destaque: 'desc' }, { ordem: 'asc' }, { criadoEm: 'desc' }],
      include: {
        categoria: { select: { id: true, nome: true, ordem: true } },
        itens: { include: { produto: { select: { id: true, nome: true, preco: true } } } },
      },
    });

    const result = { negocio, categorias: Array.from(categoriasMap.values()).sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999)), produtos, combos, aberto };
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  private verificarAberto(horario: { dias?: { abertura: string; fechamento: string; fechado: boolean }[] } | null): boolean {
    return verificarAbertoEm(horario as any, new Date());
  }

  async ajustarPrecosEmMassa(negocioId: string, dto: AjusteMassaProdutoDto) {
    const { busca, categoriaId, ids, tipo, operacao, valor, aplicarEm } = dto;

    const where: any = { negocioId };
    if (ids?.length) {
      where.id = { in: ids };
    } else {
      const or: any[] = [];
      if (busca?.trim()) {
        const termo = busca.trim();
        or.push({ nome: { contains: termo, mode: 'insensitive' } });
        or.push({ sku: { contains: termo, mode: 'insensitive' } });
      }
      if (categoriaId) {
        where.categoriaId = categoriaId;
      }
      if (or.length) where.OR = or;
    }

    const produtos = await this.prisma.produto.findMany({
      where,
      select: { id: true, nome: true, preco: true, precoCusto: true },
    });

    if (!produtos.length) {
      throw new BadRequestException('Nenhum produto encontrado para o ajuste');
    }

    const aplicarPreco = aplicarEm === CampoAjusteMassa.PRECO || aplicarEm === CampoAjusteMassa.AMBOS;
    const aplicarCusto = aplicarEm === CampoAjusteMassa.CUSTO || aplicarEm === CampoAjusteMassa.AMBOS;

    const resumo: any[] = [];
    const updates: Promise<any>[] = [];

    for (const p of produtos) {
      const novoPreco = aplicarPreco ? this.calcularAjuste(Number(p.preco), tipo, operacao, valor) : Number(p.preco);
      const novoCusto = aplicarCusto && p.precoCusto != null
        ? this.calcularAjuste(Number(p.precoCusto), tipo, operacao, valor)
        : p.precoCusto;

      if (aplicarPreco && aplicarCusto && novoPreco === Number(p.preco) && novoCusto === Number(p.precoCusto)) {
        continue;
      }
      if (aplicarPreco && !aplicarCusto && novoPreco === Number(p.preco)) {
        continue;
      }
      if (aplicarCusto && !aplicarPreco && (p.precoCusto == null || novoCusto === Number(p.precoCusto))) {
        continue;
      }

      const data: any = {};
      if (aplicarPreco) data.preco = novoPreco;
      if (aplicarCusto) data.precoCusto = novoCusto;

      updates.push(
        this.prisma.produto.update({
          where: { id: p.id },
          data,
        }).then(() => {
          if (aplicarCusto) {
            return this.prisma.estoqueItem.updateMany({
              where: { produtoId: p.id },
              data: { precoCusto: novoCusto },
            });
          }
        }),
      );

      resumo.push({
        id: p.id,
        nome: p.nome,
        precoAntes: Number(p.preco),
        precoNovo: aplicarPreco ? novoPreco : undefined,
        custoAntes: p.precoCusto != null ? Number(p.precoCusto) : undefined,
        custoNovo: aplicarCusto && p.precoCusto != null ? novoCusto : undefined,
      });
    }

    await Promise.all(updates);

    if (resumo.length) {
      await this.invalidateCache(negocioId);
      await this.invalidatePDVCache();
    }

    return {
      atualizados: resumo.length,
      totalEncontrados: produtos.length,
      resumo: resumo.slice(0, 100),
    };
  }

  private calcularAjuste(
    valorBase: number,
    tipo: TipoAjusteMassa,
    operacao: OperacaoAjusteMassa,
    valor: number,
  ): number {
    if (!valor) return valorBase;
    let novo = valorBase;
    if (tipo === TipoAjusteMassa.PERCENTUAL) {
      const fator = valor / 100;
      novo = operacao === OperacaoAjusteMassa.SUBTRAIR
        ? valorBase * (1 - fator)
        : valorBase * (1 + fator);
    } else {
      novo = operacao === OperacaoAjusteMassa.SUBTRAIR
        ? valorBase - valor
        : valorBase + valor;
    }
    return Math.round(Math.max(0, novo) * 100) / 100;
  }
}
