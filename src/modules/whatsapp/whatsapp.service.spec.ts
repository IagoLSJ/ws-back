import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../../infra/database/prisma.service';
import { CarrinhoService } from '../carrinho/carrinho.service';
import { PedidosService } from '../pedidos/pedidos.service';

const mockPrisma = {
  negocio: { findUnique: jest.fn() },
  clienteWhatsApp: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  pedido: { findMany: jest.fn() },
};

const mockCarrinho = { adicionar: jest.fn() };
const mockPedidos = { checkout: jest.fn() };

describe('WhatsappService', () => {
  let service: WhatsappService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CarrinhoService, useValue: mockCarrinho },
        { provide: PedidosService, useValue: mockPedidos },
      ],
    }).compile();
    service = module.get<WhatsappService>(WhatsappService);
    jest.clearAllMocks();
  });

  describe('resolveNegocioId', () => {
    it('lança 404 quando negócio não existe', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue(null);
      await expect(service.resolveNegocioId('slug-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna id quando negócio existe', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      await expect(service.resolveNegocioId('slug-x')).resolves.toBe('n1');
    });
  });

  describe('criarPedido', () => {
    it('cria cliente, adiciona itens ao carrinho e faz checkout', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.clienteWhatsApp.findUnique.mockResolvedValue(null);
      mockPrisma.clienteWhatsApp.create.mockResolvedValue({ id: 'c1', sessionId: 'sess-1' });
      mockCarrinho.adicionar.mockResolvedValue(undefined);
      mockPedidos.checkout.mockResolvedValue({ id: 'ped-1' });

      const result = await service.criarPedido('slug-x', {
        telefone: '5511999999999',
        itens: [{ produtoId: 'p1', quantidade: 2 }],
      });

      expect(mockCarrinho.adicionar).toHaveBeenCalledWith('slug-x', 'sess-1', {
        produtoId: 'p1',
        quantidade: 2,
        observacao: undefined,
        opcoesSelecionadas: undefined,
      });
      expect(mockPedidos.checkout).toHaveBeenCalled();
      expect(result.id).toBe('ped-1');
    });
  });

  describe('meusPedidos', () => {
    it('retorna [] quando cliente não existe', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.clienteWhatsApp.findUnique.mockResolvedValue(null);
      await expect(service.meusPedidos('slug-x', '5511999999999')).resolves.toEqual([]);
    });

    it('lista pedidos do cliente ordenados', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.clienteWhatsApp.findUnique.mockResolvedValue({ id: 'c1', sessionId: 'sess-1' });
      mockPrisma.pedido.findMany.mockResolvedValue([{ id: 'p1' }]);

      const result = await service.meusPedidos('slug-x', '5511999999999');
      expect(result).toEqual([{ id: 'p1' }]);
      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { negocioId: 'n1', sessionId: 'sess-1' } }),
      );
    });
  });
});
