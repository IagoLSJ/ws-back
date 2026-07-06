import { Controller, Post, Get, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { CriarPedidoWhatsappDto } from './dto/criar-pedido-whatsapp.dto';

@ApiTags('WhatsApp')
@Controller('whatsapp/:slug')
export class WhatsappController {
  constructor(private service: WhatsappService) {}

  @Post('criar-pedido')
  @ApiOperation({ summary: 'Criar pedido via WhatsApp (chamado pelo n8n)' })
  criarPedido(@Param('slug') slug: string, @Body() dto: CriarPedidoWhatsappDto) {
    return this.service.criarPedido(slug, dto);
  }

  @Get('meus-pedidos')
  @ApiOperation({ summary: 'Listar pedidos de um cliente WhatsApp' })
  @ApiQuery({ name: 'telefone', required: true, example: '5511999999999' })
  meusPedidos(@Param('slug') slug: string, @Query('telefone') telefone: string) {
    return this.service.meusPedidos(slug, telefone);
  }
}
