import { IsOptional, IsString, IsNumber, IsBoolean, IsObject, IsArray, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TaxaCartaoFaixaDto {
  @ApiPropertyOptional({ description: 'Limite superior da faixa em R$ (total <= ate)' })
  @IsNumber()
  @Min(0)
  ate!: number;

  @ApiPropertyOptional({ description: 'Valor da taxa em R$' })
  @IsNumber()
  @Min(0)
  valor!: number;
}

export class AtualizarConfiguracaoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  controleEstoqueAtivo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  estoqueMinimoPadrao?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxaFrete?: number;

  @ApiPropertyOptional({
    type: [TaxaCartaoFaixaDto],
    description: 'Tabela de faixas da taxa de cartão (ex.: 0-20 -> R$1; 20-50 -> R$2; 50-100 -> R$3)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxaCartaoFaixaDto)
  taxaCartaoFaixas?: TaxaCartaoFaixaDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailAlertas?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  horarioFuncionamento?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  endereco?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefoneContato?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  chatbotAtivo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mensagemBoasVindas?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mensagemFallback?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  modeloIa?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cardapioImagens?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaPhoneNumberId?: string;
}
