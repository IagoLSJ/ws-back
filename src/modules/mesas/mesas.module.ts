import { Module } from '@nestjs/common';
import { MesasService } from './mesas.service';
import { MesasAdminController } from './mesas.controller';
import { MesasPublicController } from './mesas-public.controller';

@Module({
  controllers: [MesasAdminController, MesasPublicController],
  providers: [MesasService],
  exports: [MesasService],
})
export class MesasModule {}
