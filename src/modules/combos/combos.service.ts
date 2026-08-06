import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { CriarComboDto } from './dto/criar-combo.dto';
import { AtualizarComboDto } from './dto/atualizar-combo.dto';

@Injectable()
export class CombosService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private async invalidarVitrine(negocioId: string) {
    try {
      await this.redis.del(`catalog:v2:${negocioId}:products`);
    } catch {
      // cache indisponível — ok
    }
  }

  async criar(negocioId: string, dto: CriarComboDto) {
    const combo = await this.prisma.combo.create({
      data: {
        ...dto,
        negocioId,
        preco: dto.preco,
        itens: {
          create: dto.itens.map((i) => ({
            produtoId: i.produtoId,
            quantidade: i.quantidade ?? 1,
          })),
        },
      },
      include: { itens: { include: { produto: { select: { id: true, nome: true, preco: true } } } } },
    });
    await this.invalidarVitrine(negocioId);
    return combo;
  }

  async listar(negocioId: string, apenasAtivos = false) {
    return this.prisma.combo.findMany({
      where: { negocioId, ...(apenasAtivos ? { ativo: true } : {}) },
      orderBy: [{ destaque: 'desc' }, { ordem: 'asc' }, { criadoEm: 'desc' }],
      include: {
        categoria: true,
        itens: { include: { produto: { select: { id: true, nome: true, preco: true, imagens: { take: 1 } } } } },
      },
    });
  }

  async buscar(id: string, negocioId: string) {
    const combo = await this.prisma.combo.findFirst({
      where: { id, negocioId },
      include: { itens: { include: { produto: { select: { id: true, nome: true, preco: true } } } } },
    });
    if (!combo) throw new NotFoundException('Combo não encontrado');
    return combo;
  }

  async atualizar(negocioId: string, id: string, dto: AtualizarComboDto) {
    await this.buscar(id, negocioId);
    const { itens, ...data } = dto;
    const updateData: any = { ...data };
    if (itens) {
      updateData.itens = {
        deleteMany: {},
        create: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade ?? 1 })),
      };
    }
    const combo = await this.prisma.combo.update({
      where: { id },
      data: updateData,
      include: { itens: { include: { produto: { select: { id: true, nome: true, preco: true } } } } },
    });
    await this.invalidarVitrine(negocioId);
    return combo;
  }

  async remover(negocioId: string, id: string) {
    await this.buscar(id, negocioId);
    await this.prisma.combo.delete({ where: { id } });
    await this.invalidarVitrine(negocioId);
    return { removido: true };
  }

  async salvarImagem(negocioId: string, id: string, imagemUrl: string) {
    await this.buscar(id, negocioId);
    return this.prisma.combo.update({ where: { id }, data: { imagemUrl } });
  }
}
