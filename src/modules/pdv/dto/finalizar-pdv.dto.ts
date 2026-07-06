import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoPagamento } from '@prisma/client';

class DescontoDto {
  @ApiProperty({ enum: ['PERCENTUAL', 'FIXO'] })
  @IsString()
  tipo!: 'PERCENTUAL' | 'FIXO';

  @ApiProperty()
  @IsNumber()
  @Min(0)
  valor!: number;
}

class ItemPdvDto {
  @ApiProperty()
  @IsString()
  produtoId!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantidade?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => DescontoDto)
  desconto?: DescontoDto;
}

class PagamentoPdvDto {
  @ApiProperty({ enum: MetodoPagamento })
  @IsEnum(MetodoPagamento)
  metodo!: MetodoPagamento;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorPago?: number;
}

export class FinalizarPdvDto {
  @ApiProperty({ type: [ItemPdvDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemPdvDto)
  itens!: ItemPdvDto[];

  @ApiProperty({ type: PagamentoPdvDto })
  @ValidateNested()
  @Type(() => PagamentoPdvDto)
  pagamento!: PagamentoPdvDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => DescontoDto)
  descontoTotal?: DescontoDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agendadoPara?: string;
}
