import { Module } from '@nestjs/common';
import { ContasReceberController } from './contas-receber.controller';
import { ContasReceberService } from './contas-receber.service';
import { FiscalModule } from '../fiscal/fiscal.module';

@Module({
  imports: [FiscalModule],
  controllers: [ContasReceberController],
  providers: [ContasReceberService],
  exports: [ContasReceberService],
})
export class ContasReceberModule {}
