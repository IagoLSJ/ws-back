import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MesasService } from './mesas.service';
import { CriarMesaDto } from './dto/criar-mesa.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Mesas')
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/mesas')
export class MesasAdminController {
  constructor(private service: MesasService) {}

  @Post()
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Criar mesa' })
  criar(@Param('businessId') businessId: string, @Body() dto: CriarMesaDto) {
    return this.service.criar(businessId, dto);
  }

  @Get()
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Listar mesas' })
  listar(@Param('businessId') businessId: string) {
    return this.service.listar(businessId);
  }

  @Patch(':id')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Atualizar mesa' })
  atualizar(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CriarMesaDto> & { ativa?: boolean },
  ) {
    return this.service.atualizar(businessId, id, dto);
  }

  @Delete(':id')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Remover mesa' })
  remover(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.service.remover(businessId, id);
  }

  @Post(':id/ocupar')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Ocupar mesa (gerar sessionId e QR URL)' })
  ocupar(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.service.ocupar(businessId, id);
  }

  @Post(':id/liberar')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Liberar mesa' })
  liberar(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.service.liberar(businessId, id);
  }
}
