import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeminiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GeminiResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
    };
    finish_reason: 'stop' | 'length';
  }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly modeloFallback: string[];

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('gemini.apiKey') || '';
    this.baseUrl = (config.get<string>('gemini.baseUrl') || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '');
    this.defaultModel = config.get<string>('gemini.model') || 'gemini-2.0-flash';
    this.modeloFallback = config.get<string[]>('gemini.fallbackModels') || [];
    if (!this.apiKey) {
      this.logger.warn('GEMINI_API_KEY não configurada');
    }
  }

  private get isGoogle(): boolean {
    return this.baseUrl.includes('generativelanguage.googleapis.com');
  }

  private async request(
    messages: GeminiMessage[],
    model?: string,
    maxTokens = 800,
  ): Promise<GeminiResponse> {
    const body: Record<string, unknown> = {
      model: model || this.defaultModel,
      messages,
      max_tokens: maxTokens,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    };

    const inicio = Date.now();
    const url = `${this.baseUrl}/chat/completions`;
    this.logger.log(`[GEMINI] POST ${url} | modelo=${model || this.defaultModel} | messages=${messages.length}`);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      this.logger.error(`[GEMINI] ERRO de rede ao chamar API: ${err.message}`);
      throw err;
    }

    this.logger.log(`[GEMINI] HTTP ${res.status} em ${Date.now() - inicio}ms`);

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`[GEMINI] API error (${res.status}): ${text}`);
      throw new Error(`Gemini API error: ${res.status} ${text}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    this.logger.log(`[GEMINI] resposta ok | finish_reason=${choice?.finish_reason} | tokens=${data.usage?.total_tokens}`);
    return data;
  }

  private isQuotaError(err: any): boolean {
    return /429|RESOURCE_EXHAUSTED|quota|limit/i.test(err?.message || '');
  }

  private isModelUnavailable(err: any): boolean {
    return /404|NOT_FOUND|no longer available/i.test(err?.message || '');
  }

  private extrairRetryDelay(err: any): number {
    const msg = err?.message || '';
    const m = msg.match(/retry in ([\d.]+)s/i) || msg.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
    return m ? Math.min(parseFloat(m[1]), 60) : 0;
  }

  private async requestComRetry(
    messages: GeminiMessage[],
    model?: string,
    maxTokens?: number,
  ): Promise<GeminiResponse> {
    const principal = model || this.defaultModel;
    // Em provedores externos (ex.: Groq) ignora nomes de modelo exclusivos do Gemini
    const modelo = !this.isGoogle && principal.startsWith('gemini-') ? this.defaultModel : principal;
    const fila = this.isGoogle
      ? [modelo, ...this.modeloFallback.filter((m) => m !== modelo)]
      : [modelo, ...this.modeloFallback.filter((m) => m !== modelo && !m.startsWith('gemini-'))];
    let ultimoErro: any;

    for (const m of fila) {
      try {
        return await this.request(messages, m, maxTokens);
      } catch (err: any) {
        ultimoErro = err;
        if (this.isModelUnavailable(err)) {
          this.logger.warn(`[GEMINI] modelo ${m} indisponivel (404) - tentando proximo`);
          continue;
        }
        if (!this.isQuotaError(err)) throw err;
        this.logger.warn(`[GEMINI] quota/429 no modelo ${m}: ${(err?.message || '').slice(0, 300)}`);

        const delay = this.extrairRetryDelay(err);
        if (delay > 0) {
          this.logger.log(`[GEMINI] aguardando ${delay}s antes de nova tentativa`);
          await new Promise((r) => setTimeout(r, delay * 1000));
          try {
            return await this.request(messages, m, maxTokens);
          } catch (err2: any) {
            ultimoErro = err2;
            this.logger.error(`[GEMINI] nova tentativa no modelo ${m} falhou: ${(err2?.message || '').slice(0, 300)}`);
          }
        }
      }
    }

    throw ultimoErro;
  }

  async generateResponse(
    systemPrompt: string,
    conversation: { role: 'user' | 'assistant'; content: string }[],
    userMessage: string,
    model?: string,
  ): Promise<{ content: string | null; tokens: number }> {
    const messages: GeminiMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversation.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const response = await this.requestComRetry(messages, model);
    return {
      content: response.choices[0].message.content,
      tokens: response.usage.total_tokens,
    };
  }

  async textToSpeech(texto: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    if (!this.apiKey || !texto.trim() || !this.isGoogle) return null;

    const model = 'gemini-2.5-flash-preview-tts';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    try {
      this.logger.log(`[GEMINI] TTS solicitado para ${texto.length} caracteres`);
      const inicio = Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: texto }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            voiceName: 'Kore',
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`[GEMINI] TTS error (${res.status}): ${text.slice(0, 300)}`);
        return null;
      }

      const data = await res.json();
      const parts: Array<{ inlineData?: { data?: string; mimeType?: string } }> =
        data.candidates?.[0]?.content?.parts || [];
      const audioPart = parts.find((p) => p.inlineData?.data);
      if (!audioPart?.inlineData?.data) {
        this.logger.warn(`[GEMINI] TTS sem audio na resposta`);
        return null;
      }

      this.logger.log(`[GEMINI] TTS concluido em ${Date.now() - inicio}ms`);
      return {
        buffer: Buffer.from(audioPart.inlineData.data, 'base64'),
        mimeType: audioPart.inlineData.mimeType || 'audio/ogg',
      };
    } catch (err: any) {
      this.logger.error(`[GEMINI] TTS erro: ${err.message}`);
      return null;
    }
  }

  async transcribeAudio(buffer: Buffer, mimeType?: string): Promise<string> {
    if (!this.isGoogle) {
      return this.transcreverOpenaiCompatible(buffer, mimeType);
    }

    const model = this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const transcrever = async (): Promise<string> => {
      const body = {
        contents: [
          {
            parts: [
              { text: 'Transcreva o audio abaixo para texto. Responda apenas com o texto transcrito, sem comentarios.' },
              { inline_data: { mime_type: mimeType || 'audio/mp3', data: buffer.toString('base64') } },
            ],
          },
        ],
      };

      this.logger.log(`[GEMINI] transcrevendo audio (${buffer.length} bytes, mime=${mimeType || 'audio/mp3'})`);
      const inicio = Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gemini transcribe error: ${res.status} ${text}`);
      }

      const data = await res.json();
      const parts: Array<{ text?: string }> = data.candidates?.[0]?.content?.parts || [];
      const texto = parts.map((p) => p.text || '').join(' ').trim();
      this.logger.log(`[GEMINI] transcricao em ${Date.now() - inicio}ms: "${texto.slice(0, 200)}"`);
      return texto;
    };

    try {
      return await transcrever();
    } catch (err: any) {
      if (this.isQuotaError(err)) {
        const delay = this.extrairRetryDelay(err);
        this.logger.warn(`[GEMINI] quota ao transcrever - aguardando ${delay}s e tentando de novo`);
        if (delay > 0) await new Promise((r) => setTimeout(r, delay * 1000));
        return transcrever();
      }
      throw err;
    }
  }

  /**
   * Transcrição via endpoint OpenAI-compatível (ex.: Groq whisper-large-v3).
   * Usado quando GEMINI_BASE_URL aponta para um provedor externo.
   */
  private async transcreverOpenaiCompatible(buffer: Buffer, mimeType?: string): Promise<string> {
    const ext = mimeType?.includes('ogg') ? 'ogg' : mimeType?.includes('mp4') ? 'm4a' : 'mp3';
    const form = new FormData();
    form.append('model', 'whisper-large-v3');
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType || 'audio/mpeg' }), `audio.${ext}`);

    this.logger.log(`[GEMINI] transcrevendo via OpenAI-compatível (${this.baseUrl})`);
    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`[GEMINI] transcricao OpenAI-compatível error (${res.status}): ${text.slice(0, 300)}`);
      throw new Error(`Transcription error: ${res.status} ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const texto = (data.text || '').trim();
    this.logger.log(`[GEMINI] transcricao OpenAI-compatível: "${texto.slice(0, 200)}"`);
    return texto;
  }
}
