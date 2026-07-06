import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RoleNegocio } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';

@Injectable()
export class BusinessAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const businessId = request.params.businessId || request.params.id;
    const userId = request.user?.id;

    if (!businessId || !userId) return true;

    const isSuperAdmin = await this.prisma.membroNegocio.findFirst({
      where: { usuarioId: userId, role: RoleNegocio.SUPER_ADMIN, ativo: true },
    });

    if (isSuperAdmin) {
      request.user.role = RoleNegocio.SUPER_ADMIN;
      request.user.membershipId = isSuperAdmin.id;
      return true;
    }

    const membership = await this.prisma.membroNegocio.findUnique({
      where: {
        usuarioId_negocioId: {
          usuarioId: userId,
          negocioId: businessId,
        },
      },
    });

    if (!membership || !membership.ativo) {
      throw new ForbiddenException('Acesso negado a este negócio');
    }

    request.user.role = membership.role;
    request.user.membershipId = membership.id;
    return true;
  }
}
