import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FiscalAmbiente, FiscalRegime } from '@prisma/client';

export class SalvarConfiguracaoFiscalDto {
  @ApiPropertyOptional({ enum: FiscalAmbiente, default: FiscalAmbiente.HOMOLOGACAO })
  @IsOptional()
  @IsEnum(FiscalAmbiente)
  ambiente?: FiscalAmbiente;

  @ApiProperty({ enum: FiscalRegime })
  @IsEnum(FiscalRegime)
  regime!: FiscalRegime;

  @ApiProperty()
  @IsString()
  cnpj!: string;

  @ApiProperty()
  @IsString()
  ie!: string;

  @ApiProperty()
  @IsString()
  razaoSocial!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  endereco!: Record<string, unknown>;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(899)
  serie?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  proximoNumero?: number;

  @ApiPropertyOptional({ description: 'Identificador do CSC fornecido pela SEFAZ-CE' })
  @IsOptional()
  @IsString()
  cscId?: string;

  @ApiPropertyOptional({ description: 'CSC. Nunca é retornado pela API.' })
  @IsOptional()
  @IsString()
  csc?: string;

  @ApiPropertyOptional({ description: 'Contingência NFC-e não é permitida neste módulo da SEFAZ-CE', default: false })
  @IsOptional()
  @IsBoolean()
  permitirContingencia?: boolean;
}
