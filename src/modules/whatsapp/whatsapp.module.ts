import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAdminController } from './whatsapp-admin.controller';
import { WhatsappAdminService } from './whatsapp-admin.service';
import { ChatbotService } from './chatbot.service';
import { CarrinhoModule } from '../carrinho/carrinho.module';
import { PedidosModule } from '../pedidos/pedidos.module';

@Module({
  imports: [CarrinhoModule, PedidosModule],
  controllers: [WhatsappController, WhatsappAdminController],
  providers: [WhatsappService, WhatsappAdminService, ChatbotService],
  exports: [WhatsappService, WhatsappAdminService, ChatbotService],
})
export class WhatsappModule {}
