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
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Abrir caixa para um operador (gerente+)' })
  async abrir(
    @Param('businessId') businessId: string,
    @Body() dto: AbrirCaixaDto,
    @Request() req: any,
  ) {
    return this.service.abrir(businessId, dto, req.user?.id);
  }

  @Post('fechar')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Fechar caixa (gerente+)' })
  async fechar(
    @Param('businessId') businessId: string,
    @Body() dto: FecharCaixaDto,
    @Request() req: any,
  ) {
    return this.service.fechar(businessId, dto, req.user?.id);
  }

  @Get('atual')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Meu caixa aberto (filtrado pelo operador logado)' })
  async atual(
    @Param('businessId') businessId: string,
    @Request() req: any,
  ) {
    return this.service.atual(businessId, req.user?.id);
  }

  @Get('abertos')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Listar todos os caixas abertos (gerente+)' })
  async abertos(@Param('businessId') businessId: string) {
    return this.service.listarAbertos(businessId);
  }

  @Get()
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Listar histórico de caixas' })
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
  @ApiOperation({ summary: 'Registrar sangria ou suprimento no meu caixa' })
  async movimento(
    @Param('businessId') businessId: string,
    @Body() dto: MovimentoCaixaDto,
    @Request() req: any,
  ) {
    return this.service.movimento(businessId, dto, req.user?.id);
  }
}
