import { PartialType } from '@nestjs/swagger';
import { CriarImpressoraDto } from './criar-impressora.dto';

export class AtualizarImpressoraDto extends PartialType(CriarImpressoraDto) {}
