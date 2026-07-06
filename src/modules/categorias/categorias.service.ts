import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { CriarCategoriaDto } from './dto/criar-categoria.dto';
import { AtualizarCategoriaDto } from './dto/atualizar-categoria.dto';

@Injectable()
export class CategoriasService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private cacheKey(negocioId: string) {
    return `catalog:${negocioId}:categories`;
  }

  private async invalidateCache(negocioId: string) {
    await this.redis.del(this.cacheKey(negocioId));
  }

  async create(negocioId: string, dto: CriarCategoriaDto) {
    const existing = await this.prisma.categoria.findUnique({
      where: { negocioId_nome: { negocioId, nome: dto.nome } },
    });
    if (existing) throw new ConflictException('Categoria já existe neste negócio');

    const categoria = await this.prisma.categoria.create({
      data: { ...dto, negocioId },
    });

    await this.invalidateCache(negocioId);
    return categoria;
  }

  async findAll(negocioId: string, apenasAtivas = false) {
    const cacheKey = this.cacheKey(negocioId);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const categorias = await this.prisma.categoria.findMany({
      where: { negocioId, ...(apenasAtivas ? { ativo: true } : {}) },
      orderBy: { ordem: 'asc' },
      include: { _count: { select: { produtos: true } } },
    });

    await this.redis.setex(cacheKey, 300, JSON.stringify(categorias));
    return categorias;
  }

  async update(negocioId: string, id: string, dto: AtualizarCategoriaDto) {
    await this.findOne(negocioId, id);

    const categoria = await this.prisma.categoria.update({
      where: { id },
      data: dto,
    });

    await this.invalidateCache(negocioId);
    return categoria;
  }

  async remove(negocioId: string, id: string) {
    await this.findOne(negocioId, id);
    await this.prisma.categoria.delete({ where: { id } });
    await this.invalidateCache(negocioId);
  }

  private async findOne(negocioId: string, id: string) {
    const categoria = await this.prisma.categoria.findFirst({
      where: { id, negocioId },
    });
    if (!categoria) throw new NotFoundException('Categoria não encontrada');
    return categoria;
  }
}
