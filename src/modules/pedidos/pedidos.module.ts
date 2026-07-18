import { Module } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { PedidosController } from './pedidos.controller';
import { PedidosAdminController } from './pedidos-admin.controller';
import { EstoqueModule } from '../estoque/estoque.module';
import { ImprimirModule } from '../imprimir/imprimir.module';
import { CaixaModule } from '../caixa/caixa.module';

@Module({
  imports: [EstoqueModule, ImprimirModule, CaixaModule],
  controllers: [PedidosController, PedidosAdminController],
  providers: [PedidosService],
  exports: [PedidosService],
})
export class PedidosModule {}
