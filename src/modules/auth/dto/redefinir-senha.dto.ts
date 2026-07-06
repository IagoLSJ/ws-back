import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedefinirSenhaDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  novaSenha!: string;
}
