import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
  ValidateNested,
  IsArray,
  Max,
  MaxLength,
  IsDateString,
  Matches,
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
  @Matches(/^\d{8}$/)
  ncm?: string;

  @ApiPropertyOptional({ description: 'CFOP' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  cfop?: string;

  @ApiPropertyOptional({ description: 'Origem da mercadoria (0=Nacional, 1=Importação direta, 2=Adquirida no mercado interno)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(8)
  origem?: number;

  @ApiPropertyOptional({ description: 'CSOSN para Simples Nacional/MEI' })
  @IsOptional()
  @IsString()
  csosn?: string;

  @ApiPropertyOptional({ description: 'CST PIS por produto' })
  @IsOptional()
  @IsString()
  cstPis?: string;

  @ApiPropertyOptional({ description: 'CST COFINS por produto' })
  @IsOptional()
  @IsString()
  cstCofins?: string;

  @ApiPropertyOptional({ description: 'CST de ICMS para Regime Normal' })
  @IsOptional()
  @IsString()
  cstIcms?: string;

  @ApiPropertyOptional({ description: 'Redução da base do ICMS em percentual; usada com CST 20' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pRedBC?: number;

  @ApiPropertyOptional({ description: 'Alíquota de ICMS (%)' })
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

  @ApiPropertyOptional({ description: 'Percentual aproximado de tributos federais ao consumidor' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliqTributosFederais?: number;

  @ApiPropertyOptional({ description: 'Percentual aproximado de tributos estaduais ao consumidor' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliqTributosEstaduais?: number;

  @ApiPropertyOptional({ description: 'Percentual aproximado de tributos municipais ao consumidor' })
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

  @ApiPropertyOptional({ description: 'Data inicial de vigência da fonte de alíquotas aproximadas' })
  @IsOptional()
  @IsDateString()
  vigenciaTributosAproximados?: string;

  @ApiPropertyOptional({ description: 'CEST (7 dígitos)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/)
  cest?: string;

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
