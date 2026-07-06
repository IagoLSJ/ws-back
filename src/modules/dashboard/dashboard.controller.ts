import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get()
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Resumo do dashboard do negócio' })
  resumo(@Param('businessId') negocioId: string) {
    return this.service.resumo(negocioId);
  }

  @Get('faturamento-diario')
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Faturamento diário para gráfico' })
  faturamentoDiario(@Param('businessId') negocioId: string) {
    return this.service.faturamentoDiario(negocioId, 7);
  }
}
