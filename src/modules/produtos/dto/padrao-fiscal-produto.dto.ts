import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PadraoFiscalProdutoDto {
  @ApiProperty({ description: 'NCM padrão, 8 dígitos (ex: 21069090 para preparações alimentícias)' })
  @IsString()
  @Matches(/^\d{8}$/, { message: 'NCM deve ter 8 dígitos' })
  ncm!: string;

  @ApiProperty({ description: 'CFOP padrão, 3-4 dígitos (ex: 5102 venda de mercadoria adquirida)' })
  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'CFOP deve ter 3 ou 4 dígitos' })
  cfop!: string;

  @ApiProperty({ description: 'CSOSN padrão para Simples Nacional (ex: 102)' })
  @IsString()
  @Matches(/^\d{3}$/, { message: 'CSOSN deve ter 3 dígitos' })
  csosn!: string;

  @ApiPropertyOptional({ description: 'Origem da mercadoria (0=Nacional, 1=Importação direta, 2=Adquirida no mercado interno). Padrão 0' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(8)
  @Type(() => Number)
  origem?: number;

  @ApiPropertyOptional({ description: 'CEST padrão, 7 dígitos (opcional)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/, { message: 'CEST deve ter 7 dígitos' })
  cest?: string;

  @ApiPropertyOptional({ description: 'Filtro por categoria' })
  @IsOptional()
  @IsString()
  categoriaId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Lista específica de produtos (opcional)' })
  @IsOptional()
  @IsString({ each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: 'Se true (padrão), não sobrescreve campos já preenchidos' })
  @IsOptional()
  @IsBoolean()
  apenasVazios?: boolean;
}
