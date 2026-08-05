import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdicionarComboAoCarrinhoDto {
  @ApiProperty({ example: 'uuid-do-combo' })
  @IsString()
  comboId!: string;

  @ApiPropertyOptional({ example: 'uuid-da-mesa' })
  @IsOptional()
  @IsString()
  mesaId?: string;
}
