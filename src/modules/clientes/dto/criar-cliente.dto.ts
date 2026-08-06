import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, IsDateString } from 'class-validator';
import { IsCpfOuCnpj } from '../../../common/decorators/is-cpf-cnpj.decorator';

export class CriarClienteDto {
  @ApiPropertyOptional({ example: '123.456.789-09', description: 'Opcional na migração de contas antigas' })
  @IsOptional()
  @IsString()
  @IsCpfOuCnpj()
  cpfCnpj?: string;

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

  @ApiPropertyOptional({ description: 'Saldo devedor inicial do cliente (R$)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  saldoDevedor?: number;

  @ApiPropertyOptional({ description: 'Valor da dívida inicial (gera uma conta a receber). Obrigatório informar negocioId junto.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorDebitoInicial?: number;

  @ApiPropertyOptional({ description: 'Negócio ao qual a dívida inicial pertence' })
  @IsOptional()
  @IsString()
  negocioId?: string;

  @ApiPropertyOptional({ description: 'Data de vencimento da dívida inicial (ISO). Padrão: hoje' })
  @IsOptional()
  @IsDateString()
  dataVencimento?: string;
}
