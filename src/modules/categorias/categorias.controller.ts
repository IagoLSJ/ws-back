import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CategoriasService } from './categorias.service';
import { CriarCategoriaDto } from './dto/criar-categoria.dto';
import { AtualizarCategoriaDto } from './dto/atualizar-categoria.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Categorias')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/categorias')
export class CategoriasController {
  constructor(private service: CategoriasService) {}

  @Post()
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Criar categoria' })
  create(@Param('businessId') negocioId: string, @Body() dto: CriarCategoriaDto) {
    return this.service.create(negocioId, dto);
  }

  @Get()
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Listar categorias' })
  findAll(@Param('businessId') negocioId: string) {
    return this.service.findAll(negocioId);
  }

  @Patch(':catId')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Atualizar categoria' })
  update(
    @Param('businessId') negocioId: string,
    @Param('catId') id: string,
    @Body() dto: AtualizarCategoriaDto,
  ) {
    return this.service.update(negocioId, id, dto);
  }

  @Delete(':catId')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Excluir categoria' })
  remove(@Param('businessId') negocioId: string, @Param('catId') id: string) {
    return this.service.remove(negocioId, id);
  }
}
