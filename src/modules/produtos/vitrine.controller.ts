import { Controller, Get, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProdutosService } from './produtos.service';
import { NegociosService } from '../negocios/negocios.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Vitrine Pública')
@Public()
@Controller('vitrine')
export class VitrineController {
  constructor(
    private service: ProdutosService,
    @Inject(NegociosService) private negociosService: NegociosService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar negócios ativos' })
  listarNegocios() {
    return this.negociosService.listarAtivos();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Informações do negócio + produtos ativos' })
  vitrine(@Param('slug') slug: string) {
    return this.service.vitrine(slug);
  }
}
