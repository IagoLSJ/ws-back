import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from './gemini.service';

const respostaOk = {
  id: 'x',
  choices: [{ index: 0, message: { role: 'assistant', content: '{"resposta":"oi","acao":"responder"}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

function mockFetch(fn: jest.Mock) {
  (global as any).fetch = fn;
}

function configStub(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string) => {
      const map: Record<string, unknown> = {
        'gemini.apiKey': 'test-key',
        'gemini.baseUrl': 'https://api.exemplo.com',
        'gemini.model': 'meu-modelo',
        'gemini.fallbackModels': [],
        ...overrides,
      };
      return map[key];
    }),
  };
}

describe('GeminiService', () => {
  let service: GeminiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeminiService, { provide: ConfigService, useValue: configStub() }],
    }).compile();
    service = module.get<GeminiService>(GeminiService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('generateResponse: monta mensagens e retorna conteúdo + tokens', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => respostaOk,
    });
    mockFetch(fetchMock);

    const res = await service.generateResponse('system', [{ role: 'user', content: 'olá' }], 'cardápio?');

    expect(res.content).toContain('oi');
    expect(res.tokens).toBe(15);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages.at(-1).content).toBe('cardápio?');
    expect(body.max_tokens).toBe(800);
  });

  it('generateResponse: propaga erro de API (não-quota)', async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'erro interno' }));
    await expect(service.generateResponse('s', [], 'oi')).rejects.toThrow('Gemini API error');
  });

  it('textToSpeech: retorna null quando NÃO é Google (provedor externo)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        GeminiService,
        { provide: ConfigService, useValue: configStub({ 'gemini.baseUrl': 'https://groq.exemplo/v1' }) },
      ],
    }).compile();
    const svc = module.get<GeminiService>(GeminiService);
    await expect(svc.textToSpeech('teste')).resolves.toBeNull();
  });

  it('transcribeAudio: usa caminho OpenAI-compatível quando não é Google', async () => {
    const module = await Test.createTestingModule({
      providers: [
        GeminiService,
        { provide: ConfigService, useValue: configStub({ 'gemini.baseUrl': 'https://groq.exemplo/v1' }) },
      ],
    }).compile();
    const svc = module.get<GeminiService>(GeminiService);

    mockFetch(jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: 'transcrito' }) }));
    const texto = await svc.transcribeAudio(Buffer.from('audio'));
    expect(texto).toBe('transcrito');
  });
});
