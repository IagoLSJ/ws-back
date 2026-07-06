import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Auditoria')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/auditoria')
export class AuditController {
  constructor(private service: AuditService) {}

  @Get()
  @Roles(RoleNegocio.GERENTE, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar logs de auditoria do negócio' })
  listar(
    @Param('businessId') negocioId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('acao') acao?: string,
    @Query('usuarioId') usuarioId?: string,
  ) {
    return this.service.listar(negocioId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      acao,
      usuarioId,
    });
  }
}
