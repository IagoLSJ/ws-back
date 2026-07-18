import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CaixaService } from './caixa.service';
import { AbrirCaixaDto } from './dto/abrir-caixa.dto';
import { FecharCaixaDto } from './dto/fechar-caixa.dto';
import { MovimentoCaixaDto } from './dto/movimento-caixa.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Caixa')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/caixa')
export class CaixaController {
  constructor(private service: CaixaService) {}

  @Post('abrir')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Abrir caixa' })
  async abrir(
    @Param('businessId') businessId: string,
    @Body() dto: AbrirCaixaDto,
    @Request() req: any,
  ) {
    return this.service.abrir(businessId, dto, req.user?.id);
  }

  @Post('fechar')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Fechar caixa' })
  async fechar(
    @Param('businessId') businessId: string,
    @Body() dto: FecharCaixaDto,
    @Request() req: any,
  ) {
    return this.service.fechar(businessId, dto, req.user?.id);
  }

  @Get('atual')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Obter caixa aberto atual' })
  async atual(@Param('businessId') businessId: string) {
    return this.service.atual(businessId);
  }

  @Get()
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Listar todos os caixas' })
  async listar(@Param('businessId') businessId: string) {
    return this.service.listar(businessId);
  }

  @Get(':id')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Detalhes de um caixa' })
  async detalhe(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
  ) {
    return this.service.detalhe(businessId, id);
  }

  @Post('movimento')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Registrar sangria ou suprimento' })
  async movimento(
    @Param('businessId') businessId: string,
    @Body() dto: MovimentoCaixaDto,
    @Request() req: any,
  ) {
    return this.service.movimento(businessId, dto, req.user?.id);
  }
}
