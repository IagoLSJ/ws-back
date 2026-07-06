import { IsOptional, IsString, IsNumber, IsBoolean, IsObject, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
}
