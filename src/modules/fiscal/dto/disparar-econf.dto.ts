import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class DispararEconfDto {
  @ApiProperty({ description: 'Id da conta a receber cuja baixa será conciliada (ECONF)' })
  @IsString()
  contaReceberId!: string;

  @ApiProperty({ description: 'Valor da baixa (padrão: saldo pendente da conta)', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  valor?: number;

  @ApiProperty({ description: 'Data do pagamento (AAAA-MM-DD). Padrão: hoje', required: false })
  @IsOptional()
  @IsISO8601()
  dataPagamento?: string;
}
