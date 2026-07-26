import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { CriarComboDto } from './dto/criar-combo.dto';
import { AtualizarComboDto } from './dto/atualizar-combo.dto';

@Injectable()
export class CombosService {
  constructor(private prisma: PrismaService) {}

  async criar(negocioId: string, dto: CriarComboDto) {
    const { itens, ...data } = dto;
    return this.prisma.combo.create({
      data: {
        ...data,
        negocioId,
        preco: dto.preco,
        itens: {
          create: itens.map((i) => ({
            produtoId: i.produtoId,
            quantidade: i.quantidade ?? 1,
          })),
        },
      },
      include: { itens: { include: { produto: { select: { id: true, nome: true, preco: true } } } } },
    });
  }

  async listar(negocioId: string, apenasAtivos = false) {
    return this.prisma.combo.findMany({
      where: { negocioId, ...(apenasAtivos ? { ativo: true } : {}) },
      orderBy: [{ destaque: 'desc' }, { ordem: 'asc' }, { criadoEm: 'desc' }],
      include: { itens: { include: { produto: { select: { id: true, nome: true, preco: true, imagens: { take: 1 } } } } } },
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
    return this.prisma.combo.update({
      where: { id },
      data: updateData,
      include: { itens: { include: { produto: { select: { id: true, nome: true, preco: true } } } } },
    });
  }

  async remover(negocioId: string, id: string) {
    await this.buscar(id, negocioId);
    await this.prisma.combo.delete({ where: { id } });
    return { removido: true };
  }

  async salvarImagem(negocioId: string, id: string, imagemUrl: string) {
    await this.buscar(id, negocioId);
    return this.prisma.combo.update({ where: { id }, data: { imagemUrl } });
  }
}
