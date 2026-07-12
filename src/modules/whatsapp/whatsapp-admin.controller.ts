import { Controller, Get, Post, Patch, Param, Body, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WhatsappAdminService } from './whatsapp-admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleNegocio } from '@prisma/client';
import { EnviarMensagemDto } from './dto/enviar-mensagem.dto';
import { AlternarModoDto } from './dto/alternar-modo.dto';

@ApiTags('WhatsApp (Admin)')
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/whatsapp')
export class WhatsappAdminController {
  constructor(private service: WhatsappAdminService) {}

  @Get('conversas')
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Listar conversas WhatsApp do negócio' })
  listarConversas(@Param('businessId') businessId: string) {
    return this.service.listarConversas(businessId);
  }

  @Get('conversas/:clienteId/mensagens')
  @Roles(RoleNegocio.VISUALIZADOR)
  @ApiOperation({ summary: 'Histórico de mensagens de uma conversa' })
  mensagens(
    @Param('businessId') businessId: string,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
  ) {
    return this.service.mensagens(businessId, clienteId);
  }

  @Post('conversas/:clienteId/enviar')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Enviar mensagem como admin para o cliente' })
  enviarMensagem(
    @Param('businessId') businessId: string,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body() dto: EnviarMensagemDto,
  ) {
    return this.service.enviarMensagem(businessId, clienteId, dto.texto);
  }

  @Patch('conversas/:clienteId/humano')
  @Roles(RoleNegocio.OPERADOR)
  @ApiOperation({ summary: 'Alternar modo humano/bot da conversa' })
  alternarModo(
    @Param('businessId') businessId: string,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body() dto: AlternarModoDto,
  ) {
    return this.service.alternarModo(businessId, clienteId, dto.modoHumano);
  }
}
