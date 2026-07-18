import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MesasService } from './mesas.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Mesas (Público)')
@Public()
@Controller('vitrine/:slug/mesas')
export class MesasPublicController {
  constructor(private service: MesasService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Validar QR Code da mesa e retornar dados do negócio' })
  validarMesa(
    @Param('slug') slug: string,
    @Param('token') token: string,
  ) {
    return this.service.validarMesaPorToken(slug, token);
  }
}
