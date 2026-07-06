import { Controller, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PdvService } from './pdv.service';
import { FinalizarPdvDto } from './dto/finalizar-pdv.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessAccessGuard } from '../../common/guards/business-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleNegocio } from '@prisma/client';

@ApiTags('PDV')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccessGuard, RolesGuard)
@Controller('negocios/:businessId/pdv')
export class PdvController {
  constructor(private pdvService: PdvService) {}

  @Post('checkout')
  @Roles(RoleNegocio.OPERADOR)
  async checkout(
    @Param('businessId') businessId: string,
    @Body() dto: FinalizarPdvDto,
    @Request() req: any,
  ) {
    return this.pdvService.checkout(businessId, dto, req.user?.id);
  }
}
