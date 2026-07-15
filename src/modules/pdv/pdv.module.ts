import { Module } from '@nestjs/common';
import { PdvController } from './pdv.controller';
import { PdvService } from './pdv.service';
import { EstoqueModule } from '../estoque/estoque.module';
import { ImprimirModule } from '../imprimir/imprimir.module';
import { ProdutosModule } from '../produtos/produtos.module';

@Module({
  imports: [EstoqueModule, ImprimirModule, ProdutosModule],
  controllers: [PdvController],
  providers: [PdvService],
})
export class PdvModule {}
