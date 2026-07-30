import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAdminController } from './whatsapp-admin.controller';
import { WhatsappAdminService } from './whatsapp-admin.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { ChatbotService } from './chatbot.service';
import { GroqService } from './groq.service';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { CarrinhoModule } from '../carrinho/carrinho.module';
import { PedidosModule } from '../pedidos/pedidos.module';
import { ImprimirModule } from '../imprimir/imprimir.module';

@Module({
  imports: [CarrinhoModule, PedidosModule, ImprimirModule],
  controllers: [WhatsappController, WhatsappAdminController, WhatsappWebhookController],
  providers: [WhatsappService, WhatsappAdminService, ChatbotService, GroqService, MetaWhatsappService],
  exports: [WhatsappService, WhatsappAdminService, ChatbotService, GroqService, MetaWhatsappService],
})
export class WhatsappModule {}
