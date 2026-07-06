import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MeusPedidosWhatsappDto {
  @ApiProperty({ example: '5511999999999' })
  @IsString()
  telefone!: string;
}
