import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import { CriarClienteDto } from './dto/criar-cliente.dto';
import { AtualizarClienteDto } from './dto/atualizar-cliente.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private service: ClientesService) {}

  @Post()
  @Roles(RoleNegocio.GERENTE, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Criar cliente' })
  criar(@Body() dto: CriarClienteDto) {
    return this.service.criar(dto);
  }

  @Get()
  @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar clientes' })
  listar(@Query('search') search?: string, @Query('page') page?: string, @Query('limit') limit?: string, @Query('comSaldo') comSaldo?: string) {
    return this.service.listar({
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      comSaldo: comSaldo === 'true',
    });
  }

  @Get(':id')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.OPERADOR, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Buscar cliente por ID' })
  buscarPorId(@Param('id') id: string) {
    return this.service.buscarPorId(id);
  }

  @Patch(':id')
  @Roles(RoleNegocio.GERENTE, RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar cliente' })
  atualizar(@Param('id') id: string, @Body() dto: AtualizarClienteDto) {
    return this.service.atualizar(id, dto);
  }

  @Post('recalcular-saldos')
  @Roles(RoleNegocio.SUPER_ADMIN)
  @ApiOperation({ summary: 'Recalcular saldoDevedor de todos os clientes a partir das contas' })
  recalcularSaldos() {
    return this.service.recalcularSaldos();
  }
}
