import { Test, TestingModule } from '@nestjs/testing';
import { ChatbotService } from './chatbot.service';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { GeminiService } from './gemini.service';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { ImprimirService } from '../imprimir/imprimir.service';

const mockPrisma = {
  clienteWhatsApp: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  configuracaoNegocio: { findUnique: jest.fn() },
  mensagemWhatsApp: { create: jest.fn() },
  produto: { findFirst: jest.fn(), findMany: jest.fn() },
  opcaoModificador: { findMany: jest.fn() },
  negocio: { findUnique: jest.fn() },
  pedido: { create: jest.fn() },
};

const mockRedis = {
  set: jest.fn().mockResolvedValue(true),
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

const mockGemini = { generateResponse: jest.fn() };
const mockMeta = {};
const mockImprimir = { imprimirComanda: jest.fn().mockResolvedValue(undefined) };

function configChatbot(overrides: Record<string, unknown> = {}) {
  return {
    negocioId: 'n1',
    chatbotAtivo: true,
    mensagemBoasVindas: null,
    mensagemFallback: 'Atendimento indisponivel no momento.',
    systemPrompt: null,
    modeloIa: null,
    cardapioImagens: null,
    ...overrides,
  };
}

describe('ChatbotService', () => {
  let service: ChatbotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatbotService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: GeminiService, useValue: mockGemini },
        { provide: MetaWhatsappService, useValue: mockMeta },
        { provide: ImprimirService, useValue: mockImprimir },
      ],
    }).compile();
    service = module.get<ChatbotService>(ChatbotService);
    jest.clearAllMocks();
    mockPrisma.clienteWhatsApp.findUnique.mockResolvedValue({
      id: 'c1',
      sessionId: 'sess-1',
      modoHumano: false,
      contexto: { historico: [], estado: 'INICIAL' },
    });
    mockPrisma.clienteWhatsApp.update.mockResolvedValue({
      id: 'c1',
      sessionId: 'sess-1',
      modoHumano: false,
      contexto: { historico: [] },
    });
    mockPrisma.configuracaoNegocio.findUnique.mockResolvedValue(configChatbot());
  });

  it('modo humano: repassa a mensagem sem chamar a IA', async () => {
    mockPrisma.clienteWhatsApp.findUnique.mockResolvedValue({ id: 'c1', modoHumano: true });
    mockPrisma.clienteWhatsApp.update.mockResolvedValue({ id: 'c1', modoHumano: true });
    const res = await service.processar('n1', 'slug', '5511999999999', 'Ana', 'oi');
    expect(res.texto).toContain('encaminhada');
    expect(mockGemini.generateResponse).not.toHaveBeenCalled();
  });

  it('chatbot desativado: retorna mensagem fallback', async () => {
    mockPrisma.configuracaoNegocio.findUnique.mockResolvedValue(configChatbot({ chatbotAtivo: false }));
    const res = await service.processar('n1', 'slug', '5511999999999', 'Ana', 'oi');
    expect(res.texto).toBe('Atendimento indisponivel no momento.');
    expect(mockGemini.generateResponse).not.toHaveBeenCalled();
  });

  it('resposta direta: retorna o texto e salva mensagens e contexto', async () => {
    mockGemini.generateResponse.mockResolvedValue({
      content: '{"resposta":"Olá! Em que posso ajudar?","acao":"responder","intencao":"saudacao","dadosExtraidos":{},"faltando":[]}',
      tokens: 10,
    });

    const res = await service.processar('n1', 'slug', '5511999999999', 'Ana', 'oi');

    expect(res.texto).toContain('Olá!');
    expect(mockPrisma.mensagemWhatsApp.create).toHaveBeenCalledTimes(2); // cliente + bot
    expect(mockPrisma.clienteWhatsApp.update).toHaveBeenCalled();
  });

  it('mostrar_cardapio com imagens: retorna imagens do cardápio', async () => {
    mockPrisma.configuracaoNegocio.findUnique.mockResolvedValue(
      configChatbot({ cardapioImagens: ['https://x/cardapio1.png'] }),
    );
    mockGemini.generateResponse.mockResolvedValue({
      content: '{"resposta":"Aqui está!","acao":"mostrar_cardapio","intencao":"cardapio","dadosExtraidos":{},"faltando":[]}',
      tokens: 10,
    });

    const res = await service.processar('n1', 'slug', '5511999999999', 'Ana', 'cardápio');
    expect(res.texto).toContain('Aqui está');
    expect(res.imagens).toEqual(['https://x/cardapio1.png']);
  });

  it('chamar_humano: ativa modo humano e avisa', async () => {
    mockGemini.generateResponse.mockResolvedValue({
      content: '{"resposta":"","acao":"chamar_humano","intencao":"humano","dadosExtraidos":{},"faltando":[]}',
      tokens: 5,
    });

    const res = await service.processar('n1', 'slug', '5511999999999', 'Ana', 'quero falar com atendente');
    expect(res.texto).toContain('atendente humano');
    const update = mockPrisma.clienteWhatsApp.update.mock.calls.find((c) => c[0]?.data?.modoHumano === true);
    expect(update).toBeTruthy();
  });

  it('erro na IA: retorna fallback', async () => {
    mockGemini.generateResponse.mockRejectedValue(new Error('quota excedida'));
    const res = await service.processar('n1', 'slug', '5511999999999', 'Ana', 'oi');
    expect(res.texto).toBe('Atendimento indisponivel no momento.');
  });
});
