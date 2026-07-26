import { IsString, IsOptional, IsInt, IsBoolean, IsIn, Min, Max, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CriarImpressoraDto {
  @ApiProperty({ enum: ['TERMICA', 'MATRICIAL', 'LASER'] })
  @IsIn(['TERMICA', 'MATRICIAL', 'LASER'])
  tipo!: string;

  @ApiProperty({ enum: ['REDE', 'USB', 'BLUETOOTH'] })
  @IsIn(['REDE', 'USB', 'BLUETOOTH'])
  conexao!: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.conexao === 'REDE')
  @IsString()
  enderecoIp?: string;

  @ApiPropertyOptional({ default: 9100 })
  @ValidateIf(o => o.conexao === 'REDE')
  @IsInt()
  @Min(1)
  @Max(65535)
  porta?: number;

  @ApiPropertyOptional({ default: 80 })
  @IsOptional()
  @IsInt()
  @IsIn([58, 80])
  papelLargura?: number;

  @ApiPropertyOptional({ enum: ['COZINHA', 'OPERADOR'], default: 'COZINHA' })
  @IsOptional()
  @IsIn(['COZINHA', 'OPERADOR'])
  tipoUso?: string;

  @ApiPropertyOptional({ description: 'Vincular a um operador (o cupom só imprime nesta impressora para este operador)' })
  @IsOptional()
  @IsString()
  operadorId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
