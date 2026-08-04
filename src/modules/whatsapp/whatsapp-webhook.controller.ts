import { Controller, Get, Post, Query, Body, Res, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { GeminiService } from './gemini.service';
import { ChatbotService } from './chatbot.service';
import { TtsService } from './tts.service';

@ApiExcludeController()
@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private meta: MetaWhatsappService,
    private gemini: GeminiService,
    private chatbot: ChatbotService,
    private tts: TtsService,
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

  private async enviarResposta(telefone: string, resposta: { texto: string; imagens?: string[] }) {
    const envioTexto = await this.meta.sendText(telefone, resposta.texto);
    this.logger.log(`[WEBHOOK] resultado envio texto Meta: ${JSON.stringify(envioTexto)}`);

    for (const url of resposta.imagens || []) {
      const envioImg = await this.meta.sendImage(telefone, url);
      this.logger.log(`[WEBHOOK] resultado envio imagem Meta (${url}): ${JSON.stringify(envioImg)}`);
    }
  }

  private limparTextoParaAudio(texto: string): string {
    return texto
      .replace(/[*_`#>|]/g, ' ')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{FE0F}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Cliente que manda áudio provavelmente não sabe ler: responde em áudio
  private async enviarRespostaAudio(telefone: string, resposta: { texto: string; imagens?: string[] }) {
    try {
      const textoLimpo = this.limparTextoParaAudio(resposta.texto);
      const audio = textoLimpo
        ? (await this.tts.synthesize(textoLimpo)) ?? (await this.gemini.textToSpeech(textoLimpo))
        : null;

      if (audio) {
        const mediaId = await this.meta.uploadMedia(audio.buffer, audio.mimeType);
        if (mediaId) {
          const envio = await this.meta.sendAudio(telefone, mediaId);
          if (envio.success) {
            this.logger.log(`[WEBHOOK] resposta em audio enviada para ${telefone}`);
            for (const url of resposta.imagens || []) {
              await this.meta.sendImage(telefone, url).catch(() => {});
            }
            return;
          }
          this.logger.warn(`[WEBHOOK] falha ao enviar audio: ${envio.error}`);
        }
      }
      this.logger.warn('[WEBHOOK] TTS/upload indisponivel - respondendo em texto');
    } catch (err: any) {
      this.logger.error(`[WEBHOOK] erro ao responder em audio: ${err.message}`);
    }
    await this.enviarResposta(telefone, resposta);
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

      const jaProcessada = await this.redis.set(`chatbot:dedupe:${messageId}`, '1', 86400, true);
      if (!jaProcessada) {
        this.logger.warn(`[WEBHOOK] mensagem ${messageId} ja processada - ignorando (dedupe)`);
        return res.status(HttpStatus.OK).send('OK');
      }

      await this.meta.markAsRead(messageId);

      if (message.type === 'text') {
        const texto = message.text?.body || '';
        const nome = value.contacts?.[0]?.profile?.name;
        this.logger.log(`[WEBHOOK] processando texto: "${texto}" (nome=${nome || 'desconhecido'})`);

        const resposta = await this.chatbot.processar(negocioId, slug, telefone, nome, texto);
        this.logger.log(`[WEBHOOK] enviando resposta via Meta para ${telefone}`);
        await this.enviarResposta(telefone, resposta);
      } else if (message.type === 'audio') {
        const mediaId = message.audio?.id as string | undefined;
        const nome = value.contacts?.[0]?.profile?.name;
        if (!mediaId) {
          this.logger.warn('[WEBHOOK] audio sem media id');
        } else {
          this.logger.log(`[WEBHOOK] processando audio mediaId=${mediaId}`);
          try {
            const media = await this.meta.getMedia(mediaId);
            const transcricao = await this.gemini.transcribeAudio(media.buffer, media.mimeType);
            if (!transcricao) {
              this.logger.warn('[WEBHOOK] transcricao vazia');
              await this.enviarResposta(telefone, { texto: 'Não consegui entender o áudio 😕 Pode mandar em texto?' });
            } else {
              this.logger.log(`[WEBHOOK] transcricao: "${transcricao}"`);
              const resposta = await this.chatbot.processar(negocioId, slug, telefone, nome, transcricao);
              await this.enviarRespostaAudio(telefone, resposta);
            }
          } catch (err: any) {
            this.logger.error(`[WEBHOOK] erro ao processar audio: ${err.message}`);
            await this.enviarResposta(telefone, { texto: 'Não consegui processar o áudio agora 😕 Pode mandar em texto?' });
          }
        }
      } else if (message.type === 'interactive') {
        const reply = message.interactive?.button_reply || message.interactive?.list_reply;
        if (reply) {
          const texto = reply.title || reply.id || '';
          const nome = value.contacts?.[0]?.profile?.name;
          this.logger.log(`[WEBHOOK] reply interativo: "${texto}"`);

          const resposta = await this.chatbot.processar(negocioId, slug, telefone, nome, texto);
          this.logger.log(`[WEBHOOK] enviando resposta (interativo) via Meta para ${telefone}`);
          await this.enviarResposta(telefone, resposta);
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
