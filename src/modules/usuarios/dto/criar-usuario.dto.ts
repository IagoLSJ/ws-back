import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CriarUsuarioDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @MinLength(2)
  nome!: string;

  @ApiProperty({ example: 'joao@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  senha!: string;
}
