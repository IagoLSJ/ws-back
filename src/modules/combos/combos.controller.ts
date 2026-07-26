import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CombosService } from './combos.service';
import { CriarComboDto } from './dto/criar-combo.dto';
import { AtualizarComboDto } from './dto/atualizar-combo.dto';
import { StorageService } from '../../infra/storage/storage.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Combos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/combos')
export class CombosController {
  constructor(
    private service: CombosService,
    private storage: StorageService,
  ) {}

  @Post()
  @Roles(RoleNegocio.GERENTE)
  criar(@Param('businessId') negocioId: string, @Body() dto: CriarComboDto) {
    return this.service.criar(negocioId, dto);
  }

  @Get()
  @Roles(RoleNegocio.VISUALIZADOR)
  listar(@Param('businessId') negocioId: string, @Query('apenasAtivos') apenasAtivos?: string) {
    return this.service.listar(negocioId, apenasAtivos === 'true');
  }

  @Get('pdv')
  @Roles(RoleNegocio.OPERADOR)
  listarPDV(@Param('businessId') negocioId: string) {
    return this.service.listar(negocioId, true);
  }

  @Get(':id')
  @Roles(RoleNegocio.VISUALIZADOR)
  buscar(@Param('businessId') negocioId: string, @Param('id') id: string) {
    return this.service.buscar(id, negocioId);
  }

  @Patch(':id')
  @Roles(RoleNegocio.GERENTE)
  atualizar(@Param('businessId') negocioId: string, @Param('id') id: string, @Body() dto: AtualizarComboDto) {
    return this.service.atualizar(negocioId, id, dto);
  }

  @Post(':id/imagem/upload')
  @Roles(RoleNegocio.GERENTE)
  async requestUploadUrl(
    @Param('businessId') negocioId: string,
    @Param('id') id: string,
    @Body('fileName') fileName: string,
    @Body('fileSize') fileSize: number,
  ) {
    await this.service.buscar(id, negocioId);
    const ext = fileName?.split('.').pop() || 'png';
    const key = `combos/${negocioId}/${id}/${Date.now()}.${ext}`;
    const url = await this.storage.getPresignedUploadUrl(key);
    return { url, key };
  }

  @Post(':id/imagem/confirmar')
  @Roles(RoleNegocio.GERENTE)
  async confirmUpload(
    @Param('businessId') negocioId: string,
    @Param('id') id: string,
    @Body('key') key: string,
  ) {
    const publicUrl = this.storage.getPublicUrl(key);
    await this.service.salvarImagem(negocioId, id, publicUrl);
    return { url: publicUrl };
  }

  @Patch(':id/imagem')
  @Roles(RoleNegocio.GERENTE)
  salvarImagem(@Param('businessId') negocioId: string, @Param('id') id: string, @Body('imagemUrl') imagemUrl: string) {
    return this.service.salvarImagem(negocioId, id, imagemUrl);
  }

  @Delete(':id')
  @Roles(RoleNegocio.GERENTE)
  remover(@Param('businessId') negocioId: string, @Param('id') id: string) {
    return this.service.remover(negocioId, id);
  }
}
