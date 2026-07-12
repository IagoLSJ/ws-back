import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Res, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ImprimirService } from './imprimir.service';
import { CriarImpressoraDto } from './dto/criar-impressora.dto';
import { AtualizarImpressoraDto } from './dto/atualizar-impressora.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleNegocio } from '@prisma/client';
import { Response } from 'express';

@ApiTags('Impressão')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/imprimir')
export class ImprimirController {
  constructor(private service: ImprimirService) {}

  @Get('impressoras')
  @Roles(RoleNegocio.OPERADOR)
  listar(@Param('businessId') businessId: string) {
    return this.service.listarImpressoras(businessId);
  }

  @Post('impressoras')
  @Roles(RoleNegocio.GERENTE)
  criar(@Param('businessId') businessId: string, @Body() dto: CriarImpressoraDto) {
    return this.service.criarImpressora(businessId, dto);
  }

  @Patch('impressoras/:id')
  @Roles(RoleNegocio.GERENTE)
  atualizar(@Param('businessId') businessId: string, @Param('id') id: string, @Body() dto: AtualizarImpressoraDto) {
    return this.service.atualizarImpressora(id, businessId, dto);
  }

  @Delete('impressoras/:id')
  @Roles(RoleNegocio.GERENTE)
  remover(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.service.removerImpressora(id, businessId);
  }

  @Get('comanda/:pedidoId')
  @Roles(RoleNegocio.OPERADOR)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async comanda(
    @Param('businessId') businessId: string,
    @Param('pedidoId') pedidoId: string,
    @Query('impressora') impressoraId: string | undefined,
  ) {
    const result = await this.service.imprimirComanda(businessId, pedidoId, impressoraId);
    return result.html;
  }

  @Post('comanda/:pedidoId')
  @Roles(RoleNegocio.OPERADOR)
  async imprimirComanda(
    @Param('businessId') businessId: string,
    @Param('pedidoId') pedidoId: string,
    @Body('impressoraId') impressoraId: string | undefined,
  ) {
    return this.service.imprimirComanda(businessId, pedidoId, impressoraId);
  }

  @Get('cupom/:pedidoId')
  @Roles(RoleNegocio.OPERADOR)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async cupom(
    @Param('businessId') businessId: string,
    @Param('pedidoId') pedidoId: string,
    @Query('impressora') impressoraId: string | undefined,
  ) {
    const result = await this.service.imprimirCupom(businessId, pedidoId, impressoraId);
    return result.html;
  }

  @Post('cupom/:pedidoId')
  @Roles(RoleNegocio.OPERADOR)
  async imprimirCupom(
    @Param('businessId') businessId: string,
    @Param('pedidoId') pedidoId: string,
    @Body('impressoraId') impressoraId: string | undefined,
  ) {
    return this.service.imprimirCupom(businessId, pedidoId, impressoraId);
  }
}
