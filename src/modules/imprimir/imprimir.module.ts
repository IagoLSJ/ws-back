import { Module } from '@nestjs/common';
import { ImprimirController } from './imprimir.controller';
import { ImprimirService } from './imprimir.service';

@Module({
  controllers: [ImprimirController],
  providers: [ImprimirService],
  exports: [ImprimirService],
})
export class ImprimirModule {}
