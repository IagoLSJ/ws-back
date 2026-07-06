import { IsString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CriarEstoqueItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  produtoId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  quantidadeAtual!: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  estoqueMinimo?: number;

  @ApiPropertyOptional({ example: 'un' })
  @IsOptional()
  @IsString()
  unidade?: string;
}
