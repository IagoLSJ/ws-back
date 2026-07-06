import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { CarrinhoModule } from '../carrinho/carrinho.module';

import { PedidosModule } from '../pedidos/pedidos.module';

@Module({
  imports: [CarrinhoModule, PedidosModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
