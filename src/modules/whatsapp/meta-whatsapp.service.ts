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
  private readonly apiVersion = 'v22.0';
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.token = config.get<string>('meta.token') || '';
    this.phoneNumberId = config.get<string>('meta.phoneNumberId') || '';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

    if (!this.token || !this.phoneNumberId) {
      this.logger.warn('Meta WhatsApp configuracao incompleta');
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
    if (!this.token || !this.phoneNumberId) {
      this.logger.error('Meta WhatsApp nao configurado');
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
          type: 'text',
          text: { preview_url: false, body: text },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        this.logger.error(`Erro ao enviar mensagem: ${JSON.stringify(data)}`);
        return { success: false, error: data.error?.message || 'Erro desconhecido' };
      }

      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (err: any) {
      this.logger.error(`Erro ao enviar mensagem via Meta: ${err.message}`);
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
}
