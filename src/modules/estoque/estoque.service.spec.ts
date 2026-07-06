import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EstoqueService } from './estoque.service';
import { PrismaService } from '../../infra/database/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';

const mockPrisma = {
  estoqueItem: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  movimentacaoEstoque: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  produto: {
    updateMany: jest.fn(),
  },
  negocio: {
    findUnique: jest.fn(),
  },
  configuracaoNegocio: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAlertasQueue = {
  add: jest.fn(),
};

describe('EstoqueService', () => {
  let service: EstoqueService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstoqueService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('alertas-estoque'), useValue: mockAlertasQueue },
      ],
    }).compile();

    service = module.get<EstoqueService>(EstoqueService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('deve retornar itens paginados sem filtro', async () => {
      const items = [{ id: '1', negocioId: 'n1', produtoId: null, nome: 'Avulso', sku: null, quantidadeAtual: 10, estoqueMinimo: 5, unidade: 'un', criadoEm: new Date(), atualizadoEm: new Date(), produto: null }];
      mockPrisma.$transaction.mockResolvedValue([items, 1]);

      const result = await service.findAll('n1');

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('deve aplicar filtro de busca quando search for fornecido', async () => {
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        const results = await Promise.all(ops);
        return results;
      });
      mockPrisma.estoqueItem.findMany.mockResolvedValue([]);
      mockPrisma.estoqueItem.count.mockResolvedValue(0);

      await service.findAll('n1', { search: 'teste' });

      const findManyArgs = mockPrisma.estoqueItem.findMany.mock.calls[0][0];
      expect(findManyArgs.where.OR).toBeDefined();
      expect(findManyArgs.where.OR[0].nome.contains).toBe('teste');
    });
  });

  describe('criar', () => {
    it('deve rejeitar quando não houver produtoId nem nome', async () => {
      await expect(service.criar('n1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('deve rejeitar quando produtoId já existir', async () => {
      mockPrisma.estoqueItem.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.criar('n1', { produtoId: 'p1', nome: 'Teste', quantidadeAtual: 0 } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('deve criar item avulso com nome', async () => {
      const created = { id: '1', negocioId: 'n1', produtoId: null, nome: 'Avulso', sku: null, quantidadeAtual: 5, estoqueMinimo: 5, unidade: 'un', criadoEm: new Date(), atualizadoEm: new Date(), produto: null };
      mockPrisma.estoqueItem.findUnique.mockResolvedValue(null);
      mockPrisma.estoqueItem.create.mockResolvedValue(created);

      const result = await service.criar('n1', { nome: 'Avulso', quantidadeAtual: 5 } as any);

      expect(result.nome).toBe('Avulso');
      expect(result.ehAvulso).toBe(true);
    });
  });

  describe('findOne', () => {
    it('deve lançar NotFoundException quando item não existir', async () => {
      mockPrisma.estoqueItem.findFirst.mockResolvedValue(null);

      await expect(service.findOne('n1', 'inexistente')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar item mapeado', async () => {
      const item = { id: '1', negocioId: 'n1', produtoId: null, nome: 'Item', sku: null, quantidadeAtual: 10, estoqueMinimo: 5, unidade: 'un', criadoEm: new Date(), atualizadoEm: new Date(), produto: null };
      mockPrisma.estoqueItem.findFirst.mockResolvedValue(item);

      const result = await service.findOne('n1', '1');
      expect(result.id).toBe('1');
      expect(result.ehAvulso).toBe(true);
    });
  });

  describe('movimentar', () => {
    const baseItem = { id: '1', negocioId: 'n1', produtoId: 'p1', nome: 'Produto', sku: null, quantidadeAtual: 10, estoqueMinimo: 5, unidade: 'un', criadoEm: new Date(), atualizadoEm: new Date(), produto: { id: 'p1', nome: 'Produto', sku: null, status: 'ATIVO', preco: 10, controlaEstoque: true } };

    it('deve lançar erro quando estoque for insuficiente para saída', async () => {
      mockPrisma.estoqueItem.findFirst.mockResolvedValue(baseItem);

      await expect(service.movimentar('n1', '1', { tipo: 'SAIDA_VENDA', quantidade: 999 } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('deve criar movimentação de entrada e atualizar estoque', async () => {
      mockPrisma.estoqueItem.findFirst.mockResolvedValue(baseItem);
      const movimentacao = { id: 'mov1', quantidadeApos: 15 };
      mockPrisma.$transaction.mockResolvedValue([movimentacao]);
      mockPrisma.produto.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.movimentar('n1', '1', { tipo: 'ENTRADA', quantidade: 5 } as any);

      expect(result.quantidadeApos).toBe(15);
    });

    it('deve atualizar produto para ESGOTADO quando estoque chegar a 0', async () => {
      mockPrisma.estoqueItem.findFirst.mockResolvedValue({ ...baseItem, quantidadeAtual: 3 });
      const movimentacao = { id: 'mov2', quantidadeApos: 0 };
      mockPrisma.$transaction.mockResolvedValue([movimentacao]);
      mockPrisma.produto.updateMany.mockResolvedValue({ count: 1 });

      await service.movimentar('n1', '1', { tipo: 'SAIDA_VENDA', quantidade: 3 } as any);

      expect(mockPrisma.produto.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', status: { not: 'ESGOTADO' } },
        data: { status: 'ESGOTADO' },
      });
    });

    it('deve disparar alerta quando estoque ficar abaixo do mínimo', async () => {
      mockPrisma.estoqueItem.findFirst.mockResolvedValue({ ...baseItem, quantidadeAtual: 5 });
      const movimentacao = { id: 'mov3', quantidadeApos: 2 };
      mockPrisma.$transaction.mockResolvedValue([movimentacao]);
      mockPrisma.produto.updateMany.mockResolvedValue({ count: 0 });

      await service.movimentar('n1', '1', { tipo: 'SAIDA_VENDA', quantidade: 3 } as any);

      expect(mockAlertasQueue.add).toHaveBeenCalledWith('estoque-ruptura', expect.objectContaining({
        produtoId: 'p1',
        quantidadeAtual: 2,
      }));
    });
  });

  describe('transferir', () => {
    const itemOrigem = { id: 'origem1', negocioId: 'n1', produtoId: 'p1', nome: 'Origem', sku: null, quantidadeAtual: 20, estoqueMinimo: 5, unidade: 'un', criadoEm: new Date(), atualizadoEm: new Date(), produto: { id: 'p1', nome: 'Produto', sku: null, status: 'ATIVO', preco: 10, controlaEstoque: true } };
    const itemDestino = { id: 'destino1', negocioId: 'n2', produtoId: 'p1', nome: 'Destino', sku: null, quantidadeAtual: 5, estoqueMinimo: 5, unidade: 'un', criadoEm: new Date(), atualizadoEm: new Date(), produto: { id: 'p1', nome: 'Produto', sku: null, status: 'ATIVO', preco: 10, controlaEstoque: true } };

    const mockSuccess = () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n2', ativo: true });
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        const results = await Promise.all(ops);
        return results;
      });
      mockPrisma.estoqueItem.update.mockResolvedValue({});
      mockPrisma.movimentacaoEstoque.create.mockResolvedValue({});
      mockPrisma.produto.updateMany.mockResolvedValue({ count: 0 });
    };

    it('deve permitir transferência de item avulso', async () => {
      mockPrisma.estoqueItem.findFirst
        .mockResolvedValueOnce({ ...itemOrigem, produtoId: null, produto: null }) // findOne
        .mockResolvedValueOnce(itemDestino); // busca destino
      mockSuccess();

      const result = await service.transferir('n1', { itemOrigemId: 'origem1', negocioDestinoId: 'n2', produtoDestinoId: 'p1', quantidade: 5 } as any);

      expect(result.message).toBe('Transferência realizada com sucesso');
    });

    it('deve rejeitar quando estoque for insuficiente', async () => {
      mockPrisma.estoqueItem.findFirst.mockResolvedValue(itemOrigem);

      await expect(service.transferir('n1', { itemOrigemId: 'origem1', negocioDestinoId: 'n2', produtoDestinoId: 'p1', quantidade: 999 } as any))
        .rejects.toThrow('Estoque insuficiente para transferência');
    });

    it('deve realizar transferência com sucesso por produtoDestinoId', async () => {
      mockPrisma.estoqueItem.findFirst
        .mockResolvedValueOnce(itemOrigem) // findOne
        .mockResolvedValueOnce(itemDestino); // busca destino
      mockSuccess();

      const result = await service.transferir('n1', { itemOrigemId: 'origem1', negocioDestinoId: 'n2', produtoDestinoId: 'p1', quantidade: 5 } as any);

      expect(result.message).toBe('Transferência realizada com sucesso');
    });

    it('deve realizar transferência com sucesso por itemDestinoId', async () => {
      mockPrisma.estoqueItem.findFirst
        .mockResolvedValueOnce(itemOrigem) // findOne
        .mockResolvedValueOnce(itemDestino); // busca destino
      mockSuccess();

      const result = await service.transferir('n1', { itemOrigemId: 'origem1', negocioDestinoId: 'n2', itemDestinoId: 'destino1', quantidade: 5 } as any);

      expect(result.message).toBe('Transferência realizada com sucesso');
    });

    it('deve rejeitar quando não informar destino', async () => {
      mockPrisma.estoqueItem.findFirst.mockResolvedValue(itemOrigem);

      await expect(service.transferir('n1', { itemOrigemId: 'origem1', negocioDestinoId: 'n2', quantidade: 5 } as any))
        .rejects.toThrow('Informe itemDestinoId ou produtoDestinoId');
    });

    it('deve rejeitar auto-transferência', async () => {
      const mesmoItem = { ...itemOrigem, negocioId: 'n1' };
      mockPrisma.estoqueItem.findFirst
        .mockResolvedValueOnce(mesmoItem) // findOne
        .mockResolvedValueOnce(mesmoItem); // busca destino

      await expect(service.transferir('n1', { itemOrigemId: 'origem1', negocioDestinoId: 'n1', produtoDestinoId: 'p1', quantidade: 5 } as any))
        .rejects.toThrow('Origem e destino devem ser diferentes');
    });

    it('deve atualizar produto origem para ESGOTADO quando estoque zerar', async () => {
      mockPrisma.estoqueItem.findFirst
        .mockResolvedValueOnce({ ...itemOrigem, quantidadeAtual: 5 }) // findOne
        .mockResolvedValueOnce(itemDestino); // busca destino
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n2', ativo: true });
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        const results = await Promise.all(ops);
        return results;
      });
      mockPrisma.estoqueItem.update.mockResolvedValue({});
      mockPrisma.movimentacaoEstoque.create.mockResolvedValue({});
      mockPrisma.produto.updateMany.mockResolvedValue({ count: 1 });

      await service.transferir('n1', { itemOrigemId: 'origem1', negocioDestinoId: 'n2', produtoDestinoId: 'p1', quantidade: 5 } as any);

      expect(mockPrisma.produto.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', status: { not: 'ESGOTADO' } },
        data: { status: 'ESGOTADO' },
      });
    });

    it('deve disparar alerta quando estoque origem ficar abaixo do mínimo', async () => {
      mockPrisma.estoqueItem.findFirst
        .mockResolvedValueOnce({ ...itemOrigem, quantidadeAtual: 5 }) // findOne
        .mockResolvedValueOnce(itemDestino); // busca destino
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n2', ativo: true });
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        const results = await Promise.all(ops);
        return results;
      });
      mockPrisma.estoqueItem.update.mockResolvedValue({});
      mockPrisma.movimentacaoEstoque.create.mockResolvedValue({});
      mockPrisma.produto.updateMany.mockResolvedValue({ count: 1 });

      await service.transferir('n1', { itemOrigemId: 'origem1', negocioDestinoId: 'n2', produtoDestinoId: 'p1', quantidade: 5 } as any);

      expect(mockAlertasQueue.add).toHaveBeenCalledWith('estoque-ruptura', expect.objectContaining({
        produtoId: 'p1',
        quantidadeAtual: 0,
      }));
    });
  });

  describe('remover', () => {
    it('deve remover item existente', async () => {
      mockPrisma.estoqueItem.findFirst.mockResolvedValue({ id: '1' });
      mockPrisma.estoqueItem.delete.mockResolvedValue({});

      const result = await service.remover('n1', '1');
      expect(result.message).toBe('Item removido');
    });
  });

  describe('alertas', () => {
    it('deve retornar itens com quantidade <= 0', async () => {
      const items = [
        { id: '1', negocioId: 'n1', produtoId: null, nome: 'Zerado', sku: null, quantidadeAtual: 0, estoqueMinimo: 5, unidade: 'un', criadoEm: new Date(), atualizadoEm: new Date(), produto: null },
      ];
      mockPrisma.estoqueItem.findMany.mockResolvedValue(items);

      const result = await service.alertas('n1');
      expect(result).toHaveLength(1);
    });
  });
});
