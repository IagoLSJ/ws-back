import { Controller, Post, Get, Param, Body, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiQuery, ApiExcludeEndpoint } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { ChatbotService } from './chatbot.service';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { CriarPedidoWhatsappDto } from './dto/criar-pedido-whatsapp.dto';
import { ConversarDto } from './dto/conversar.dto';

@ApiTags('WhatsApp')
@Controller('whatsapp/:slug')
export class WhatsappController {
  constructor(
    private service: WhatsappService,
    private chatbot: ChatbotService,
    private meta: MetaWhatsappService,
  ) {}

  @Get('webhook')
  @ApiExcludeEndpoint()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const result = this.meta.verifyWebhook(mode, token, challenge);
    if (result) {
      return res.status(HttpStatus.OK).send(result);
    }
    return res.status(HttpStatus.FORBIDDEN).send('Verification failed');
  }

  @Post('webhook')
  @ApiExcludeEndpoint()
  async receiveWebhook(
    @Param('slug') slug: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    try {
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];
      const metadata = value?.metadata;

      if (!message || !metadata) {
        return res.status(HttpStatus.OK).send('OK');
      }

      const telefone = message.from;
      const messageId = message.id;

      await this.meta.markAsRead(messageId);

      if (message.type === 'text') {
        const texto = message.text?.body || '';
        const nome = value.contacts?.[0]?.profile?.name;

        const negocioId = await this.service.resolveNegocioId(slug);

        const resposta = await this.chatbot.processar(negocioId, slug, telefone, nome, texto);

        await this.meta.sendText(telefone, resposta.texto);
      } else if (message.type === 'interactive') {
        const reply = message.interactive?.button_reply || message.interactive?.list_reply;
        if (reply) {
          const texto = reply.title || reply.id || '';
          const nome = value.contacts?.[0]?.profile?.name;
          const negocioId = await this.service.resolveNegocioId(slug);

          const resposta = await this.chatbot.processar(negocioId, slug, telefone, nome, texto);
          await this.meta.sendText(telefone, resposta.texto);
        }
      }

      return res.status(HttpStatus.OK).send('OK');
    } catch (err) {
      return res.status(HttpStatus.OK).send('OK');
    }
  }

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
  @ApiOperation({ summary: 'Processar mensagem do chatbot conversacional' })
  async conversar(@Param('slug') slug: string, @Body() dto: ConversarDto) {
    const negocioId = await this.service.resolveNegocioId(slug);
    return this.chatbot.processar(negocioId, slug, dto.telefone, dto.nome, dto.texto || '');
  }
}
