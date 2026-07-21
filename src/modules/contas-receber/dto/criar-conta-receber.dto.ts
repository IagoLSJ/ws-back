import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsDateString, Min } from 'class-validator';

export class CriarContaReceberDto {
  @ApiProperty()
  @IsString()
  clienteId!: string;

  @ApiProperty()
  @IsString()
  negocioId!: string;

  @ApiProperty()
  @IsString()
  pedidoId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  valorTotal!: number;

  @ApiProperty()
  @IsDateString()
  dataVencimento!: string;
}
