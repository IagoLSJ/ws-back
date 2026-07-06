import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async listar(negocioId: string, query?: { page?: number; limit?: number; acao?: string; usuarioId?: string }) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { negocioId };
    if (query?.acao) where.acao = { contains: query.acao, mode: 'insensitive' };
    if (query?.usuarioId) where.usuarioId = query.usuarioId;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip,
        take: limit,
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
