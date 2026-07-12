import { IsString, IsNumber, IsBoolean, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CriarTaxaFreteBairroDto {
  @ApiProperty({ example: 'Centro' })
  @IsString()
  bairro!: string;

  @ApiProperty({ example: 10.0 })
  @IsNumber()
  @Min(0)
  taxa!: number;
}

export class AtualizarTaxaFreteBairroDto {
  @ApiPropertyOptional({ example: 'Centro' })
  @IsOptional()
  @IsString()
  bairro?: string;

  @ApiPropertyOptional({ example: 12.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxa?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
