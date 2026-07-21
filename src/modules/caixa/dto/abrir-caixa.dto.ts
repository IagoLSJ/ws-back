import { IsString, IsOptional, IsNumber, Min, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AbrirCaixaDto {
  @ApiProperty({ default: 0 })
  @IsNumber()
  @Min(0)
  saldoInicial!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiPropertyOptional({ description: 'ID do usuário que vai operar o caixa. Se não informado, usa o usuário que abriu.' })
  @IsOptional()
  @IsUUID()
  operadorId?: string;
}
