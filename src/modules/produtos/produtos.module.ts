import { Module } from '@nestjs/common';
import { ProdutosService } from './produtos.service';
import { ProdutosController } from './produtos.controller';
import { VitrineController } from './vitrine.controller';
import { NegociosModule } from '../negocios/negocios.module';

@Module({
  imports: [NegociosModule],
  controllers: [ProdutosController, VitrineController],
  providers: [ProdutosService],
  exports: [ProdutosService],
})
export class ProdutosModule {}
