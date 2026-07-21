import { Module } from '@nestjs/common';
import { PdvController } from './pdv.controller';
import { PdvService } from './pdv.service';
import { EstoqueModule } from '../estoque/estoque.module';
import { ImprimirModule } from '../imprimir/imprimir.module';
import { ProdutosModule } from '../produtos/produtos.module';
import { CaixaModule } from '../caixa/caixa.module';
import { ContasReceberModule } from '../contas-receber/contas-receber.module';

@Module({
  imports: [EstoqueModule, ImprimirModule, ProdutosModule, CaixaModule, ContasReceberModule],
  controllers: [PdvController],
  providers: [PdvService],
})
export class PdvModule {}
