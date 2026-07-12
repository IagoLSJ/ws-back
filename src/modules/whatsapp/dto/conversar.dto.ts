import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConversarDto {
  @ApiProperty({ example: '5511999999999' })
  @IsString()
  telefone!: string;

  @ApiPropertyOptional({ example: 'João' })
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiPropertyOptional({ example: 'quero um suco' })
  @IsOptional()
  @IsString()
  texto?: string;

  @ApiPropertyOptional({ example: 'text' })
  @IsOptional()
  @IsString()
  tipoMidia?: string;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsOptional()
  @IsString()
  urlMidia?: string;
}

export class ConversarResponseDto {
  telefone!: string;
  texto!: string;
}
