import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WhatsappAdminService } from './whatsapp-admin.service';
import { PrismaService } from '../../infra/database/prisma.service';
import { MetaWhatsappService } from './meta-whatsapp.service';

const mockPrisma = {
  clienteWhatsApp: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  mensagemWhatsApp: { findMany: jest.fn(), create: jest.fn() },
};

const mockMeta = { sendText: jest.fn() };

describe('WhatsappAdminService', () => {
  let service: WhatsappAdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappAdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MetaWhatsappService, useValue: mockMeta },
      ],
    }).compile();
    service = module.get<WhatsappAdminService>(WhatsappAdminService);
    jest.clearAllMocks();
  });

  describe('listarConversas', () => {
    it('mapeia a última mensagem de cada conversa', async () => {
      mockPrisma.clienteWhatsApp.findMany.mockResolvedValue([
        { id: 'c1', telefone: '5511999999999', nome: 'Ana', modoHumano: false, ultimaInteracao: new Date(), mensagens: [{ texto: 'oi' }] },
        { id: 'c2', telefone: '5511888888888', nome: null, modoHumano: true, ultimaInteracao: new Date(), mensagens: [] },
      ]);
      const result = await service.listarConversas('n1');
      expect(result[0].ultimaMensagem).toBe('oi');
      expect(result[1].ultimaMensagem).toBeNull();
      expect(result[1].modoHumano).toBe(true);
    });
  });

  describe('mensagens', () => {
    it('lança 404 quando a conversa não pertence ao negócio', async () => {
      mockPrisma.clienteWhatsApp.findFirst.mockResolvedValue(null);
      await expect(service.mensagens('n1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna cliente + mensagens ordenadas', async () => {
      mockPrisma.clienteWhatsApp.findFirst.mockResolvedValue({ id: 'c1', nome: 'Ana' });
      mockPrisma.mensagemWhatsApp.findMany.mockResolvedValue([{ texto: 'oi' }]);
      const result = await service.mensagens('n1', 'c1');
      expect(result.cliente.nome).toBe('Ana');
      expect(result.mensagens).toEqual([{ texto: 'oi' }]);
    });
  });

  describe('enviarMensagem', () => {
    it('lança BadRequest para texto vazio', async () => {
      await expect(service.enviarMensagem('n1', 'c1', '   ')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança 404 para conversa inexistente', async () => {
      mockPrisma.clienteWhatsApp.findFirst.mockResolvedValue(null);
      await expect(service.enviarMensagem('n1', 'c1', 'olá')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('salva mensagem e envia via Meta', async () => {
      mockPrisma.clienteWhatsApp.findFirst.mockResolvedValue({ id: 'c1', telefone: '+55 11 99999-0000' });
      mockPrisma.mensagemWhatsApp.create.mockResolvedValue({ id: 'm1', texto: 'olá' });
      mockMeta.sendText.mockResolvedValue({ success: true });

      const result = await service.enviarMensagem('n1', 'c1', '  olá  ');
      expect(result.texto).toBe('olá');
      expect(mockMeta.sendText).toHaveBeenCalledWith('5511999990000', 'olá');
    });
  });

  describe('alternarModo', () => {
    it('lança 404 quando conversa não existe', async () => {
      mockPrisma.clienteWhatsApp.findFirst.mockResolvedValue(null);
      await expect(service.alternarModo('n1', 'c1', true)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('atualiza modoHumano', async () => {
      mockPrisma.clienteWhatsApp.findFirst.mockResolvedValue({ id: 'c1' });
      mockPrisma.clienteWhatsApp.update.mockResolvedValue({ id: 'c1', modoHumano: true });
      const result = await service.alternarModo('n1', 'c1', true);
      expect(mockPrisma.clienteWhatsApp.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { modoHumano: true } }),
      );
      expect(result.modoHumano).toBe(true);
    });
  });
});
