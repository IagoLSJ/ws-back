import { IsEnum, IsInt, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoMovimentacao } from '@prisma/client';

export class MovimentarEstoqueDto {
  @ApiProperty({ enum: TipoMovimentacao })
  @IsEnum(TipoMovimentacao)
  tipo!: TipoMovimentacao;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  quantidade!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  motivo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referencia?: string;
}
