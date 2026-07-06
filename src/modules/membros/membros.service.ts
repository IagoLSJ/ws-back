import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { ConvidarMembroDto } from './dto/convidar-membro.dto';
import { AtualizarMembroDto } from './dto/atualizar-membro.dto';
import { RoleNegocio } from '@prisma/client';

@Injectable()
export class MembrosService {
  constructor(private prisma: PrismaService) {}

  async convidar(negocioId: string, dto: ConvidarMembroDto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (!usuario) throw new NotFoundException('Usuário não encontrado com este e-mail');

    if (dto.role === RoleNegocio.SUPER_ADMIN) {
      throw new ForbiddenException('Não é possível atribuir SUPER_ADMIN');
    }

    const existing = await this.prisma.membroNegocio.findUnique({
      where: { usuarioId_negocioId: { usuarioId: usuario.id, negocioId } },
    });

    if (existing) throw new ConflictException('Usuário já é membro deste negócio');

    return this.prisma.membroNegocio.create({
      data: {
        usuarioId: usuario.id,
        negocioId,
        role: dto.role,
      },
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
      },
    });
  }

  async findAll(negocioId: string) {
    return this.prisma.membroNegocio.findMany({
      where: { negocioId },
      include: {
        usuario: { select: { id: true, nome: true, email: true, avatarUrl: true } },
      },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async update(negocioId: string, membroId: string, dto: AtualizarMembroDto) {
    const membro = await this.prisma.membroNegocio.findFirst({
      where: { id: membroId, negocioId },
    });
    if (!membro) throw new NotFoundException('Membro não encontrado');

    if (dto.role === RoleNegocio.SUPER_ADMIN) {
      throw new ForbiddenException('Não é possível atribuir SUPER_ADMIN');
    }

    return this.prisma.membroNegocio.update({
      where: { id: membroId },
      data: { role: dto.role, ativo: dto.ativo },
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
      },
    });
  }

  async remove(negocioId: string, membroId: string) {
    const membro = await this.prisma.membroNegocio.findFirst({
      where: { id: membroId, negocioId },
    });
    if (!membro) throw new NotFoundException('Membro não encontrado');

    await this.prisma.membroNegocio.delete({ where: { id: membroId } });
  }
}
