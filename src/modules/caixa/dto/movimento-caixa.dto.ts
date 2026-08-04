import { IsString, IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MovimentoCaixaDto {
  @ApiProperty({ enum: ['SANGRIA', 'SUPRIMENTO'] })
  @IsEnum(['SANGRIA', 'SUPRIMENTO'] as const)
  tipo!: 'SANGRIA' | 'SUPRIMENTO';

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  valor!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiPropertyOptional({ description: 'Caixa alvo (gerente+). Omita para usar o próprio caixa.' })
  @IsOptional()
  @IsString()
  caixaId?: string;
}
