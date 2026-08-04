import { Injectable, Logger } from '@nestjs/common';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export interface AudioSintetizado {
  buffer: Buffer;
  mimeType: string;
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly voz = 'pt-BR-FranciscaNeural';

  /**
   * Converte texto em áudio usando o Edge TTS (Microsoft Read Aloud).
   * Gratuito, sem chave, vozes neurais em português brasileiro.
   */
  async synthesize(texto: string): Promise<AudioSintetizado | null> {
    const limpo = texto.trim();
    if (!limpo) return null;

    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(this.voz, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = await tts.toStream(limpo);

      const chunks: Buffer[] = [];
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        audioStream.on('data', (d: Buffer) => chunks.push(d));
        audioStream.on('error', (e) => reject(e));
        audioStream.on('close', () => resolve(Buffer.concat(chunks)));
      });

      if (!buffer.length) {
        this.logger.warn('[TTS] EdgeTTS retornou audio vazio');
        return null;
      }

      this.logger.log(`[TTS] audio gerado (${buffer.length} bytes)`);
      return { buffer, mimeType: 'audio/mpeg' };
    } catch (err: any) {
      this.logger.error(`[TTS] EdgeTTS erro: ${err.message}`);
      return null;
    }
  }
}
