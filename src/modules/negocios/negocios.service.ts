import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { CriarNegocioDto } from './dto/criar-negocio.dto';
import { AtualizarNegocioDto } from './dto/atualizar-negocio.dto';
import { AtualizarConfiguracaoDto } from './dto/atualizar-configuracao.dto';
import { RoleNegocio } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NegociosService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
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

    return this.prisma.configuracaoNegocio.upsert({
      where: { negocioId: id },
      create: { negocioId: id, ...data },
      update: data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.negocio.update({ where: { id }, data: { ativo: false } });
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
}
