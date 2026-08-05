import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MesasService } from './mesas.service';
import { PrismaService } from '../../infra/database/prisma.service';

const mockPrisma = {
  negocio: {
    findUnique: jest.fn(),
  },
  mesa: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
};

describe('MesasService', () => {
  let service: MesasService;
  let prisma: typeof mockPrisma;

  const mesaPadrao = {
    id: 'mesa1',
    negocioId: 'n1',
    numero: 1,
    nome: 'Mesa 1',
    status: 'LIVRE',
    ativa: true,
    sessionId: null,
    qrCodeToken: 'token-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MesasService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MesasService>(MesasService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('criar', () => {
    it('deve lançar NotFoundException quando o negócio não existir', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue(null);

      await expect(service.criar('n1', { numero: 1 } as any)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException quando o negócio não for de comida', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1', tipo: 'ROUPA' });

      await expect(service.criar('n1', { numero: 1 } as any)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException quando já existir mesa com o mesmo número', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1', tipo: 'COMIDA' });
      mockPrisma.mesa.findFirst.mockResolvedValue({ id: 'mesa1' });

      await expect(service.criar('n1', { numero: 1 } as any)).rejects.toThrow(BadRequestException);
    });

    it('deve criar a mesa com sucesso gerando qrCodeToken', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1', tipo: 'COMIDA' });
      mockPrisma.mesa.findFirst.mockResolvedValue(null);
      mockPrisma.mesa.create.mockResolvedValue(mesaPadrao);

      const result = await service.criar('n1', { numero: 1, nome: 'Mesa 1' } as any);

      expect(result.id).toBe('mesa1');
      const data = mockPrisma.mesa.create.mock.calls[0][0].data;
      expect(data.negocioId).toBe('n1');
      expect(data.numero).toBe(1);
      expect(data.nome).toBe('Mesa 1');
      expect(data.qrCodeToken).toBeTruthy();
    });
  });

  describe('listar', () => {
    it('deve listar as mesas do negócio ordenadas por número', async () => {
      mockPrisma.mesa.findMany.mockResolvedValue([mesaPadrao]);

      const result = await service.listar('n1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.mesa.findMany).toHaveBeenCalledWith({
        where: { negocioId: 'n1' },
        orderBy: { numero: 'asc' },
      });
    });
  });

  describe('atualizar', () => {
    it('deve lançar NotFoundException quando a mesa não existir', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(null);

      await expect(service.atualizar('n1', 'mesa1', { nome: 'Nova' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve atualizar a mesa com sucesso', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(mesaPadrao);
      mockPrisma.mesa.update.mockResolvedValue({ ...mesaPadrao, nome: 'Mesa 1 - Janela' });

      const result = await service.atualizar('n1', 'mesa1', { nome: 'Mesa 1 - Janela' } as any);

      expect(result.nome).toBe('Mesa 1 - Janela');
      expect(mockPrisma.mesa.update).toHaveBeenCalledWith({
        where: { id: 'mesa1' },
        data: { nome: 'Mesa 1 - Janela' },
      });
    });
  });

  describe('remover', () => {
    it('deve lançar NotFoundException quando a mesa não existir', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(null);

      await expect(service.remover('n1', 'mesa1')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException quando a mesa estiver ocupada', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue({ ...mesaPadrao, status: 'OCUPADA' });

      await expect(service.remover('n1', 'mesa1')).rejects.toThrow(BadRequestException);
    });

    it('deve remover a mesa com sucesso', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(mesaPadrao);
      mockPrisma.mesa.delete.mockResolvedValue(mesaPadrao);

      const result = await service.remover('n1', 'mesa1');

      expect(result).toEqual({ removido: true });
      expect(mockPrisma.mesa.delete).toHaveBeenCalledWith({ where: { id: 'mesa1' } });
    });
  });

  describe('ocupar (abrir mesa/conta)', () => {
    it('deve ocupar a mesa e retornar qrUrl com sucesso', async () => {
      mockPrisma.mesa.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.mesa.findUnique.mockResolvedValue({
        id: 'mesa1',
        numero: 1,
        qrCodeToken: 'token-1',
      });
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1', slug: 'meu-slug' });

      const result = await service.ocupar('n1', 'mesa1');

      expect(mockPrisma.mesa.updateMany).toHaveBeenCalledWith({
        where: { id: 'mesa1', negocioId: 'n1', ativa: true, status: { not: 'OCUPADA' } },
        data: { status: 'OCUPADA', sessionId: expect.any(String) },
      });
      expect(result.mesaId).toBe('mesa1');
      expect(result.sessionId).toBeTruthy();
      expect(result.qrUrl).toBe('/vitrine/meu-slug?mesaToken=token-1');
    });

    it('deve lançar NotFoundException quando a mesa não existir ou estiver inativa', async () => {
      mockPrisma.mesa.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.mesa.findFirst.mockResolvedValue(null);

      await expect(service.ocupar('n1', 'mesa1')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException quando a mesa já estiver ocupada', async () => {
      mockPrisma.mesa.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.mesa.findFirst.mockResolvedValue({ id: 'mesa1', ativa: true });

      await expect(service.ocupar('n1', 'mesa1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('liberar (fechar mesa/conta)', () => {
    it('deve liberar a mesa com sucesso', async () => {
      mockPrisma.mesa.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.liberar('n1', 'mesa1');

      expect(result).toEqual({ mesaId: 'mesa1', status: 'LIVRE' });
      expect(mockPrisma.mesa.updateMany).toHaveBeenCalledWith({
        where: { id: 'mesa1', negocioId: 'n1', status: 'OCUPADA' },
        data: { status: 'LIVRE', sessionId: null },
      });
    });

    it('deve lançar NotFoundException quando a mesa não existir', async () => {
      mockPrisma.mesa.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.mesa.findFirst.mockResolvedValue(null);

      await expect(service.liberar('n1', 'mesa1')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException quando a mesa não estiver ocupada', async () => {
      mockPrisma.mesa.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.mesa.findFirst.mockResolvedValue(mesaPadrao);

      await expect(service.liberar('n1', 'mesa1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('validarMesaPorToken', () => {
    it('deve lançar NotFoundException quando o negócio não existir', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue(null);

      await expect(service.validarMesaPorToken('slug', 'token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar NotFoundException quando a mesa for inválida ou inativa', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1', nome: 'Negócio', slug: 'slug' });
      mockPrisma.mesa.findFirst.mockResolvedValue(null);

      await expect(service.validarMesaPorToken('slug', 'token-invalido')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve validar a mesa pelo token com sucesso', async () => {
      const negocio = { id: 'n1', nome: 'Negócio', slug: 'slug' };
      mockPrisma.negocio.findUnique.mockResolvedValue(negocio);
      mockPrisma.mesa.findFirst.mockResolvedValue({ id: 'mesa1', numero: 1, nome: 'Mesa 1' });

      const result = await service.validarMesaPorToken('slug', 'token-1');

      expect(result.mesaId).toBe('mesa1');
      expect(result.negocio).toEqual(negocio);
    });
  });
});
