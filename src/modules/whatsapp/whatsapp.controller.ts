import { Controller, Post, Get, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { ChatbotService } from './chatbot.service';
import { CriarPedidoWhatsappDto } from './dto/criar-pedido-whatsapp.dto';
import { ConversarDto } from './dto/conversar.dto';
import { N8nApiGuard } from '../../common/guards/n8n-api.guard';

@ApiTags('WhatsApp')
@Controller('whatsapp/:slug')
export class WhatsappController {
  constructor(
    private service: WhatsappService,
    private chatbot: ChatbotService,
  ) {}

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

  @Post('conversar')
  @UseGuards(N8nApiGuard)
  @ApiOperation({ summary: 'Processar mensagem do chatbot conversacional' })
  async conversar(@Param('slug') slug: string, @Body() dto: ConversarDto) {
    const negocioId = await this.service.resolveNegocioId(slug);
    return this.chatbot.processar(negocioId, slug, dto.telefone, dto.nome, dto.texto || '');
  }
}
