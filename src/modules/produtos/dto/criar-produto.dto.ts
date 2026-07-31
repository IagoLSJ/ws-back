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
  @Min(0)
  precoExtra?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
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
  @Min(0)
  minSelecao?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxSelecao?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
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

  @ApiPropertyOptional({ example: '7891234567890' })
  @IsOptional()
  @IsString()
  codigoBarras?: string;

  @ApiPropertyOptional({ example: 12345 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  plu?: number;

  @ApiPropertyOptional({ example: 15.50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  precoCusto?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  destaque?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  ordem?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  controlaEstoque?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  vendaPorPeso?: boolean;

  @ApiPropertyOptional({ description: 'Unidade de medida (UN, KG, LT)' })
  @IsOptional()
  @IsString()
  unidadeMedida?: string;

  @ApiPropertyOptional({ description: 'NCM (código fiscal da mercadoria, ex: 21069090)' })
  @IsOptional()
  @IsString()
  ncm?: string;

  @ApiPropertyOptional({ description: 'CFOP (operação fiscal, ex: 5102 para venda)' })
  @IsOptional()
  @IsString()
  cfop?: string;

  @ApiPropertyOptional({ type: [GrupoModificadorDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrupoModificadorDto)
  gruposModificadores?: GrupoModificadorDto[];
}
