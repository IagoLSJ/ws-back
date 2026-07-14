import { Module } from '@nestjs/common';
import { PdvController } from './pdv.controller';
import { PdvService } from './pdv.service';
import { EstoqueModule } from '../estoque/estoque.module';
import { ImprimirModule } from '../imprimir/imprimir.module';

@Module({
  imports: [EstoqueModule, ImprimirModule],
  controllers: [PdvController],
  providers: [PdvService],
})
export class PdvModule {}
