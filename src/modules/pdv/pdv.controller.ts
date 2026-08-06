import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { PdvService } from './pdv.service';
import { FinalizarPdvDto } from './dto/finalizar-pdv.dto';
import { ProdutosService } from '../produtos/produtos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleNegocio } from '@prisma/client';

@ApiTags('PDV')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/pdv')
export class PdvController {
  constructor(
    private pdvService: PdvService,
    private produtosService: ProdutosService,
  ) {}

  @Get('produtos')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Listar produtos do PDV (do próprio negócio ou da mesma cidade)' })
  async produtos(
    @Param('businessId') businessId: string,
    @Request() req: any,
  ) {
    return this.produtosService.findAllPDV(businessId, req.user?.role);
  }

  @Get('produtos/busca/codigo/:codigo')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Buscar produto por código de barras no PDV (próprio negócio ou mesma cidade)' })
  async buscarPorCodigo(
    @Param('businessId') businessId: string,
    @Param('codigo') codigo: string,
    @Request() req: any,
  ) {
    return this.produtosService.buscarPorCodigoBarrasPDV(codigo, businessId, req.user?.role);
  }

  @Post('checkout')
  @Roles(RoleNegocio.OPERADOR)
  async checkout(
    @Param('businessId') businessId: string,
    @Body() dto: FinalizarPdvDto,
    @Request() req: any,
  ) {
    return this.pdvService.checkout(businessId, dto, req.user?.id, req.user?.role);
  }
}
