import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { RedisService } from '../../infra/cache/redis.service';
import { CriarNegocioDto } from './dto/criar-negocio.dto';
import { AtualizarNegocioDto } from './dto/atualizar-negocio.dto';
import { AtualizarConfiguracaoDto } from './dto/atualizar-configuracao.dto';
import { CriarTaxaFreteBairroDto, AtualizarTaxaFreteBairroDto } from './dto/gerenciar-taxa-frete-bairro.dto';
import { RoleNegocio } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NegociosService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private redis: RedisService,
  ) {}

  async create(dto: CriarNegocioDto, usuarioId: string) {
    const slug =
      dto.slug ||
      dto.nome
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

    const existing = await this.prisma.negocio.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Slug já em uso');

    return this.prisma.negocio.create({
      data: {
        nome: dto.nome,
        slug,
        descricao: dto.descricao,
        tipo: dto.tipo,
        configuracoes: {
          create: {
            controleEstoqueAtivo: true,
            estoqueMinimoPadrao: 5,
          },
        },
        membros: {
          create: {
            usuarioId,
            role: RoleNegocio.SUPER_ADMIN,
          },
        },
      },
    });
  }

  async findAll(usuarioId?: string) {
    const where: any = {};
    if (usuarioId) {
      const isSuper = await this.prisma.membroNegocio.findFirst({
        where: { usuarioId, role: 'SUPER_ADMIN', ativo: true },
      });
      if (!isSuper) {
        where.membros = { some: { usuarioId, ativo: true } };
      }
    }
    return this.prisma.negocio.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      include: {
        _count: { select: { membros: true, produtos: true, categorias: true, pedidos: true } },
      },
    });
  }

  async findOne(id: string) {
    const negocio = await this.prisma.negocio.findUnique({
      where: { id },
      include: {
        configuracoes: true,
        _count: { select: { membros: true, produtos: true, categorias: true, pedidos: true } },
      },
    });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');
    return negocio;
  }

  async findOneBySlug(slug: string) {
    const negocio = await this.prisma.negocio.findUnique({
      where: { slug, ativo: true },
      include: { configuracoes: true },
    });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');
    return negocio;
  }

  async update(id: string, dto: AtualizarNegocioDto) {
    await this.findOne(id);

    const data: any = { ...dto };
    if (dto.slug) {
      const existing = await this.prisma.negocio.findUnique({ where: { slug: dto.slug } });
      if (existing && existing.id !== id) throw new ConflictException('Slug já em uso');
    }

    await this.redis.del(`catalog:v2:${id}:products`);
    return this.prisma.negocio.update({ where: { id }, data });
  }

  async updateConfig(id: string, dto: AtualizarConfiguracaoDto) {
    await this.findOne(id);
    const data: any = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) data[key] = value;
    }

    if (dto.estoqueMinimoPadrao !== undefined) {
      await this.prisma.estoqueItem.updateMany({
        where: { negocioId: id },
        data: { estoqueMinimo: dto.estoqueMinimoPadrao },
      });
    }

    // Invalida cache da vitrine
    await this.redis.del(`catalog:v2:${id}:products`);

    return this.prisma.configuracaoNegocio.upsert({
      where: { negocioId: id },
      create: { negocioId: id, ...data },
      update: data,
    });
  }

  async remove(id: string) {
    const negocio = await this.findOne(id);
    if (negocio.ativo) {
      throw new BadRequestException('Desative o negócio antes de removê-lo');
    }

    const produtoIds = (
      await this.prisma.produto.findMany({ where: { negocioId: id }, select: { id: true } })
    ).map((p) => p.id);

    if (produtoIds.length) {
      const refEmOutros = await this.prisma.pedidoItem.findFirst({
        where: { produtoId: { in: produtoIds }, pedido: { negocioId: { not: id } } },
        select: { id: true },
      });
      if (refEmOutros) {
        throw new BadRequestException(
          'Este negócio possui produtos usados em pedidos de outros negócios e não pode ser removido',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const carrinhos = await tx.carrinho.findMany({ where: { negocioId: id }, select: { id: true } });
      const cIds = carrinhos.map((c) => c.id);
      if (cIds.length) {
        await tx.carrinhoItem.deleteMany({ where: { carrinhoId: { in: cIds } } });
        await tx.carrinho.deleteMany({ where: { id: { in: cIds } } });
      }

      const pedidos = await tx.pedido.findMany({ where: { negocioId: id }, select: { id: true } });
      const pIds = pedidos.map((p) => p.id);
      if (pIds.length) {
        await tx.caixaMovimento.deleteMany({ where: { pedidoId: { in: pIds } } });
        await tx.pedidoItem.deleteMany({ where: { pedidoId: { in: pIds } } });
        await tx.pagamento.deleteMany({ where: { pedidoId: { in: pIds } } });
        await tx.pedido.deleteMany({ where: { id: { in: pIds } } });
      }

      await tx.movimentacaoEstoque.deleteMany({ where: { negocioId: id } });
      await tx.contaReceber.deleteMany({ where: { negocioId: id } });
      await tx.negocio.delete({ where: { id } });
    });

    await this.redis.del(`catalog:v2:${id}:products`).catch(() => {});

    return { message: 'Negócio removido' };
  }

  async listarAtivos() {
    return this.prisma.negocio.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, slug: true, logoUrl: true },
      orderBy: { nome: 'asc' },
    });
  }

  async requestLogoUploadUrl(id: string, fileName: string) {
    await this.findOne(id);

    const ext = fileName.split('.').pop();
    const key = `logos/${id}/${uuidv4()}.${ext}`;
    const url = await this.storage.getPresignedUploadUrl(key);

    return { url, key };
  }

  async confirmLogoUpload(id: string, key: string) {
    await this.findOne(id);

    return this.prisma.negocio.update({
      where: { id },
      data: { logoUrl: this.storage.getPublicUrl(key) },
    });
  }

  async deleteLogo(id: string) {
    const negocio = await this.findOne(id);
    if (!negocio.logoUrl) return;

    const key = this.storage.extractKey(negocio.logoUrl);
    if (key) this.storage.deleteObject(key).catch(() => {});
    await this.prisma.negocio.update({ where: { id }, data: { logoUrl: undefined } });
  }

  async requestCardapioImagemUploadUrl(id: string, fileName: string) {
    await this.findOne(id);

    const ext = fileName.split('.').pop();
    const key = `cardapios/${id}/${uuidv4()}.${ext}`;
    const url = await this.storage.getPresignedUploadUrl(key);

    return { url, key };
  }

  async confirmCardapioImagemUpload(id: string, key: string) {
    await this.findOne(id);

    const publicUrl = this.storage.getPublicUrl(key);
    const atual = await this.prisma.configuracaoNegocio.findUnique({ where: { negocioId: id } });
    const imagens = Array.isArray(atual?.cardapioImagens) ? (atual.cardapioImagens as string[]) : [];

    return this.prisma.configuracaoNegocio.upsert({
      where: { negocioId: id },
      create: { negocioId: id, cardapioImagens: [publicUrl] },
      update: { cardapioImagens: [...imagens, publicUrl] },
    });
  }

  async deleteCardapioImagem(id: string, index: number) {
    const config = await this.prisma.configuracaoNegocio.findUnique({ where: { negocioId: id } });
    if (!config?.cardapioImagens) return;

    const imagens = config.cardapioImagens as string[];
    if (index < 0 || index >= imagens.length) return;

    const removida = imagens[index];
    const key = this.storage.extractKey(removida);
    if (key) this.storage.deleteObject(key).catch(() => {});

    const restantes = imagens.filter((_, i) => i !== index);
    await this.prisma.configuracaoNegocio.update({
      where: { negocioId: id },
      data: { cardapioImagens: restantes.length ? restantes : undefined },
    });
  }

  async listarTaxasFreteBairro(negocioId: string) {
    return this.prisma.taxaFreteBairro.findMany({
      where: { negocioId },
      orderBy: { bairro: 'asc' },
    });
  }

  async criarTaxaFreteBairro(negocioId: string, dto: CriarTaxaFreteBairroDto) {
    return this.prisma.taxaFreteBairro.create({
      data: { negocioId, bairro: dto.bairro, taxa: dto.taxa },
    });
  }

  async atualizarTaxaFreteBairro(id: string, dto: AtualizarTaxaFreteBairroDto) {
    const data: any = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) data[key] = value;
    }
    return this.prisma.taxaFreteBairro.update({ where: { id }, data });
  }

  async removerTaxaFreteBairro(id: string) {
    return this.prisma.taxaFreteBairro.delete({ where: { id } });
  }
}
