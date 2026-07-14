import { Module } from '@nestjs/common';
import { QzController } from './qz.controller';

@Module({
  controllers: [QzController],
})
export class QzModule {}
