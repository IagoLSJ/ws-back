import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProdutoStatus } from '@prisma/client';

class OpcaoModificadorDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precoExtra?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ordem?: number;
}

class GrupoModificadorDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsBoolean()
  obrigatorio?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSelecao?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxSelecao?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ordem?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpcaoModificadorDto)
  opcoes?: OpcaoModificadorDto[];
}

export class AtualizarProdutoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiPropertyOptional({ example: 'Nestlé' })
  @IsOptional()
  @IsString()
  marca?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  preco?: number;

  @ApiPropertyOptional()
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
  @IsEnum(ProdutoStatus)
  status?: ProdutoStatus;

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

  @ApiPropertyOptional({ description: 'NCM' })
  @IsOptional()
  @IsString()
  ncm?: string;

  @ApiPropertyOptional({ description: 'CFOP' })
  @IsOptional()
  @IsString()
  cfop?: string;

  @ApiPropertyOptional({ description: 'Quantidade atual em estoque (usada ao criar item)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantidadeAtual?: number;

  @ApiPropertyOptional({ description: 'Estoque mínimo do item' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estoqueMinimo?: number;

  @ApiPropertyOptional({ description: 'Unidade do estoque (ex: UN, KG)' })
  @IsOptional()
  @IsString()
  unidade?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrupoModificadorDto)
  gruposModificadores?: GrupoModificadorDto[];
}
