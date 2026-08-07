import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsDateString, IsString, Min } from 'class-validator';

export class AtualizarContaReceberDto {
  @ApiPropertyOptional({ description: 'Novo valor total da conta' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorTotal?: number;

  @ApiPropertyOptional({ description: 'Nova data de vencimento (ISO)' })
  @IsOptional()
  @IsDateString()
  dataVencimento?: string;

  @ApiPropertyOptional({ description: 'Observação da conta' })
  @IsOptional()
  @IsString()
  observacao?: string;
}
