import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProdutosService } from './produtos.service';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { StorageService } from '../../infra/storage/storage.service';
import { TipoAjusteMassa, OperacaoAjusteMassa, CampoAjusteMassa } from './dto/ajuste-massa-produto.dto';

const mockPrisma = {
  produto: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    updateMany: jest.fn(),
  },
  configuracaoNegocio: {
    findUnique: jest.fn(),
  },
  estoqueItem: {
    create: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
  },
  pedidoItem: {
    count: jest.fn(),
  },
  imagemProduto: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
  },
  opcaoModificador: {
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
  carrinhoItemOpcao: {
    deleteMany: jest.fn(),
  },
  grupoModificador: {
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
  carrinhoItem: {
    deleteMany: jest.fn(),
  },
  negocio: {
    findUnique: jest.fn(),
  },
  combo: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  del: jest.fn(),
  setex: jest.fn(),
};

const mockStorage = {
  normalizeUrl: jest.fn(),
  extractKey: jest.fn(),
  deleteObject: jest.fn(),
  requestUploadUrl: jest.fn(),
  confirmUpload: jest.fn(),
};

describe('ProdutosService', () => {
  let service: ProdutosService;
  let prisma: typeof mockPrisma;

  const baseProduto = {
    id: 'p1',
    negocioId: 'n1',
    nome: 'X-Burger',
    preco: 10,
    precoCusto: 8,
    status: 'ATIVO',
    controlaEstoque: true,
    vendaPorPeso: false,
    imagens: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProdutosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<ProdutosService>(ProdutosService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('deve criar produto com controlaEstoque e criar estoqueItem com quantidade, mínimo e unidade', async () => {
      mockPrisma.produto.create.mockResolvedValue({ ...baseProduto, id: 'p1', controlaEstoque: true });
      mockPrisma.configuracaoNegocio.findUnique.mockResolvedValue(null);
      mockPrisma.estoqueItem.create.mockResolvedValue({ id: 'e1' });

      const result = await service.create('n1', {
        nome: 'Pão de queijo',
        preco: 10,
        vendaPorPeso: true,
        unidadeMedida: 'KG',
        quantidadeAtual: 3,
        estoqueMinimo: 2,
        unidade: 'KG',
      } as any);

      expect(result.id).toBe('p1');
      expect(mockPrisma.estoqueItem.create).toHaveBeenCalledWith({
        data: {
          negocioId: 'n1',
          produtoId: 'p1',
          quantidadeAtual: 3,
          estoqueMinimo: 2,
          precoCusto: undefined,
          unidade: 'KG',
        },
      });
      expect(mockRedis.del).toHaveBeenCalledWith('catalog:v2:n1:products');
    });

    it('deve usar unidadeMedida quando unidade não for informada', async () => {
      mockPrisma.produto.create.mockResolvedValue({ ...baseProduto, id: 'p1', controlaEstoque: true });
      mockPrisma.configuracaoNegocio.findUnique.mockResolvedValue(null);
      mockPrisma.estoqueItem.create.mockResolvedValue({ id: 'e1' });

      await service.create('n1', {
        nome: 'Queijo',
        preco: 5,
        unidadeMedida: 'KG',
      } as any);

      expect(mockPrisma.estoqueItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unidade: 'KG' }),
        }),
      );
    });

    it('deve aplicar estoqueMinimoPadrao da configuração quando estoqueMinimo ausente', async () => {
      mockPrisma.produto.create.mockResolvedValue({ ...baseProduto, id: 'p1', controlaEstoque: true });
      mockPrisma.configuracaoNegocio.findUnique.mockResolvedValue({ estoqueMinimoPadrao: 7 });
      mockPrisma.estoqueItem.create.mockResolvedValue({ id: 'e1' });

      await service.create('n1', { nome: 'Salgado', preco: 5 } as any);

      expect(mockPrisma.estoqueItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estoqueMinimo: 7 }),
        }),
      );
    });

    it('não deve criar estoqueItem quando controlaEstoque for false', async () => {
      mockPrisma.produto.create.mockResolvedValue({ ...baseProduto, id: 'p1', controlaEstoque: false });

      await service.create('n1', { nome: 'X-Burger', preco: 10, controlaEstoque: false } as any);

      expect(mockPrisma.estoqueItem.create).not.toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith('catalog:v2:n1:products');
    });

    it('deve rejeitar PLU duplicado no mesmo negócio', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue({ id: 'outro' });

      await expect(service.create('n1', { nome: 'Produto', preco: 10, plu: 12345 } as any))
        .rejects.toThrow('O PLU 12345 já está em uso por outro produto');

      expect(mockPrisma.produto.create).not.toHaveBeenCalled();
    });

    it('deve permitir criar produto com PLU disponível', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue(null);
      mockPrisma.produto.create.mockResolvedValue({ ...baseProduto, id: 'p1', plu: 12345 });

      const result = await service.create('n1', { nome: 'Produto', preco: 10, plu: 12345, controlaEstoque: false } as any);

      expect(result.id).toBe('p1');
      expect(mockPrisma.produto.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('deve retornar produtos e normalizar imagens', async () => {
      const produtos = [{ id: 'p1', nome: 'X', imagens: [{ url: 'u1' }] }];
      mockPrisma.produto.findMany.mockResolvedValue(produtos);
      mockStorage.normalizeUrl.mockReturnValue('url-normalizada');

      const result = await service.findAll('n1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.produto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { negocioId: 'n1' } }),
      );
      expect(result[0].imagens[0].url).toBe('url-normalizada');
      expect(mockStorage.normalizeUrl).toHaveBeenCalledWith('u1');
    });
  });

  describe('findAllPDV', () => {
    it('usa o cache quando existir', async () => {
      const cached = [{ id: 'p1', nome: 'X' }];
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.findAllPDV();

      expect(result).toEqual(cached);
      expect(mockPrisma.produto.findMany).not.toHaveBeenCalled();
    });

    it('busca no banco e grava no cache quando não existir', async () => {
      mockRedis.get.mockResolvedValue(null);
      const produtos = [{ id: 'p1', nome: 'X', imagens: [{ url: 'u1' }] }];
      mockPrisma.produto.findMany.mockResolvedValue(produtos);
      mockStorage.normalizeUrl.mockReturnValue('url-normalizada');

      const result = await service.findAllPDV();

      expect(result).toHaveLength(1);
      expect(mockPrisma.produto.findMany).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalledWith('pdv:produtos:v1', 60, JSON.stringify([{ id: 'p1', nome: 'X', imagens: [{ url: 'url-normalizada' }] }]));
    });
  });

  describe('findOne', () => {
    it('deve lançar NotFoundException quando produto não existir', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue(null);

      await expect(service.findOne('n1', 'inexistente')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar produto encontrado', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue({ ...baseProduto, imagens: undefined });

      const result = await service.findOne('n1', 'p1');

      expect(result.id).toBe('p1');
      expect(mockPrisma.produto.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1', negocioId: 'n1' } }),
      );
    });
  });

  describe('update', () => {
    const tx = {
      opcaoModificador: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() },
      grupoModificador: { deleteMany: jest.fn(), create: jest.fn() },
      carrinhoItemOpcao: { deleteMany: jest.fn() },
      produto: { update: jest.fn() },
    };

    const mockTransaction = () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
    };

    it('deve repassar vendaPorPeso na atualização', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue({ ...baseProduto });
      tx.produto.update.mockResolvedValue({ ...baseProduto, vendaPorPeso: true });
      mockTransaction();

      const result = await service.update('n1', 'p1', { vendaPorPeso: true } as any);

      expect(tx.produto.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ vendaPorPeso: true }),
        }),
      );
      expect(result.vendaPorPeso).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('catalog:v2:n1:products');
    });

    it('deve criar estoqueItem ao ativar controlaEstoque', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue({ ...baseProduto, controlaEstoque: false });
      tx.produto.update.mockResolvedValue({ ...baseProduto, controlaEstoque: true });
      mockPrisma.estoqueItem.findFirst.mockResolvedValue(null);
      mockPrisma.configuracaoNegocio.findUnique.mockResolvedValue({ estoqueMinimoPadrao: 3 });
      mockPrisma.estoqueItem.create.mockResolvedValue({ id: 'e1' });
      mockTransaction();

      await service.update('n1', 'p1', { controlaEstoque: true } as any);

      expect(mockPrisma.estoqueItem.create).toHaveBeenCalledWith({
        data: {
          negocioId: 'n1',
          produtoId: 'p1',
          quantidadeAtual: 0,
          estoqueMinimo: 3,
          precoCusto: 8,
          unidade: 'un',
        },
      });
    });

    it('deve atualizar precoCusto do estoque quando precoCusto for enviado', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue({ ...baseProduto });
      tx.produto.update.mockResolvedValue({ ...baseProduto });
      mockTransaction();

      await service.update('n1', 'p1', { precoCusto: 12.5 } as any);

      expect(mockPrisma.estoqueItem.updateMany).toHaveBeenCalledWith({
        where: { produtoId: 'p1' },
        data: { precoCusto: 12.5 },
      });
    });

    it('deve invalidar cache após atualização', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue({ ...baseProduto });
      tx.produto.update.mockResolvedValue({ ...baseProduto });
      mockTransaction();

      await service.update('n1', 'p1', { nome: 'Novo nome' } as any);

      expect(mockRedis.del).toHaveBeenCalledWith('catalog:v2:n1:products');
    });

    it('deve rejeitar PLU duplicado na atualização (outro produto)', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue({ id: 'outro' });

      await expect(service.update('n1', 'p1', { plu: 999 } as any))
        .rejects.toThrow('O PLU 999 já está em uso por outro produto');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('ajustarPrecosEmMassa', () => {
    const produto = { id: 'p1', nome: 'X-Burger', preco: 100, precoCusto: 50 };

    it('deve aplicar ajuste percentual de soma no preço', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([produto]);
      mockPrisma.produto.update.mockResolvedValue({});

      const result = await service.ajustarPrecosEmMassa('n1', {
        tipo: TipoAjusteMassa.PERCENTUAL,
        operacao: OperacaoAjusteMassa.SOMAR,
        valor: 10,
        aplicarEm: CampoAjusteMassa.PRECO,
      } as any);

      expect(mockPrisma.produto.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { preco: 110 },
      });
      expect(result.resumo[0].precoNovo).toBe(110);
      expect(mockPrisma.estoqueItem.updateMany).not.toHaveBeenCalled();
    });

    it('deve aplicar ajuste percentual de subtração no preço', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([produto]);
      mockPrisma.produto.update.mockResolvedValue({});

      const result = await service.ajustarPrecosEmMassa('n1', {
        tipo: TipoAjusteMassa.PERCENTUAL,
        operacao: OperacaoAjusteMassa.SUBTRAIR,
        valor: 10,
        aplicarEm: CampoAjusteMassa.PRECO,
      } as any);

      expect(mockPrisma.produto.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { preco: 90 },
      });
      expect(result.resumo[0].precoNovo).toBe(90);
    });

    it('deve aplicar ajuste fixo de soma no preço', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([produto]);
      mockPrisma.produto.update.mockResolvedValue({});

      const result = await service.ajustarPrecosEmMassa('n1', {
        tipo: TipoAjusteMassa.FIXO,
        operacao: OperacaoAjusteMassa.SOMAR,
        valor: 5,
        aplicarEm: CampoAjusteMassa.PRECO,
      } as any);

      expect(mockPrisma.produto.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { preco: 105 },
      });
      expect(result.resumo[0].precoNovo).toBe(105);
    });

    it('deve aplicar ajuste fixo de subtração no preço', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([produto]);
      mockPrisma.produto.update.mockResolvedValue({});

      const result = await service.ajustarPrecosEmMassa('n1', {
        tipo: TipoAjusteMassa.FIXO,
        operacao: OperacaoAjusteMassa.SUBTRAIR,
        valor: 5,
        aplicarEm: CampoAjusteMassa.PRECO,
      } as any);

      expect(result.resumo[0].precoNovo).toBe(95);
    });

    it('deve aplicar ajuste em CUSTO atualizando também o estoqueItem', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([produto]);
      mockPrisma.produto.update.mockResolvedValue({});
      mockPrisma.estoqueItem.updateMany.mockResolvedValue({});

      await service.ajustarPrecosEmMassa('n1', {
        tipo: TipoAjusteMassa.PERCENTUAL,
        operacao: OperacaoAjusteMassa.SOMAR,
        valor: 10,
        aplicarEm: CampoAjusteMassa.CUSTO,
      } as any);

      expect(mockPrisma.produto.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { precoCusto: 55 },
      });
      expect(mockPrisma.estoqueItem.updateMany).toHaveBeenCalledWith({
        where: { produtoId: 'p1' },
        data: { precoCusto: 55 },
      });
    });

    it('deve aplicar ajuste em AMBOS (preço e custo)', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([produto]);
      mockPrisma.produto.update.mockResolvedValue({});
      mockPrisma.estoqueItem.updateMany.mockResolvedValue({});

      const result = await service.ajustarPrecosEmMassa('n1', {
        tipo: TipoAjusteMassa.PERCENTUAL,
        operacao: OperacaoAjusteMassa.SOMAR,
        valor: 10,
        aplicarEm: CampoAjusteMassa.AMBOS,
      } as any);

      expect(mockPrisma.produto.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { preco: 110, precoCusto: 55 },
      });
      expect(result.resumo[0].precoNovo).toBe(110);
      expect(result.resumo[0].custoNovo).toBe(55);
    });

    it('deve filtrar por busca (nome) com mode insensitive', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([produto]);
      mockPrisma.produto.update.mockResolvedValue({});

      await service.ajustarPrecosEmMassa('n1', {
        busca: 'coca',
        tipo: TipoAjusteMassa.FIXO,
        operacao: OperacaoAjusteMassa.SOMAR,
        valor: 1,
        aplicarEm: CampoAjusteMassa.PRECO,
      } as any);

      const where = mockPrisma.produto.findMany.mock.calls[0][0].where;
      expect(where.negocioId).toBe('n1');
      expect(where.OR).toContainEqual({ nome: { contains: 'coca', mode: 'insensitive' } });
      expect(where.OR).toContainEqual({ sku: { contains: 'coca', mode: 'insensitive' } });
    });

    it('deve filtrar por categoriaId', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([produto]);
      mockPrisma.produto.update.mockResolvedValue({});

      await service.ajustarPrecosEmMassa('n1', {
        categoriaId: 'cat1',
        tipo: TipoAjusteMassa.FIXO,
        operacao: OperacaoAjusteMassa.SOMAR,
        valor: 1,
        aplicarEm: CampoAjusteMassa.PRECO,
      } as any);

      const where = mockPrisma.produto.findMany.mock.calls[0][0].where;
      expect(where.categoriaId).toBe('cat1');
    });

    it('deve filtrar por ids específicos', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([produto]);
      mockPrisma.produto.update.mockResolvedValue({});

      await service.ajustarPrecosEmMassa('n1', {
        ids: ['p1', 'p2'],
        tipo: TipoAjusteMassa.FIXO,
        operacao: OperacaoAjusteMassa.SOMAR,
        valor: 1,
        aplicarEm: CampoAjusteMassa.PRECO,
      } as any);

      const where = mockPrisma.produto.findMany.mock.calls[0][0].where;
      expect(where.id).toEqual({ in: ['p1', 'p2'] });
    });

    it('deve lançar erro quando nenhum produto for encontrado', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([]);

      await expect(
        service.ajustarPrecosEmMassa('n1', {
          tipo: TipoAjusteMassa.FIXO,
          operacao: OperacaoAjusteMassa.SOMAR,
          valor: 1,
          aplicarEm: CampoAjusteMassa.PRECO,
        } as any),
      ).rejects.toThrow('Nenhum produto encontrado para o ajuste');
    });

    it('não deve permitir preço negativo (mínimo 0)', async () => {
      mockPrisma.produto.findMany.mockResolvedValue([{ ...produto, preco: 10, precoCusto: 5 }]);
      mockPrisma.produto.update.mockResolvedValue({});

      const result = await service.ajustarPrecosEmMassa('n1', {
        tipo: TipoAjusteMassa.FIXO,
        operacao: OperacaoAjusteMassa.SUBTRAIR,
        valor: 100,
        aplicarEm: CampoAjusteMassa.AMBOS,
      } as any);

      expect(result.resumo[0].precoNovo).toBe(0);
      expect(result.resumo[0].custoNovo).toBe(0);
    });
  });

  describe('remove', () => {
    it('deve lançar erro quando produto possui pedidos vinculados', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue({ ...baseProduto });
      mockPrisma.pedidoItem.count.mockResolvedValue(2);

      await expect(service.remove('n1', 'p1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.pedidoItem.count).toHaveBeenCalledWith({ where: { produtoId: 'p1' } });
    });

    it('deve remover produto sem pedidos vinculados e deletar carrinhos', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue({ ...baseProduto });
      mockPrisma.pedidoItem.count.mockResolvedValue(0);
      mockPrisma.imagemProduto.findMany.mockResolvedValue([]);
      const tx = {
        carrinhoItem: { deleteMany: jest.fn().mockResolvedValue({}) },
        produto: { delete: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.remove('n1', 'p1');

      expect(tx.carrinhoItem.deleteMany).toHaveBeenCalledWith({ where: { produtoId: 'p1' } });
      expect(tx.produto.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(mockRedis.del).toHaveBeenCalledWith('catalog:v2:n1:products');
    });
  });

  describe('confirmUpload', () => {
    it('cria a imagem como principal e invalida o cache da vitrine', async () => {
      mockPrisma.produto.findFirst.mockResolvedValue({ ...baseProduto });
      mockPrisma.imagemProduto.findFirst.mockResolvedValue(null);
      mockPrisma.imagemProduto.create.mockResolvedValue({ id: 'img1', url: 'https://x/foto.jpg', principal: true });
      (mockStorage as any).getPublicUrl = jest.fn().mockReturnValue('https://x/foto.jpg');

      const imagem = await service.confirmUpload('n1', 'p1', 'produtos/n1/p1/foto.jpg');

      expect(imagem.principal).toBe(true);
      expect(mockPrisma.imagemProduto.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ principal: true }) }),
      );
      expect(mockRedis.del).toHaveBeenCalledWith('catalog:v2:n1:products');
    });
  });
});
