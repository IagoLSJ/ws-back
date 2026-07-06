import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoPagamento } from '@prisma/client';

export class EnderecoEntregaDto {
  @ApiPropertyOptional({ example: 'Rua das Flores' })
  @IsOptional()
  @IsString()
  logradouro?: string;

  @ApiPropertyOptional({ example: '123' })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({ example: 'Apto 42' })
  @IsOptional()
  @IsString()
  complemento?: string;

  @ApiPropertyOptional({ example: 'Centro' })
  @IsOptional()
  @IsString()
  bairro?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsOptional()
  @IsString()
  cidade?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional({ example: '01310-000' })
  @IsOptional()
  @IsString()
  cep?: string;
}

export class CheckoutDto {
  @ApiProperty({ enum: ['RETIRADA', 'ENTREGA'], example: 'ENTREGA' })
  @IsString()
  tipoEntrega!: 'RETIRADA' | 'ENTREGA';

  @ApiPropertyOptional({ example: 'Deixar na portaria' })
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiProperty({ enum: MetodoPagamento, example: 'PIX' })
  @IsEnum(MetodoPagamento)
  metodoPagamento!: MetodoPagamento;

  @ApiPropertyOptional({ example: 5.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  trocoPara?: number;

  @ApiPropertyOptional({ type: EnderecoEntregaDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EnderecoEntregaDto)
  enderecoEntrega?: EnderecoEntregaDto;

  @ApiPropertyOptional({ example: '(11) 99999-8888' })
  @IsOptional()
  @IsString()
  contato?: string;

  @ApiPropertyOptional({ example: '2025-12-25T18:00:00.000Z' })
  @IsOptional()
  @IsString()
  agendadoPara?: string;
}
