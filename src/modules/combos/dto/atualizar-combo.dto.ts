import { PartialType } from '@nestjs/swagger';
import { CriarComboDto } from './criar-combo.dto';

export class AtualizarComboDto extends PartialType(CriarComboDto) {}
