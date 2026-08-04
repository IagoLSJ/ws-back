import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface MetaProfile {
  name: string;
}

@Injectable()
export class MetaWhatsappService {
  private readonly logger = new Logger(MetaWhatsappService.name);
  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.token = config.get<string>('meta.token') || '';
    this.phoneNumberId = config.get<string>('meta.phoneNumberId') || '';
    const apiVersion = config.get<string>('meta.apiVersion') || 'v22.0';
    const base = (config.get<string>('meta.baseUrl') || 'https://graph.facebook.com').replace(/\/+$/, '');
    this.baseUrl = `${base}/${apiVersion}`;
    this.logger.log(`[META] baseUrl=${this.baseUrl} | phoneNumberId=${this.phoneNumberId || '(vazio)'}`);

    if (!this.token || !this.phoneNumberId) {
      this.logger.warn('[META] configuracao incompleta');
    }
  }

  verifyWebhook(mode: string | undefined, token: string | undefined, challenge: string | undefined): string | null {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || '';

    if (mode === 'subscribe' && token === verifyToken && challenge) {
      this.logger.log('Webhook verificado com sucesso');
      return challenge;
    }

    this.logger.warn('Falha na verificacao do webhook');
    return null;
  }

  async sendText(to: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    this.logger.log(`[META] sendText para ${to} | tamanho=${text.length} | preview="${text.slice(0, 60)}..."`);
    if (!this.token || !this.phoneNumberId) {
      this.logger.error(`[META] nao configurado: token=${!!this.token} phoneNumberId=${!!this.phoneNumberId}`);
      return { success: false, error: 'Meta WhatsApp nao configurado' };
    }

    const inicio = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: text },
        }),
      });

      const data = await res.json();
      this.logger.log(`[META] sendText HTTP ${res.status} em ${Date.now() - inicio}ms`);

      if (!res.ok) {
        this.logger.error(`[META] erro ao enviar: ${JSON.stringify(data)}`);
        return { success: false, error: data.error?.message || 'Erro desconhecido' };
      }

      const messageId = data.messages?.[0]?.id;
      this.logger.log(`[META] mensagem enviada com sucesso, id=${messageId}`);
      return { success: true, messageId };
    } catch (err: any) {
      this.logger.error(`[META] erro de rede ao enviar: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    if (!this.token || !this.phoneNumberId) return;

    try {
      await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });
    } catch {
      // Ignora erros ao marcar como lida
    }
  }

  async uploadMedia(buffer: Buffer, mimeType: string): Promise<string | null> {
    if (!this.token || !this.phoneNumberId) return null;

    const extensao = mimeType.includes('mpeg')
      ? 'mp3'
      : mimeType.includes('wav')
        ? 'wav'
        : mimeType.includes('mp4') || mimeType.includes('aac')
          ? 'm4a'
          : 'ogg';
    const nomeArquivo = `audio-${Date.now()}.${extensao}`;
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), nomeArquivo);

    try {
      const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        this.logger.error(`[META] uploadMedia error: ${JSON.stringify(data)}`);
        return null;
      }
      this.logger.log(`[META] media enviada, id=${data.id}`);
      return data.id || null;
    } catch (err: any) {
      this.logger.error(`[META] uploadMedia rede: ${err.message}`);
      return null;
    }
  }

  async sendAudio(
    to: string,
    mediaId: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    this.logger.log(`[META] sendAudio para ${to} | mediaId=${mediaId}`);
    if (!this.token || !this.phoneNumberId) {
      return { success: false, error: 'Meta WhatsApp nao configurado' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'audio',
          audio: { id: mediaId },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        this.logger.error(`[META] erro ao enviar audio: ${JSON.stringify(data)}`);
        return { success: false, error: data.error?.message || 'Erro desconhecido' };
      }

      const messageId = data.messages?.[0]?.id;
      this.logger.log(`[META] audio enviado com sucesso, id=${messageId}`);
      return { success: true, messageId };
    } catch (err: any) {
      this.logger.error(`[META] erro de rede ao enviar audio: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async sendImage(
    to: string,
    link: string,
    caption?: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    this.logger.log(`[META] sendImage para ${to} | link=${link}`);
    if (!this.token || !this.phoneNumberId) {
      return { success: false, error: 'Meta WhatsApp nao configurado' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'image',
          image: {
            link,
            ...(caption ? { caption } : {}),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        this.logger.error(`[META] erro ao enviar imagem: ${JSON.stringify(data)}`);
        return { success: false, error: data.error?.message || 'Erro desconhecido' };
      }

      const messageId = data.messages?.[0]?.id;
      this.logger.log(`[META] imagem enviada com sucesso, id=${messageId}`);
      return { success: true, messageId };
    } catch (err: any) {
      this.logger.error(`[META] erro de rede ao enviar imagem: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async sendInteractiveButtons(
    to: string,
    body: string,
    buttons: { id: string; title: string }[],
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.token || !this.phoneNumberId) return { success: false, error: 'Nao configurado' };

    try {
      const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: body },
            action: {
              buttons: buttons.slice(0, 3).map((b) => ({
                type: 'reply',
                reply: { id: b.id, title: b.title.slice(0, 20) },
              })),
            },
          },
        }),
      });

      const data = await res.json();
      return res.ok
        ? { success: true, messageId: data.messages?.[0]?.id }
        : { success: false, error: data.error?.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setWebhookProfile(profile: MetaProfile): Promise<void> {
    if (!this.token || !this.phoneNumberId) return;

    try {
      await fetch(`${this.baseUrl}/${this.phoneNumberId}/whatsapp_business_profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          ...profile,
        }),
      });
    } catch {
      // opcional
    }
  }

  async getMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    this.logger.log(`[META] getMedia ${mediaId}`);
    if (!this.token) throw new Error('Meta WhatsApp nao configurado');

    const infoRes = await fetch(`${this.baseUrl}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!infoRes.ok) {
      const text = await infoRes.text();
      throw new Error(`Erro ao obter media info (${infoRes.status}): ${text}`);
    }
    const info = await infoRes.json();

    const url = info.url;
    const mimeType = info.mime_type || 'audio/ogg';
    if (!url) throw new Error('Media sem URL retornada pela Meta');

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro ao baixar media (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    this.logger.log(`[META] media baixada: ${buffer.length} bytes | mime=${mimeType}`);
    return { buffer, mimeType };
  }
}
