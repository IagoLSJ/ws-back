import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProdutosService } from './produtos.service';
import { CriarProdutoDto } from './dto/criar-produto.dto';
import { AtualizarProdutoDto } from './dto/atualizar-produto.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RoleNegocio } from '@prisma/client';

@ApiTags('Produtos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/produtos')
export class ProdutosController {
  constructor(private service: ProdutosService) {}

  @Post()
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Criar produto' })
  create(@Param('businessId') negocioId: string, @Body() dto: CriarProdutoDto) {
    return this.service.create(negocioId, dto);
  }

  @Get()
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Listar produtos' })
  findAll(@Param('businessId') negocioId: string) {
    return this.service.findAll(negocioId);
  }

  @Get(':prodId')
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Obter produto' })
  findOne(@Param('businessId') negocioId: string, @Param('prodId') id: string) {
    return this.service.findOne(negocioId, id);
  }

  @Patch(':prodId')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Atualizar produto' })
  update(
    @Param('businessId') negocioId: string,
    @Param('prodId') id: string,
    @Body() dto: AtualizarProdutoDto,
  ) {
    return this.service.update(negocioId, id, dto);
  }

  @Delete(':prodId')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Excluir produto' })
  remove(@Param('businessId') negocioId: string, @Param('prodId') id: string) {
    return this.service.remove(negocioId, id);
  }

  @Post(':prodId/imagens')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Solicitar URL de upload' })
  requestUpload(
    @Param('businessId') negocioId: string,
    @Param('prodId') produtoId: string,
    @Body('fileName') fileName: string,
    @Body('fileSize') fileSize?: number,
  ) {
    return this.service.requestUploadUrl(negocioId, produtoId, fileName, fileSize);
  }

  @Post(':prodId/imagens/confirmar')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Confirmar upload de imagem' })
  confirmUpload(
    @Param('businessId') negocioId: string,
    @Param('prodId') produtoId: string,
    @Body('key') key: string,
  ) {
    return this.service.confirmUpload(negocioId, produtoId, key);
  }

  @Delete(':prodId/imagens/:imgId')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Excluir imagem' })
  deleteImage(
    @Param('businessId') negocioId: string,
    @Param('prodId') produtoId: string,
    @Param('imgId') imagemId: string,
  ) {
    return this.service.deleteImage(negocioId, produtoId, imagemId);
  }
}
