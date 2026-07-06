import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { RelatoriosService } from './relatorios.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Relatórios')
@Controller('negocios/:businessId/relatorios')
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@ApiBearerAuth()
export class RelatoriosController {
  constructor(private relatorios: RelatoriosService) {}

  @Get('inventario')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Exportar relatório de inventário (CSV)' })
  inventario(@Res() res: Response) {
    const businessId = (res.req as any).params.businessId;
    return this.relatorios.inventario(businessId, res);
  }

  @Get('vendas')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Exportar relatório de vendas (CSV)' })
  @ApiQuery({ name: 'dataInicio', required: false })
  @ApiQuery({ name: 'dataFim', required: false })
  vendas(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    const businessId = (res.req as any).params.businessId;
    return this.relatorios.vendasCSV(businessId, res, dataInicio, dataFim);
  }

  @Get('financeiro')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Exportar relatório financeiro (CSV)' })
  @ApiQuery({ name: 'dataInicio', required: false })
  @ApiQuery({ name: 'dataFim', required: false })
  financeiro(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    const businessId = (res.req as any).params.businessId;
    return this.relatorios.financeiroCSV(businessId, res, dataInicio, dataFim);
  }

  @Get('pedidos')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Exportar relatório de pedidos (CSV)' })
  @ApiQuery({ name: 'dataInicio', required: false })
  @ApiQuery({ name: 'dataFim', required: false })
  @ApiQuery({ name: 'status', required: false })
  pedidos(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('status') status?: string,
  ) {
    const businessId = (res.req as any).params.businessId;
    return this.relatorios.pedidosCSV(businessId, res, dataInicio, dataFim, status);
  }

  @Get('estoque')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Exportar relatório de estoque resumido (CSV)' })
  estoque(@Res() res: Response) {
    const businessId = (res.req as any).params.businessId;
    return this.relatorios.estoqueResumido(businessId, res);
  }

  @Get('resumo-financeiro')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resumo financeiro (JSON) para gráficos' })
  @ApiQuery({ name: 'dataInicio', required: false })
  @ApiQuery({ name: 'dataFim', required: false })
  resumoFinanceiro(
    @Param('businessId') negocioId: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.relatorios.resumoFinanceiro(negocioId, dataInicio, dataFim);
  }
}
