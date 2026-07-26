import { Module } from '@nestjs/common';
import { FiscalService } from './fiscal.service';

@Module({
  providers: [FiscalService],
  exports: [FiscalService],
})
export class FiscalModule {}
