import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { NegociosService } from './negocios.service';
import { PrismaService } from '../../infra/database/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { RedisService } from '../../infra/cache/redis.service';

const mockPrisma = {
  negocio: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  membroNegocio: {
    findFirst: jest.fn(),
  },
  configuracaoNegocio: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  taxaFreteBairro: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  estoqueItem: {
    updateMany: jest.fn(),
  },
};

const mockStorage = {
  getPresignedUploadUrl: jest.fn(),
  getPublicUrl: jest.fn(),
  extractKey: jest.fn(),
  deleteObject: jest.fn(),
};

const mockRedis = {
  del: jest.fn(),
};

describe('NegociosService', () => {
  let service: NegociosService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NegociosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<NegociosService>(NegociosService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  const negocioBase = {
    id: 'n1',
    nome: 'Lanchonete do João',
    slug: 'lanchonete-do-joao',
    descricao: null,
    tipo: null,
    ativo: true,
    logoUrl: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };

  describe('create', () => {
    it('deve gerar slug a partir do nome quando slug não for informado', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue(null);
      mockPrisma.negocio.create.mockResolvedValue({ ...negocioBase, slug: 'lanchonete-central' });

      await service.create({ nome: 'Lanchonete Central' } as any, 'u1');

      expect(mockPrisma.negocio.findUnique).toHaveBeenCalledWith({ where: { slug: 'lanchonete-central' } });
      expect(mockPrisma.negocio.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nome: 'Lanchonete Central',
          slug: 'lanchonete-central',
          configuracoes: { create: { controleEstoqueAtivo: true, estoqueMinimoPadrao: 5 } },
          membros: { create: { usuarioId: 'u1', role: 'SUPER_ADMIN' } },
        }),
      });
    });

    it('deve validar slug duplicado lançando ConflictException', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'outro', slug: 'lanchonete-do-joao' });

      await expect(service.create({ nome: 'Lanchonete do João', slug: 'lanchonete-do-joao' } as any, 'u1'))
        .rejects.toThrow(ConflictException);

      expect(mockPrisma.negocio.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('deve retornar negócios sem filtro quando não informar usuário', async () => {
      mockPrisma.negocio.findMany.mockResolvedValue([negocioBase]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(mockPrisma.negocio.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { criadoEm: 'desc' },
        include: { _count: { select: { membros: true, produtos: true, categorias: true, pedidos: true } } },
      });
    });

    it('deve retornar todos os negócios quando usuário for SUPER_ADMIN', async () => {
      mockPrisma.membroNegocio.findFirst.mockResolvedValue({ id: 'm1', role: 'SUPER_ADMIN' });
      mockPrisma.negocio.findMany.mockResolvedValue([negocioBase]);

      await service.findAll('u1');

      expect(mockPrisma.negocio.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { criadoEm: 'desc' },
        include: { _count: { select: { membros: true, produtos: true, categorias: true, pedidos: true } } },
      });
    });

    it('deve filtrar por membros quando usuário não for SUPER_ADMIN', async () => {
      mockPrisma.membroNegocio.findFirst.mockResolvedValue(null);
      mockPrisma.negocio.findMany.mockResolvedValue([negocioBase]);

      await service.findAll('u1');

      expect(mockPrisma.negocio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { membros: { some: { usuarioId: 'u1', ativo: true } } } }),
      );
    });
  });

  describe('findOne', () => {
    it('deve lançar NotFoundException quando negócio não existir', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar negócio com configurações', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ ...negocioBase, configuracoes: [] });

      const result = await service.findOne('n1');

      expect(result.id).toBe('n1');
      expect(mockPrisma.negocio.findUnique).toHaveBeenCalledWith({
        where: { id: 'n1' },
        include: expect.objectContaining({ configuracoes: true }),
      });
    });
  });

  describe('findOneBySlug', () => {
    it('deve lançar NotFoundException quando negócio não existir pelo slug', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue(null);

      await expect(service.findOneBySlug('slug-inexistente')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar negócio ativo pelo slug', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ ...negocioBase, configuracoes: [] });

      const result = await service.findOneBySlug('lanchonete-do-joao');

      expect(result.slug).toBe('lanchonete-do-joao');
      expect(mockPrisma.negocio.findUnique).toHaveBeenCalledWith({
        where: { slug: 'lanchonete-do-joao', ativo: true },
        include: { configuracoes: true },
      });
    });
  });

  describe('update', () => {
    it('deve lançar ConflictException quando slug estiver em uso por outro negócio', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValueOnce(negocioBase); // findOne
      mockPrisma.negocio.findUnique.mockResolvedValueOnce({ id: 'n2', slug: 'outro-slug' }); // checagem slug

      await expect(service.update('n1', { slug: 'outro-slug' } as any)).rejects.toThrow(ConflictException);
    });

    it('deve atualizar negócio com sucesso e invalidar cache', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue(negocioBase);
      mockPrisma.negocio.update.mockResolvedValue({ ...negocioBase, nome: 'Novo Nome' });

      const result = await service.update('n1', { nome: 'Novo Nome' } as any);

      expect(mockRedis.del).toHaveBeenCalledWith('catalog:v2:n1:products');
      expect(mockPrisma.negocio.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { nome: 'Novo Nome' } });
      expect(result.nome).toBe('Novo Nome');
    });
  });

  describe('updateConfig', () => {
    it('deve atualizar estoqueMinimoPadrao e fazer upsert da configuração', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue(negocioBase);
      mockPrisma.estoqueItem.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.configuracaoNegocio.upsert.mockResolvedValue({ negocioId: 'n1', estoqueMinimoPadrao: 10 });

      const result = await service.updateConfig('n1', { estoqueMinimoPadrao: 10 } as any);

      expect(mockPrisma.estoqueItem.updateMany).toHaveBeenCalledWith({
        where: { negocioId: 'n1' },
        data: { estoqueMinimo: 10 },
      });
      expect(mockRedis.del).toHaveBeenCalledWith('catalog:v2:n1:products');
      expect(mockPrisma.configuracaoNegocio.upsert).toHaveBeenCalledWith({
        where: { negocioId: 'n1' },
        create: { negocioId: 'n1', estoqueMinimoPadrao: 10 },
        update: { estoqueMinimoPadrao: 10 },
      });
      expect(result.estoqueMinimoPadrao).toBe(10);
    });
  });

  describe('listarTaxasFreteBairro', () => {
    it('deve listar taxas ordenadas por bairro', async () => {
      const taxas = [{ id: 't1', negocioId: 'n1', bairro: 'Centro', taxa: 10 }];
      mockPrisma.taxaFreteBairro.findMany.mockResolvedValue(taxas);

      const result = await service.listarTaxasFreteBairro('n1');

      expect(mockPrisma.taxaFreteBairro.findMany).toHaveBeenCalledWith({
        where: { negocioId: 'n1' },
        orderBy: { bairro: 'asc' },
      });
      expect(result).toEqual(taxas);
    });
  });

  describe('criarTaxaFreteBairro', () => {
    it('deve criar taxa de frete para o bairro', async () => {
      const taxa = { id: 't1', negocioId: 'n1', bairro: 'Centro', taxa: 10 };
      mockPrisma.taxaFreteBairro.create.mockResolvedValue(taxa);

      const result = await service.criarTaxaFreteBairro('n1', { bairro: 'Centro', taxa: 10 });

      expect(mockPrisma.taxaFreteBairro.create).toHaveBeenCalledWith({
        data: { negocioId: 'n1', bairro: 'Centro', taxa: 10 },
      });
      expect(result).toEqual(taxa);
    });
  });
});
