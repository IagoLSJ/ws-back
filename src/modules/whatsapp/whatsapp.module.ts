import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAdminController } from './whatsapp-admin.controller';
import { WhatsappAdminService } from './whatsapp-admin.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { ChatbotService } from './chatbot.service';
import { GeminiService } from './gemini.service';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { TtsService } from './tts.service';
import { CarrinhoModule } from '../carrinho/carrinho.module';
import { PedidosModule } from '../pedidos/pedidos.module';
import { ImprimirModule } from '../imprimir/imprimir.module';

@Module({
  imports: [CarrinhoModule, PedidosModule, ImprimirModule],
  controllers: [WhatsappController, WhatsappAdminController, WhatsappWebhookController],
  providers: [WhatsappService, WhatsappAdminService, ChatbotService, GeminiService, MetaWhatsappService, TtsService],
  exports: [WhatsappService, WhatsappAdminService, ChatbotService, GeminiService, MetaWhatsappService, TtsService],
})
export class WhatsappModule {}
