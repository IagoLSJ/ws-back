import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsDateString, Min, IsOptional } from 'class-validator';

export class CriarValeContaReceberDto {
  @ApiProperty({ description: 'Cliente (funcionário/pessoa) que recebeu o vale' })
  @IsString()
  clienteId!: string;

  @ApiProperty({ description: 'Valor do vale/adiantamento' })
  @IsNumber()
  @Min(0.01)
  valorTotal!: number;

  @ApiProperty({ description: 'Data de vencimento do vale' })
  @IsDateString()
  dataVencimento!: string;

  @ApiPropertyOptional({ description: 'Motivo do vale (ex.: adiantamento, PIX antecipado)' })
  @IsOptional()
  @IsString()
  observacao?: string;
}
