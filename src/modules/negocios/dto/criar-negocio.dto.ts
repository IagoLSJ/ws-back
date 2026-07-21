import { IsString, IsOptional, MinLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoNegocio } from '@prisma/client';

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

  @ApiPropertyOptional({ enum: TipoNegocio })
  @IsOptional()
  @IsEnum(TipoNegocio)
  tipo?: TipoNegocio;
}
