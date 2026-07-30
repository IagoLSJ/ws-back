import { Controller, Get, Post, Query, Body, Res, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '../../infra/database/prisma.service';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { ChatbotService } from './chatbot.service';

@ApiExcludeController()
@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private prisma: PrismaService,
    private meta: MetaWhatsappService,
    private chatbot: ChatbotService,
  ) {}

  @Get()
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() res: Response) {
    const result = this.meta.verifyWebhook(mode, token, challenge);
    if (result) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(HttpStatus.OK).send(result);
    }
    this.logger.warn(`Falha na verificacao do webhook: mode=${mode}, token=${token}`);
    return res.status(HttpStatus.FORBIDDEN).send('Verification failed');
  }

  @Post()
  async receive(@Body() body: any, @Res() res: Response) {
    try {
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];
      const metadata = value?.metadata;

      if (!message || !metadata) {
        return res.status(HttpStatus.OK).send('OK');
      }

      const phoneNumberId = metadata.phone_number_id as string;
      const telefone = message.from as string;
      const messageId = message.id as string;

      const config = await this.prisma.configuracaoNegocio.findUnique({
        where: { metaPhoneNumberId: phoneNumberId },
        include: { negocio: { select: { id: true, slug: true } } },
      });

      if (!config || !config.negocio) {
        this.logger.warn(`Nenhum negocio configurado para phone_number_id: ${phoneNumberId}`);
        return res.status(HttpStatus.OK).send('OK');
      }

      const negocioId = config.negocio.id;
      const slug = config.negocio.slug;

      await this.meta.markAsRead(messageId);

      if (message.type === 'text') {
        const texto = message.text?.body || '';
        const nome = value.contacts?.[0]?.profile?.name;

        const resposta = await this.chatbot.processar(negocioId, slug, telefone, nome, texto);
        await this.meta.sendText(telefone, resposta.texto);
      } else if (message.type === 'interactive') {
        const reply = message.interactive?.button_reply || message.interactive?.list_reply;
        if (reply) {
          const texto = reply.title || reply.id || '';
          const nome = value.contacts?.[0]?.profile?.name;

          const resposta = await this.chatbot.processar(negocioId, slug, telefone, nome, texto);
          await this.meta.sendText(telefone, resposta.texto);
        }
      }

      return res.status(HttpStatus.OK).send('OK');
    } catch (err) {
      this.logger.error('Erro no webhook:', err);
      return res.status(HttpStatus.OK).send('OK');
    }
  }
}
