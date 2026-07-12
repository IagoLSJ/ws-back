import { IsString, IsInt, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AtualizarEstoqueItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: 5.50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  precoCusto?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  quantidadeAtual?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  estoqueMinimo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unidade?: string;
}
