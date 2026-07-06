import { Controller, Get, Patch, Param, Body, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PedidosService } from './pedidos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RoleNegocio, StatusPedido } from '@prisma/client';

@ApiTags('Pedidos (Admin)')
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/pedidos')
export class PedidosAdminController {
  constructor(private service: PedidosService) {}

  @Get()
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Listar pedidos do negócio' })
  listar(@Param('businessId') businessId: string) {
    return this.service.listarPorNegocio(businessId);
  }

  @Get(':id')
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Buscar pedido por ID' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.buscar(id);
  }

  @Patch(':id/status')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Atualizar status do pedido' })
  atualizarStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: StatusPedido,
    @CurrentUser('id') usuarioId: string,
  ) {
    return this.service.atualizarStatus(id, status, usuarioId);
  }
}
