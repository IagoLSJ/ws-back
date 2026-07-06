import { Controller, Get, Post, Patch, Param, Query, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PedidosService } from './pedidos.service';
import { CheckoutDto } from './dto/checkout.dto';
import { Public } from '../../common/decorators/public.decorator';
import { StatusPedido } from '@prisma/client';

@ApiTags('Pedidos (Vitrine)')
@Public()
@Controller('vitrine/:slug/pedidos')
export class PedidosController {
  constructor(private service: PedidosService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Finalizar pedido (checkout)' })
  @ApiQuery({ name: 'sessionId', required: true })
  checkout(
    @Param('slug') slug: string,
    @Query('sessionId') sessionId: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.service.checkout(slug, sessionId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar pedidos por session' })
  @ApiQuery({ name: 'sessionId', required: true })
  listar(@Param('slug') slug: string, @Query('sessionId') sessionId: string) {
    return this.service.listarPorSession(slug, sessionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar pedido por ID' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.buscar(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualizar status do pedido' })
  atualizarStatus(@Param('id', ParseUUIDPipe) id: string, @Body('status') status: StatusPedido) {
    return this.service.atualizarStatus(id, status);
  }
}
