import { Module } from '@nestjs/common';
import { EstoqueService } from './estoque.service';
import { EstoqueController } from './estoque.controller';
import { AlertasEstoqueProcessor } from './alertas/alertas-estoque.processor';

@Module({
  controllers: [EstoqueController],
  providers: [EstoqueService, AlertasEstoqueProcessor],
  exports: [EstoqueService],
})
export class EstoqueModule {}
