import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RoleNegocio } from '@prisma/client';

export class AtualizarMembroDto {
  @ApiPropertyOptional({ enum: RoleNegocio })
  @IsOptional()
  @IsEnum(RoleNegocio)
  role?: RoleNegocio;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
