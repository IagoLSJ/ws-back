import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CriarNegocioDto {
  @ApiProperty({ example: 'Lanchonete do João' })
  @IsString()
  @MinLength(2)
  nome!: string;

  @ApiPropertyOptional({ example: 'lanchonete-do-joao' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descricao?: string;
}
