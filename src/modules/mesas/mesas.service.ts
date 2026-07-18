import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { CriarMesaDto } from './dto/criar-mesa.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class MesasService {
  constructor(private prisma: PrismaService) {}

  async criar(negocioId: string, dto: CriarMesaDto) {
    const negocio = await this.prisma.negocio.findUnique({
      where: { id: negocioId },
      select: { tipo: true },
    });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');
    if (negocio.tipo !== 'COMIDA') {
      throw new BadRequestException('Mesas só estão disponíveis para negócios de comida');
    }

    const mesa = await this.prisma.mesa.create({
      data: {
        negocioId,
        numero: dto.numero,
        nome: dto.nome,
        qrCodeToken: randomUUID(),
      },
    });

    return mesa;
  }

  async listar(negocioId: string) {
    return this.prisma.mesa.findMany({
      where: { negocioId },
      orderBy: { numero: 'asc' },
    });
  }

  async atualizar(negocioId: string, id: string, dto: Partial<CriarMesaDto> & { ativa?: boolean }) {
    const mesa = await this.prisma.mesa.findFirst({
      where: { id, negocioId },
    });
    if (!mesa) throw new NotFoundException('Mesa não encontrada');

    return this.prisma.mesa.update({
      where: { id },
      data: dto,
    });
  }

  async remover(negocioId: string, id: string) {
    const mesa = await this.prisma.mesa.findFirst({
      where: { id, negocioId },
    });
    if (!mesa) throw new NotFoundException('Mesa não encontrada');

    await this.prisma.mesa.delete({ where: { id } });
    return { removido: true };
  }

  async ocupar(negocioId: string, id: string) {
    const mesa = await this.prisma.mesa.findFirst({
      where: { id, negocioId, ativa: true },
    });
    if (!mesa) throw new NotFoundException('Mesa não encontrada ou inativa');
    if (mesa.status === 'OCUPADA') throw new BadRequestException('Mesa já está ocupada');

    const sessionId = randomUUID();

    await this.prisma.mesa.update({
      where: { id },
      data: {
        status: 'OCUPADA',
        sessionId,
      },
    });

    const slug = await this.prisma.negocio.findUnique({
      where: { id: negocioId },
      select: { slug: true },
    });

    return {
      mesaId: mesa.id,
      numero: mesa.numero,
      sessionId,
      qrUrl: slug ? `/vitrine/${slug.slug}?mesaToken=${mesa.qrCodeToken}` : undefined,
    };
  }

  async liberar(negocioId: string, id: string) {
    const mesa = await this.prisma.mesa.findFirst({
      where: { id, negocioId },
    });
    if (!mesa) throw new NotFoundException('Mesa não encontrada');
    if (mesa.status !== 'OCUPADA') throw new BadRequestException('Mesa não está ocupada');

    await this.prisma.mesa.update({
      where: { id },
      data: {
        status: 'LIVRE',
        sessionId: null,
      },
    });

    return { mesaId: mesa.id, numero: mesa.numero, status: 'LIVRE' };
  }

  async validarMesaPorToken(slug: string, token: string) {
    const negocio = await this.prisma.negocio.findUnique({
      where: { slug, ativo: true },
      select: { id: true, nome: true, slug: true },
    });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');

    const mesa = await this.prisma.mesa.findFirst({
      where: { negocioId: negocio.id, qrCodeToken: token, ativa: true },
    });
    if (!mesa) throw new NotFoundException('Mesa inválida ou inativa');

    return {
      mesaId: mesa.id,
      numero: mesa.numero,
      nome: mesa.nome,
      negocio,
    };
  }
}
