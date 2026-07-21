import { IsString, IsOptional, IsNumber, Min, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FecharCaixaDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  saldoFinal!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiPropertyOptional({ description: 'ID do caixa a fechar. Se não informado, fecha o primeiro caixa aberto do operador logado.' })
  @IsOptional()
  @IsUUID()
  caixaId?: string;
}
