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
    this.logger.log(`[WEBHOOK] GET verificacao: mode=${mode} verifyToken=${token} challenge=${challenge}`);
    const result = this.meta.verifyWebhook(mode, token, challenge);
    if (result) {
      this.logger.log(`[WEBHOOK] verificacao OK, respondendo challenge`);
      res.setHeader('Content-Type', 'text/plain');
      return res.status(HttpStatus.OK).send(result);
    }
    this.logger.warn(`[WEBHOOK] Falha na verificacao: mode=${mode}, token=${token}`);
    return res.status(HttpStatus.FORBIDDEN).send('Verification failed');
  }

  @Post()
  async receive(@Body() body: any, @Res() res: Response) {
    this.logger.log(`[WEBHOOK] POST recebido - body: ${JSON.stringify(body).slice(0, 1000)}`);
    try {
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];
      const metadata = value?.metadata;

      if (!message || !metadata) {
        this.logger.log(`[WEBHOOK] sem mensagem - evento ignorado (pode ser status/delivery)`);
        return res.status(HttpStatus.OK).send('OK');
      }

      const phoneNumberId = metadata.phone_number_id as string;
      const telefone = message.from as string;
      const messageId = message.id as string;

      this.logger.log(`[WEBHOOK] mensagem id=${messageId} tipo=${message.type} de=${telefone} para phoneNumberId=${phoneNumberId}`);
      this.logger.log(`[WEBHOOK] conteudo: ${JSON.stringify(message).slice(0, 500)}`);

      const config = await this.prisma.configuracaoNegocio.findUnique({
        where: { metaPhoneNumberId: phoneNumberId },
        include: { negocio: { select: { id: true, slug: true } } },
      });

      if (!config || !config.negocio) {
        this.logger.warn(`[WEBHOOK] NENHUM negocio cadastrado com metaPhoneNumberId=${phoneNumberId}. Cadastre em Configuracoes > Chatbot.`);
        return res.status(HttpStatus.OK).send('OK');
      }

      const negocioId = config.negocio.id;
      const slug = config.negocio.slug;
      this.logger.log(`[WEBHOOK] roteado para negocio ${slug} (${negocioId})`);

      await this.meta.markAsRead(messageId);

      if (message.type === 'text') {
        const texto = message.text?.body || '';
        const nome = value.contacts?.[0]?.profile?.name;
        this.logger.log(`[WEBHOOK] processando texto: "${texto}" (nome=${nome || 'desconhecido'})`);

        const resposta = await this.chatbot.processar(negocioId, slug, telefone, nome, texto);
        this.logger.log(`[WEBHOOK] enviando resposta via Meta para ${telefone}`);
        const envio = await this.meta.sendText(telefone, resposta.texto);
        this.logger.log(`[WEBHOOK] resultado envio Meta: ${JSON.stringify(envio)}`);
      } else if (message.type === 'interactive') {
        const reply = message.interactive?.button_reply || message.interactive?.list_reply;
        if (reply) {
          const texto = reply.title || reply.id || '';
          const nome = value.contacts?.[0]?.profile?.name;
          this.logger.log(`[WEBHOOK] reply interativo: "${texto}"`);

          const resposta = await this.chatbot.processar(negocioId, slug, telefone, nome, texto);
          this.logger.log(`[WEBHOOK] enviando resposta (interativo) via Meta para ${telefone}`);
          const envio = await this.meta.sendText(telefone, resposta.texto);
          this.logger.log(`[WEBHOOK] resultado envio Meta: ${JSON.stringify(envio)}`);
        }
      } else {
        this.logger.warn(`[WEBHOOK] tipo de mensagem nao tratado: ${message.type}`);
      }

      this.logger.log(`[WEBHOOK] processamento concluido com sucesso`);
      return res.status(HttpStatus.OK).send('OK');
    } catch (err: any) {
      this.logger.error(`[WEBHOOK] ERRO no processamento: ${err.message}`);
      this.logger.error(`[WEBHOOK] stack: ${err.stack}`);
      return res.status(HttpStatus.OK).send('OK');
    }
  }
}
