import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  MinLength,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdicionarAoCarrinhoDto {
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

  @ApiPropertyOptional({ example: ['uuid-opcao-1', 'uuid-opcao-2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  opcoesSelecionadas?: string[];
}
