import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecuperarSenhaDto {
  @ApiProperty({ example: 'admin@exemplo.com' })
  @IsEmail()
  email!: string;
}
