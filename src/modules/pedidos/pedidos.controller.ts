import { Controller, Get, Post, Patch, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PedidosService } from './pedidos.service';
import { CheckoutDto } from './dto/checkout.dto';
import { Public } from '../../common/decorators/public.decorator';
import { SessionId } from '../../common/decorators/session-id.decorator';
import { StatusPedido } from '@prisma/client';

@ApiTags('Pedidos (Vitrine)')
@Public()
@Controller('vitrine/:slug/pedidos')
export class PedidosController {
  constructor(private service: PedidosService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Finalizar pedido (checkout)' })
  checkout(
    @Param('slug') slug: string,
    @SessionId() sessionId: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.service.checkout(slug, sessionId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar pedidos por session' })
  listar(@Param('slug') slug: string, @SessionId() sessionId: string) {
    return this.service.listarPorSession(slug, sessionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar pedido por ID' })
  buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @SessionId() sessionId?: string,
  ) {
    return this.service.buscar(id, sessionId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualizar status do pedido' })
  atualizarStatus(@Param('id', ParseUUIDPipe) id: string, @Body('status') status: StatusPedido) {
    return this.service.atualizarStatus(id, status);
  }
}
