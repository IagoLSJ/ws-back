import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  ValidateNested,
  IsEnum,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoPagamento } from '@prisma/client';

export class ItemPedidoWhatsappDto {
  @ApiProperty({ example: 'uuid-do-produto' })
  @IsString()
  produtoId!: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantidade?: number;

  @ApiPropertyOptional({ example: 'Sem cebola' })
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiPropertyOptional({ example: ['uuid-opcao-1'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  opcoesSelecionadas?: string[];
}

export class CriarPedidoWhatsappDto {
  @ApiProperty({ example: '5511999999999' })
  @IsString()
  telefone!: string;

  @ApiProperty({ example: 'João' })
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiProperty({ type: [ItemPedidoWhatsappDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoWhatsappDto)
  itens!: ItemPedidoWhatsappDto[];

  @ApiPropertyOptional({ example: 'RETIRADA', enum: ['RETIRADA', 'ENTREGA'] })
  @IsOptional()
  @IsString()
  tipoEntrega?: 'RETIRADA' | 'ENTREGA';

  @ApiPropertyOptional({ example: { logradouro: 'Rua A', numero: '123', bairro: 'Centro' } })
  @IsOptional()
  @IsObject()
  endereco?: Record<string, any>;

  @ApiPropertyOptional({ example: 'Traz catchup' })
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiPropertyOptional({ enum: MetodoPagamento, example: 'PIX' })
  @IsOptional()
  @IsEnum(MetodoPagamento)
  metodoPagamento?: MetodoPagamento;
}
