import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EstoqueService } from './estoque.service';
import { ListarEstoqueDto } from './dto/listar-estoque.dto';
import { CriarEstoqueItemDto } from './dto/criar-estoque-item.dto';
import { AtualizarEstoqueItemDto } from './dto/atualizar-estoque-item.dto';
import { MovimentarEstoqueDto } from './dto/movimentar-estoque.dto';
import { TransferirEstoqueDto } from './dto/transferir-estoque.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Estoque')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/estoque')
export class EstoqueController {
  constructor(private service: EstoqueService) {}

  @Get()
  @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar estoque do negócio (paginado)' })
  findAll(
    @Param('businessId') negocioId: string,
    @Query() query: ListarEstoqueDto,
  ) {
    return this.service.findAll(negocioId, query);
  }

  @Post()
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Criar item de estoque (avulso ou vinculado)' })
  criar(@Param('businessId') negocioId: string, @Body() dto: CriarEstoqueItemDto) {
    return this.service.criar(negocioId, dto);
  }

  @Get('alertas')
   @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Alertas de ruptura de estoque' })
  alertas(@Param('businessId') negocioId: string) {
    return this.service.alertas(negocioId);
  }

  @Post('transferir')
   @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Transferir estoque entre negócios' })
  transferir(
    @Param('businessId') negocioId: string,
    @Body() dto: TransferirEstoqueDto,
    @CurrentUser('id') usuarioId: string,
  ) {
    return this.service.transferir(negocioId, dto, usuarioId);
  }

  @Get(':itemId')
   @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Obter item de estoque' })
  findOne(@Param('businessId') negocioId: string, @Param('itemId') itemId: string) {
    return this.service.findOne(negocioId, itemId);
  }

  @Patch(':itemId')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Atualizar item de estoque' })
  atualizar(
    @Param('businessId') negocioId: string,
    @Param('itemId') itemId: string,
    @Body() dto: AtualizarEstoqueItemDto,
  ) {
    return this.service.atualizar(negocioId, itemId, dto);
  }

  @Delete(':itemId')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Remover item de estoque' })
  remover(@Param('businessId') negocioId: string, @Param('itemId') itemId: string) {
    return this.service.remover(negocioId, itemId);
  }

  @Post(':itemId/movimentar')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Lançar movimentação de estoque' })
  movimentar(
    @Param('businessId') negocioId: string,
    @Param('itemId') itemId: string,
    @Body() dto: MovimentarEstoqueDto,
    @CurrentUser('id') usuarioId: string,
  ) {
    return this.service.movimentar(negocioId, itemId, dto, usuarioId);
  }

  @Get(':itemId/historico')
   @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Histórico de movimentações' })
  historico(@Param('businessId') negocioId: string, @Param('itemId') itemId: string) {
    return this.service.historico(negocioId, itemId);
  }
}
