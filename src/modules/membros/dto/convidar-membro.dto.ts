import { IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RoleNegocio } from '@prisma/client';

export class ConvidarMembroDto {
  @ApiProperty({ example: 'colaborador@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: RoleNegocio, example: RoleNegocio.GERENTE })
  @IsEnum(RoleNegocio)
  role!: RoleNegocio;
}
