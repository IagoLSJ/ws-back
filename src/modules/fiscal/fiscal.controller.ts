import { Body, Controller, Get, Patch, Post, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleNegocio } from '@prisma/client';
import { FiscalService } from './fiscal.service';
import { SalvarConfiguracaoFiscalDto } from './dto/salvar-configuracao-fiscal.dto';
import { SalvarCertificadoA1Dto } from './dto/salvar-certificado-a1.dto';
import { InutilizarNumerosDto } from './dto/inutilizar-numeros.dto';
import { DispararEconfDto } from './dto/disparar-econf.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Fiscal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/fiscal')
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @Get('configuracao')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Consultar configuração fiscal sem dados secretos' })
  getConfiguracao(@Param('businessId') negocioId: string) {
    return this.fiscalService.getConfiguracao(negocioId);
  }

  @Patch('configuracao')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Salvar configuração da NFC-e (valida CNPJ, UF CE, IBGE, série)' })
  salvarConfiguracao(
    @Param('businessId') negocioId: string,
    @Body() dto: SalvarConfiguracaoFiscalDto,
  ) {
    return this.fiscalService.salvarConfiguracao(negocioId, dto);
  }

  @Post('certificado-a1')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Salvar certificado A1 criptografado (valida validade e CNPJ)' })
  salvarCertificado(
    @Param('businessId') negocioId: string,
    @Body() dto: SalvarCertificadoA1Dto,
  ) {
    return this.fiscalService.salvarCertificado(negocioId, dto);
  }

  @Post('testar-configuracao')
  @Roles(RoleNegocio.GERENTE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Validar pré-requisitos da emissão' })
  testarConfiguracao(@Param('businessId') negocioId: string) {
    return this.fiscalService.testarConfiguracao(negocioId);
  }

  @Post('testar-sefaz')
  @Roles(RoleNegocio.GERENTE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Consultar status da SEFAZ (autorizadora SVRS) usando o A1' })
  testarSefaz(@Param('businessId') negocioId: string) {
    return this.fiscalService.testarSefaz(negocioId);
  }

  @Post('ativar')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Ativar emissão após validar cadastro fiscal local e produtos' })
  ativar(@Param('businessId') negocioId: string) {
    return this.fiscalService.ativarEmissao(negocioId);
  }

  @Get('documentos')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Listar documentos fiscais do negócio' })
  listarDocumentos(@Param('businessId') negocioId: string) {
    return this.fiscalService.listarDocumentos(negocioId);
  }

  @Get('documentos/:documentoId')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Consultar documento fiscal na SEFAZ e atualizar estado' })
  consultarDocumento(
    @Param('businessId') negocioId: string,
    @Param('documentoId') documentoId: string,
  ) {
    return this.fiscalService.consultarDocumento(negocioId, documentoId);
  }

  @Get('documentos/:documentoId/xml')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Baixar XML assinado/autorizado (guarda legal do emitente)' })
  getXml(
    @Param('businessId') negocioId: string,
    @Param('documentoId') documentoId: string,
  ) {
    return this.fiscalService.getXmlDocumento(negocioId, documentoId);
  }

  @Post('documentos/:documentoId/cancelar')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Cancelar NFC-e autorizada (prazo de 24h, evento 110111 registrado)' })
  cancelarDocumento(
    @Param('businessId') negocioId: string,
    @Param('documentoId') documentoId: string,
    @Body('motivo') motivo: string,
  ) {
    return this.fiscalService.cancelarDocumento(negocioId, documentoId, motivo);
  }

  @Post('documentos/:documentoId/econf')
  @Roles(RoleNegocio.GERENTE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Conciliar financeiramente (ECONF 110750) uma baixa de conta a receber da NFC-e' })
  dispararEconf(
    @Param('businessId') negocioId: string,
    @Param('documentoId') documentoId: string,
    @Body() dto: DispararEconfDto,
  ) {
    return this.fiscalService.dispararEconf(negocioId, documentoId, dto);
  }

  @Post('documentos/:documentoId/reprocessar')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Reprocessar documento rejeitado/com erro mantendo a mesma numeração' })
  reprocessarDocumento(
    @Param('businessId') negocioId: string,
    @Param('documentoId') documentoId: string,
  ) {
    return this.fiscalService.reprocessarDocumento(negocioId, documentoId);
  }

  @Post('inutilizacao')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Inutilizar faixa de numeração (evento NFeInutilizacao4)' })
  inutilizar(@Param('businessId') negocioId: string, @Body() dto: InutilizarNumerosDto) {
    return this.fiscalService.inutilizarNumeros(negocioId, dto.serie, dto.numeroInicial, dto.numeroFinal, dto.justificativa);
  }

  @Post('recuperar-pendentes')
  @Roles(RoleNegocio.GERENTE)
  @ApiOperation({ summary: 'Consultar/recuperar documentos processando, em consulta ou em contingência' })
  recuperarPendentes(@Param('businessId') negocioId: string) {
    return this.fiscalService.recuperarPendentes(negocioId);
  }
}
