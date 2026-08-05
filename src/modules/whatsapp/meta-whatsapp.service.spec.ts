import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaWhatsappService } from './meta-whatsapp.service';

function configStub(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string) => {
      const map: Record<string, unknown> = {
        'meta.token': 'tok',
        'meta.phoneNumberId': '123456',
        'meta.apiVersion': 'v22.0',
        'meta.baseUrl': 'https://graph.facebook.com',
        ...overrides,
      };
      return map[key];
    }),
  };
}

function jsonRes(ok: boolean, status: number, data: unknown) {
  return { ok, status, json: async () => data };
}

describe('MetaWhatsappService', () => {
  let service: MetaWhatsappService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetaWhatsappService, { provide: ConfigService, useValue: configStub() }],
    }).compile();
    service = module.get<MetaWhatsappService>(MetaWhatsappService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('verifyWebhook', () => {
    it('valida corretamente quando token confere', () => {
      process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-secret';
      expect(service.verifyWebhook('subscribe', 'verify-secret', 'challenge123')).toBe('challenge123');
    });

    it('retorna null em falha', () => {
      process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-secret';
      expect(service.verifyWebhook('subscribe', 'errado', 'challenge')).toBeNull();
      expect(service.verifyWebhook('other', 'verify-secret', 'challenge')).toBeNull();
    });
  });

  describe('sendText', () => {
    it('envia mensagem com sucesso', async () => {
      (global as any).fetch = jest.fn().mockResolvedValue(jsonRes(true, 200, { messages: [{ id: 'wamid-1' }] }));
      const res = await service.sendText('5511999999999', 'Olá');
      expect(res.success).toBe(true);
      expect(res.messageId).toBe('wamid-1');
    });

    it('retorna erro quando a API falha', async () => {
      (global as any).fetch = jest.fn().mockResolvedValue(jsonRes(false, 400, { error: { message: 'bad request' } }));
      const res = await service.sendText('5511999999999', 'Olá');
      expect(res.success).toBe(false);
      expect(res.error).toBe('bad request');
    });

    it('retorna erro quando não configurado', async () => {
      const module = await Test.createTestingModule({
        providers: [
          MetaWhatsappService,
          { provide: ConfigService, useValue: configStub({ 'meta.token': '', 'meta.phoneNumberId': '' }) },
        ],
      }).compile();
      const svc = module.get<MetaWhatsappService>(MetaWhatsappService);
      const res = await svc.sendText('5511999999999', 'Oi');
      expect(res.success).toBe(false);
      expect(res.error).toContain('nao configurado');
    });
  });

  describe('sendAudio', () => {
    it('envia audio com sucesso', async () => {
      (global as any).fetch = jest.fn().mockResolvedValue(jsonRes(true, 200, { messages: [{ id: 'wamid-audio' }] }));
      const res = await service.sendAudio('5511999999999', 'media-id');
      expect(res.success).toBe(true);
      expect(res.messageId).toBe('wamid-audio');
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.type).toBe('audio');
      expect(body.audio.id).toBe('media-id');
    });
  });

  describe('sendImage', () => {
    it('envia imagem com legenda', async () => {
      (global as any).fetch = jest.fn().mockResolvedValue(jsonRes(true, 200, { messages: [{ id: 'wamid-img' }] }));
      const res = await service.sendImage('5511999999999', 'https://x/imagem.png', 'legenda');
      expect(res.success).toBe(true);
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.type).toBe('image');
      expect(body.image.caption).toBe('legenda');
    });
  });

  describe('getMedia', () => {
    it('baixa media e retorna buffer', async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonRes(true, 200, { url: 'https://cdn/media.bin', mime_type: 'audio/ogg' }))
        .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
      const res = await service.getMedia('media-id');
      expect(res.mimeType).toBe('audio/ogg');
      expect(res.buffer.length).toBe(3);
    });

    it('lança erro quando a media não tem URL', async () => {
      (global as any).fetch = jest.fn().mockResolvedValue(jsonRes(true, 200, {}));
      await expect(service.getMedia('media-id')).rejects.toThrow('Media sem URL');
    });
  });

  describe('sendInteractiveButtons', () => {
    it('limita a 3 botões e envia', async () => {
      (global as any).fetch = jest.fn().mockResolvedValue(jsonRes(true, 200, { messages: [{ id: 'wamid-btn' }] }));
      const res = await service.sendInteractiveButtons('5511999999999', 'Escolha', [
        { id: '1', title: 'Um' },
        { id: '2', title: 'Dois' },
        { id: '3', title: 'Três' },
        { id: '4', title: 'Quatro' },
      ]);
      expect(res.success).toBe(true);
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.interactive.action.buttons.length).toBe(3);
    });
  });
});
