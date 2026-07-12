import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EnviarMensagemDto {
  @ApiProperty({ example: 'Olá, como posso ajudar?' })
  @IsString()
  @IsNotEmpty()
  texto!: string;
}
