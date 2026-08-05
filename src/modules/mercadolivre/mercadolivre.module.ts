import { Module } from '@nestjs/common';
import { MercadoLivreService } from './mercadolivre.service';
import { MercadoLivreController } from './mercadolivre.controller';

@Module({
  controllers: [MercadoLivreController],
  providers: [MercadoLivreService],
  exports: [MercadoLivreService],
})
export class MercadoLivreModule {}
