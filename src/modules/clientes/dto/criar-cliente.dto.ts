import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { IsCpfOuCnpj } from '../../../common/decorators/is-cpf-cnpj.decorator';

export class CriarClienteDto {
  @ApiProperty({ example: '123.456.789-09' })
  @IsString()
  @IsCpfOuCnpj()
  cpfCnpj!: string;

  @ApiProperty()
  @IsString()
  nome!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  limiteCredito?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacao?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  saldoDevedor?: number;
}
