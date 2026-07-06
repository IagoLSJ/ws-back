import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { CriarUsuarioDto } from './dto/criar-usuario.dto';
import { AtualizarUsuarioDto } from './dto/atualizar-usuario.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Usuários')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(private service: UsuariosService) {}

  @Post()
  @Roles(RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Criar usuário (SuperAdmin)' })
  create(@Body() dto: CriarUsuarioDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar usuários' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Obter usuário' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar usuário' })
  update(@Param('id') id: string, @Body() dto: AtualizarUsuarioDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Desativar usuário' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
