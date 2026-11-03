import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class InutilizarNumerosDto {
  @ApiProperty({ description: 'Série da numeração a inutilizar' })
  @IsInt()
  @Min(1)
  @Max(899)
  serie!: number;

  @ApiProperty({ description: 'Número inicial da faixa' })
  @IsInt()
  @Min(1)
  numeroInicial!: number;

  @ApiProperty({ description: 'Número final da faixa (máx. 100 números)' })
  @IsInt()
  @Min(1)
  numeroFinal!: number;

  @ApiProperty({ description: 'Justificativa (mín. 15 caracteres)' })
  @IsString()
  @MaxLength(255)
  justificativa!: string;
}
