import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('QZ Tray')
@Controller('qz')
export class QzController {
  private privateKey: string;

  constructor() {
    const keyPath = path.resolve(process.cwd(), 'private-key.pem');
    if (fs.existsSync(keyPath)) {
      this.privateKey = fs.readFileSync(keyPath, 'utf8');
    } else {
      this.privateKey = '';
    }
  }

  @Post('sign')
  @ApiOperation({ summary: 'Assinar mensagem para QZ Tray' })
  sign(@Body('request') request: string): { signature: string } {
    if (!request) {
      throw new HttpException('Campo "request" é obrigatório', HttpStatus.BAD_REQUEST);
    }
    if (!this.privateKey) {
      throw new HttpException('private-key.pem não encontrado no servidor', HttpStatus.NOT_FOUND);
    }
    try {
      const signer = crypto.createSign('SHA512');
      signer.update(request);
      signer.end();
      const signature = signer.sign(this.privateKey, 'base64');
      return { signature };
    } catch (err: any) {
      throw new HttpException(`Erro ao assinar: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
