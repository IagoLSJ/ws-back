import { IsString, IsInt, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferirEstoqueDto {
  @ApiProperty()
  @IsString()
  itemOrigemId!: string;

  @ApiProperty()
  @IsString()
  negocioDestinoId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  produtoDestinoId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemDestinoId?: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  quantidade!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  motivo?: string;
}
