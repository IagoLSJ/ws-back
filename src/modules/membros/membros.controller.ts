import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MembrosService } from './membros.service';
import { ConvidarMembroDto } from './dto/convidar-membro.dto';
import { AtualizarMembroDto } from './dto/atualizar-membro.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Membros')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/membros')
export class MembrosController {
  constructor(private service: MembrosService) {}

  @Post('convidar')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Convidar membro para o negócio' })
  convidar(@Param('businessId') negocioId: string, @Body() dto: ConvidarMembroDto) {
    return this.service.convidar(negocioId, dto);
  }

  @Get()
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Listar membros do negócio' })
  findAll(@Param('businessId') negocioId: string) {
    return this.service.findAll(negocioId);
  }

  @Patch(':membroId')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Alterar role ou status do membro' })
  update(
    @Param('businessId') negocioId: string,
    @Param('membroId') membroId: string,
    @Body() dto: AtualizarMembroDto,
  ) {
    return this.service.update(negocioId, membroId, dto);
  }

  @Delete(':membroId')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Remover membro do negócio' })
  remove(@Param('businessId') negocioId: string, @Param('membroId') membroId: string) {
    return this.service.remove(negocioId, membroId);
  }
}
