import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ContasReceberService } from './contas-receber.service';
import { BaixaContaReceberDto } from './dto/baixa-conta-receber.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Contas a Receber')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/contas-receber')
export class ContasReceberController {
  constructor(private service: ContasReceberService) {}

  @Get()
  @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar contas a receber' })
  listar(
    @Param('businessId') negocioId: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('clienteId') clienteId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listar(negocioId, {
      status,
      search,
      clienteId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Buscar conta a receber' })
  buscarPorId(@Param('businessId') negocioId: string, @Param('id') id: string) {
    return this.service.buscarPorId(negocioId, id);
  }

  @Post(':id/baixa')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Dar baixa (parcial ou total) em conta a receber' })
  darBaixa(
    @Param('businessId') negocioId: string,
    @Param('id') id: string,
    @Body() dto: BaixaContaReceberDto,
  ) {
    return this.service.darBaixa(negocioId, id, dto);
  }

  @Post('cliente/:clienteId/baixa')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Dar baixa no saldo devedor do cliente (aplica nas contas mais antigas)' })
  darBaixaCliente(
    @Param('businessId') negocioId: string,
    @Param('clienteId') clienteId: string,
    @Body() dto: BaixaContaReceberDto,
  ) {
    return this.service.darBaixaCliente(negocioId, clienteId, dto);
  }
}
