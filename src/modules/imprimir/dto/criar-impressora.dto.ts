import { IsString, IsOptional, IsInt, IsBoolean, IsIn, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CriarImpressoraDto {
  @ApiProperty({ enum: ['TERMICA', 'MATRICIAL', 'LASER'] })
  @IsIn(['TERMICA', 'MATRICIAL', 'LASER'])
  tipo!: string;

  @ApiProperty({ enum: ['REDE', 'USB'] })
  @IsIn(['REDE', 'USB'])
  conexao!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  enderecoIp?: string;

  @ApiPropertyOptional({ default: 9100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  porta?: number;

  @ApiPropertyOptional({ default: 80 })
  @IsOptional()
  @IsInt()
  @IsIn([58, 80])
  papelLargura?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
