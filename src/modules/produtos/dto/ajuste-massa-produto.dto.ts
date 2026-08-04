import { IsString, IsOptional, IsEnum, IsNumber, Min, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TipoAjusteMassa {
  PERCENTUAL = 'PERCENTUAL',
  FIXO = 'FIXO',
}

export enum OperacaoAjusteMassa {
  SOMAR = 'SOMAR',
  SUBTRAIR = 'SUBTRAIR',
}

export enum CampoAjusteMassa {
  PRECO = 'PRECO',
  CUSTO = 'CUSTO',
  AMBOS = 'AMBOS',
}

export class AjusteMassaProdutoDto {
  @ApiPropertyOptional({ description: 'Filtro por nome/SKU (ex.: "coca cola")' })
  @IsOptional()
  @IsString()
  busca?: string;

  @ApiPropertyOptional({ description: 'Filtro por categoria' })
  @IsOptional()
  @IsString()
  categoriaId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Lista específica de produtos (opcional)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @ApiProperty({ enum: TipoAjusteMassa })
  @IsEnum(TipoAjusteMassa)
  tipo!: TipoAjusteMassa;

  @ApiProperty({ enum: OperacaoAjusteMassa })
  @IsEnum(OperacaoAjusteMassa)
  operacao!: OperacaoAjusteMassa;

  @ApiProperty({ description: 'Percentual (%) ou valor fixo (R$) do ajuste' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  valor!: number;

  @ApiProperty({ enum: CampoAjusteMassa, description: 'Campo a ajustar: preço de venda, custo ou ambos' })
  @IsEnum(CampoAjusteMassa)
  aplicarEm!: CampoAjusteMassa;
}
