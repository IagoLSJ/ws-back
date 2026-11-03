import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FiscalService } from './fiscal.service';
import { FiscalController } from './fiscal.controller';
import { FiscalEmissaoProcessor } from './fiscal-queue.processor';
import { SefazCeClient } from './sefaz-ce.client';
import { SvrsNfceClient } from './svrs-nfce.client';

@Module({
  imports: [BullModule.registerQueue({ name: 'emissao-nfce' })],
  controllers: [FiscalController],
  providers: [FiscalService, SefazCeClient, SvrsNfceClient, FiscalEmissaoProcessor],
  exports: [FiscalService],
})
export class FiscalModule {}
