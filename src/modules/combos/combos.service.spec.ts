import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CombosService } from './combos.service';
import { PrismaService } from '../../infra/database/prisma.service';

const mockPrisma = {
  combo: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('CombosService', () => {
  let service: CombosService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CombosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CombosService>(CombosService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  const comboPadrao = {
    id: 'c1',
    negocioId: 'n1',
    nome: 'Combo Frango',
    preco: 19.9,
    ativo: true,
    destaque: 0,
    ordem: 0,
    itens: [
      {
        id: 'ci1',
        comboId: 'c1',
        produtoId: 'p1',
        quantidade: 2,
        produto: { id: 'p1', nome: 'Frango', preco: 10 },
      },
    ],
  };

  describe('criar', () => {
    it('deve criar combo com itens', async () => {
      mockPrisma.combo.create.mockResolvedValue(comboPadrao);

      const result = await service.criar('n1', {
        nome: 'Combo Frango',
        preco: 19.9,
        itens: [{ produtoId: 'p1', quantidade: 2 }],
      } as any);

      expect(result.id).toBe('c1');
      expect(mockPrisma.combo.create).toHaveBeenCalledWith({
        data: {
          nome: 'Combo Frango',
          negocioId: 'n1',
          preco: 19.9,
          itens: { create: [{ produtoId: 'p1', quantidade: 2 }] },
        },
        include: { itens: { include: { produto: { select: { id: true, nome: true, preco: true } } } } },
      });
    });

    it('deve usar quantidade padrão 1 quando o item não informar quantidade', async () => {
      mockPrisma.combo.create.mockResolvedValue(comboPadrao);

      await service.criar('n1', {
        nome: 'Combo Frango',
        preco: 19.9,
        itens: [{ produtoId: 'p1' }],
      } as any);

      const data = mockPrisma.combo.create.mock.calls[0][0].data;
      expect(data.itens.create[0]).toEqual({ produtoId: 'p1', quantidade: 1 });
    });
  });

  describe('listar', () => {
    it('deve listar todos os combos do negócio', async () => {
      mockPrisma.combo.findMany.mockResolvedValue([comboPadrao]);

      const result = await service.listar('n1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.combo.findMany.mock.calls[0][0].where).toEqual({ negocioId: 'n1' });
    });

    it('deve filtrar apenas combos ativos quando apenasAtivos for true', async () => {
      mockPrisma.combo.findMany.mockResolvedValue([]);

      await service.listar('n1', true);

      expect(mockPrisma.combo.findMany.mock.calls[0][0].where).toEqual({
        negocioId: 'n1',
        ativo: true,
      });
    });
  });

  describe('buscar', () => {
    it('deve lançar NotFoundException quando o combo não existir', async () => {
      mockPrisma.combo.findFirst.mockResolvedValue(null);

      await expect(service.buscar('inexistente', 'n1')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar o combo encontrado', async () => {
      mockPrisma.combo.findFirst.mockResolvedValue(comboPadrao);

      const result = await service.buscar('c1', 'n1');

      expect(result.id).toBe('c1');
      expect(mockPrisma.combo.findFirst).toHaveBeenCalledWith({
        where: { id: 'c1', negocioId: 'n1' },
        include: { itens: { include: { produto: { select: { id: true, nome: true, preco: true } } } } },
      });
    });
  });

  describe('atualizar', () => {
    it('deve lançar NotFoundException quando o combo não existir', async () => {
      mockPrisma.combo.findFirst.mockResolvedValue(null);

      await expect(
        service.atualizar('n1', 'c1', { nome: 'Novo' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve atualizar dados e substituir os itens quando fornecidos', async () => {
      mockPrisma.combo.findFirst.mockResolvedValue(comboPadrao);
      mockPrisma.combo.update.mockResolvedValue({ ...comboPadrao, nome: 'Combo Novo' });

      const result = await service.atualizar('n1', 'c1', {
        nome: 'Combo Novo',
        itens: [{ produtoId: 'p2', quantidade: 1 }],
      } as any);

      expect(result.nome).toBe('Combo Novo');
      expect(mockPrisma.combo.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: {
          nome: 'Combo Novo',
          itens: {
            deleteMany: {},
            create: [{ produtoId: 'p2', quantidade: 1 }],
          },
        },
        include: { itens: { include: { produto: { select: { id: true, nome: true, preco: true } } } } },
      });
    });

    it('deve atualizar apenas dados quando não houver itens', async () => {
      mockPrisma.combo.findFirst.mockResolvedValue(comboPadrao);
      mockPrisma.combo.update.mockResolvedValue({ ...comboPadrao, preco: 25 });

      await service.atualizar('n1', 'c1', { preco: 25 } as any);

      const data = mockPrisma.combo.update.mock.calls[0][0].data;
      expect(data.itens).toBeUndefined();
      expect(data.preco).toBe(25);
    });
  });

  describe('remover', () => {
    it('deve lançar NotFoundException quando o combo não existir', async () => {
      mockPrisma.combo.findFirst.mockResolvedValue(null);

      await expect(service.remover('n1', 'c1')).rejects.toThrow(NotFoundException);
    });

    it('deve remover o combo com sucesso', async () => {
      mockPrisma.combo.findFirst.mockResolvedValue(comboPadrao);
      mockPrisma.combo.delete.mockResolvedValue(comboPadrao);

      const result = await service.remover('n1', 'c1');

      expect(result).toEqual({ removido: true });
      expect(mockPrisma.combo.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });

  describe('salvarImagem', () => {
    it('deve salvar a imagem do combo', async () => {
      mockPrisma.combo.findFirst.mockResolvedValue(comboPadrao);
      mockPrisma.combo.update.mockResolvedValue({ ...comboPadrao, imagemUrl: 'https://img.com/x.png' });

      const result = await service.salvarImagem('n1', 'c1', 'https://img.com/x.png');

      expect(result.imagemUrl).toBe('https://img.com/x.png');
      expect(mockPrisma.combo.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { imagemUrl: 'https://img.com/x.png' },
      });
    });
  });
});
