import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SalvarCertificadoA1Dto {
  @ApiProperty({ description: 'Conteúdo do arquivo .pfx/.p12 em Base64' })
  @IsString()
  @MaxLength(14_000_000)
  certificadoBase64!: string;

  @ApiProperty({ description: 'Senha do certificado A1. Nunca é retornada pela API.' })
  @IsString()
  senha!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nomeArquivo?: string;
}
