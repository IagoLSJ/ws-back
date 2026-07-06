import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NegociosService } from './negocios.service';
import { CriarNegocioDto } from './dto/criar-negocio.dto';
import { AtualizarNegocioDto } from './dto/atualizar-negocio.dto';
import { AtualizarConfiguracaoDto } from './dto/atualizar-configuracao.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Negócios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios')
export class NegociosController {
  constructor(private service: NegociosService) {}

  @Post()
  @Roles(RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Criar negócio' })
  create(@Body() dto: CriarNegocioDto, @CurrentUser('id') usuarioId: string) {
    return this.service.create(dto, usuarioId);
  }

  @Get()
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Listar negócios do usuário' })
  findAll(@CurrentUser('id') usuarioId: string) {
    return this.service.findAll(usuarioId);
  }

  @Get(':id')
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Obter negócio' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Atualizar negócio' })
  update(@Param('id') id: string, @Body() dto: AtualizarNegocioDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Desativar negócio' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/logo')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Solicitar URL de upload do logo' })
  requestLogoUpload(@Param('id') id: string, @Body('fileName') fileName: string) {
    return this.service.requestLogoUploadUrl(id, fileName);
  }

  @Post(':id/logo/confirmar')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Confirmar upload do logo' })
  confirmLogoUpload(@Param('id') id: string, @Body('key') key: string) {
    return this.service.confirmLogoUpload(id, key);
  }

  @Delete(':id/logo')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Remover logo' })
  deleteLogo(@Param('id') id: string) {
    return this.service.deleteLogo(id);
  }

  @Patch(':id/configuracoes')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Atualizar configurações do negócio' })
  updateConfig(@Param('id') id: string, @Body() dto: AtualizarConfiguracaoDto) {
    return this.service.updateConfig(id, dto);
  }
}
