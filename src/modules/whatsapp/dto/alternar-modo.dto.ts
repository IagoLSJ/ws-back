import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AlternarModoDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  modoHumano!: boolean;
}
