import { Controller, Get, Query, Param, Res } from '@nestjs/common';
import { MercadoLivreService } from './mercadolivre.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Mercado Livre')
@Controller('integrations/mercadolivre')
export class MercadoLivreController {
  constructor(private service: MercadoLivreService) {}

  @Get('auth')
  async auth(@Query('negocioId') negocioId: string, @Res() res: any) {
    if (!negocioId) return res.status(400).json({ message: 'negocioId é obrigatório' });
    const url = await this.service.obterAuthUrl(negocioId);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: any) {
    try {
      await this.service.callback(state, code);
      return res.redirect(`/negocios/${state}/configuracoes?ml=conectado`);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Erro ao conectar Mercado Livre';
      return res.redirect(`/negocios/${state}/configuracoes?ml=erro:${encodeURIComponent(msg)}`);
    }
  }

  @Get('status/:negocioId')
  async status(@Param('negocioId') negocioId: string) {
    return this.service.status(negocioId);
  }
}
