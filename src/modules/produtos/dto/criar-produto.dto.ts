import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  ValidateNested,
  IsArray,
  MinLength,
  Max,
  MaxLength,
  IsDateString,
  Matches,
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

  @ApiPropertyOptional({ example: 'Nestlé' })
  @IsOptional()
  @IsString()
  marca?: string;

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
  @Matches(/^\d{8}$/)
  ncm?: string;

  @ApiPropertyOptional({ description: 'CFOP (operação fiscal, ex: 5102 para venda)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  cfop?: string;

  @ApiPropertyOptional({ description: 'Origem da mercadoria (0=Nacional, 1=Importação direta, 2=Adquirida no mercado interno). Padrão 0' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(8)
  origem?: number;

  @ApiPropertyOptional({ description: 'CSOSN para Simples Nacional/MEI (102, 400, 500...)' })
  @IsOptional()
  @IsString()
  csosn?: string;

  @ApiPropertyOptional({ description: 'CST PIS por produto (validar conforme enquadramento contábil)' })
  @IsOptional()
  @IsString()
  cstPis?: string;

  @ApiPropertyOptional({ description: 'CST COFINS por produto (validar conforme enquadramento contábil)' })
  @IsOptional()
  @IsString()
  cstCofins?: string;

  @ApiPropertyOptional({ description: 'CST de ICMS para Regime Normal (00, 20, 40, 41, 50)' })
  @IsOptional()
  @IsString()
  cstIcms?: string;

  @ApiPropertyOptional({ description: 'Redução da base do ICMS em percentual; usada com CST 20' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pRedBC?: number;

  @ApiPropertyOptional({ description: 'Alíquota de ICMS (%) para Regime Normal' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  aliqIcms?: number;

  @ApiPropertyOptional({ description: 'Alíquota de PIS (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  aliqPis?: number;

  @ApiPropertyOptional({ description: 'Alíquota de COFINS (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  aliqCofins?: number;

  @ApiPropertyOptional({ description: 'Percentual aproximado de tributos federais para informação ao consumidor (Lei 12.741/2012)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliqTributosFederais?: number;

  @ApiPropertyOptional({ description: 'Percentual aproximado de tributos estaduais para informação ao consumidor (Lei 12.741/2012)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliqTributosEstaduais?: number;

  @ApiPropertyOptional({ description: 'Percentual aproximado de tributos municipais para informação ao consumidor (Lei 12.741/2012)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliqTributosMunicipais?: number;

  @ApiPropertyOptional({ description: 'Fonte das alíquotas aproximadas, por exemplo tabela IBPT vigente' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fonteTributosAproximados?: string;

  @ApiPropertyOptional({ description: 'Data inicial de vigência da fonte de alíquotas aproximadas (AAAA-MM-DD)' })
  @IsOptional()
  @IsDateString()
  vigenciaTributosAproximados?: string;

  @ApiPropertyOptional({ description: 'CEST (Código Especificador da Substituição Tributária, 7 dígitos)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/)
  cest?: string;

  @ApiPropertyOptional({ description: 'Quantidade inicial em estoque' })
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

  @ApiPropertyOptional({ type: [GrupoModificadorDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrupoModificadorDto)
  gruposModificadores?: GrupoModificadorDto[];
}
