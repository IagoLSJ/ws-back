import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CriarMesaDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  numero!: number;

  @ApiPropertyOptional({ example: 'Mesa 1 - Janela' })
  @IsOptional()
  @IsString()
  nome?: string;
}
