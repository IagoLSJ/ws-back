import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  ValidateNested,
  IsArray,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class OpcaoModificadorDto {
  @ApiProperty({ example: 'Médio' })
  @IsString()
  nome!: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  precoExtra?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  ordem?: number;
}

class GrupoModificadorDto {
  @ApiProperty({ example: 'Tamanho' })
  @IsString()
  nome!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  obrigatorio?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minSelecao?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxSelecao?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  ordem?: number;

  @ApiProperty({ type: [OpcaoModificadorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpcaoModificadorDto)
  opcoes!: OpcaoModificadorDto[];
}

export class CriarProdutoDto {
  @ApiProperty({ example: 'X-Burger' })
  @IsString()
  @MinLength(2)
  nome!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiProperty({ example: 25.9 })
  @IsNumber()
  @Min(0)
  preco!: number;

  @ApiPropertyOptional({ enum: ['PERCENTUAL', 'FIXO'] })
  @IsOptional()
  @IsString()
  tipoDesconto?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorDesconto?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoriaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  destaque?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  ordem?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  controlaEstoque?: boolean;

  @ApiPropertyOptional({ type: [GrupoModificadorDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrupoModificadorDto)
  gruposModificadores?: GrupoModificadorDto[];
}
