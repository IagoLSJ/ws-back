import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { EstoqueService } from '../estoque/estoque.service';
import { ImprimirService } from '../imprimir/imprimir.service';
import { CaixaService } from '../caixa/caixa.service';

const mockPrisma = {
  negocio: {
    findUnique: jest.fn(),
  },
  configuracaoNegocio: {
    findUnique: jest.fn(),
  },
  carrinho: {
    findUnique: jest.fn(),
  },
  produto: {
    findMany: jest.fn(),
  },
  estoqueItem: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  mesa: {
    findFirst: jest.fn(),
  },
  taxaFreteBairro: {
    findFirst: jest.fn(),
  },
  pedido: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  movimentacaoEstoque: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  pagamento: {
    update: jest.fn(),
  },
  carrinhoItem: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

const mockEstoqueService = {
  movimentar: jest.fn(),
};

const mockImprimirService = {
  imprimirComanda: jest.fn().mockResolvedValue(undefined),
};

const mockCaixaService = {
  exigirCaixaAberto: jest.fn(),
  registrarPagamento: jest.fn(),
};

describe('PedidosService', () => {
  let service: PedidosService;
  let prisma: typeof mockPrisma;
  let tx: any;

  const negocioId = 'n1';
  const slug = 'loja';
  const sessionId = 'sessao1';

  const carrinhoBase = {
    id: 'carrinho1',
    negocioId,
    sessionId,
    itens: [
      {
        id: 'ci1',
        produtoId: 'p1',
        quantidade: 2,
        opcoesSelecionadas: [],
        produto: {
          id: 'p1',
          nome: 'Coxinha',
          preco: 10,
          tipoDesconto: null,
          valorDesconto: null,
          controlaEstoque: false,
          vendaPorPeso: false,
        },
      },
    ],
  };

  const pedidoBase = {
    id: 'pedido1',
    negocioId,
    status: 'PENDENTE',
    total: 20,
    itens: [{ produtoId: 'p1', quantidade: 2 }],
    pagamentos: [],
  };

  const dtoBase = (overrides: any = {}) => ({
    tipoEntrega: 'RETIRADA',
    metodoPagamento: 'PIX',
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PedidosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EstoqueService, useValue: mockEstoqueService },
        { provide: ImprimirService, useValue: mockImprimirService },
        { provide: CaixaService, useValue: mockCaixaService },
      ],
    }).compile();

    service = module.get<PedidosService>(PedidosService);
    prisma = module.get(PrismaService);

    tx = {
      pedido: { create: jest.fn(), update: jest.fn() },
      estoqueItem: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      movimentacaoEstoque: { findFirst: jest.fn(), create: jest.fn() },
      carrinhoItem: { deleteMany: jest.fn() },
      pagamento: { update: jest.fn() },
    };

    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(async (arg: any) => {
      if (typeof arg === 'function') return arg(tx);
      return Promise.all(arg);
    });
    prisma.negocio.findUnique.mockResolvedValue({ id: negocioId });
    prisma.configuracaoNegocio.findUnique.mockResolvedValue({ taxaFrete: 0, horarioFuncionamento: null });
    prisma.produto.findMany.mockResolvedValue([]);
    prisma.taxaFreteBairro.findFirst.mockResolvedValue(null);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue(undefined);
    mockRedis.del.mockResolvedValue(undefined);
    mockImprimirService.imprimirComanda.mockResolvedValue(undefined);
    mockCaixaService.exigirCaixaAberto.mockResolvedValue(undefined);
    mockCaixaService.registrarPagamento.mockResolvedValue(undefined);
    tx.pedido.create.mockResolvedValue(pedidoBase);
    tx.carrinhoItem.deleteMany.mockResolvedValue({ count: 1 });
  });

  describe('checkout - validações', () => {
    it('deve criar pedido válido e salvar idempotency key', async () => {
      prisma.carrinho.findUnique.mockResolvedValue(carrinhoBase);

      const result = await service.checkout(slug, sessionId, dtoBase({ idempotencyKey: 'chave-1' }));

      expect(result.id).toBe('pedido1');
      expect(tx.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            negocioId,
            total: 20,
            status: 'PENDENTE',
            pagamentos: expect.objectContaining({
              create: expect.objectContaining({ valor: 20, metodo: 'PIX', status: 'PENDENTE' }),
            }),
          }),
        }),
      );
      expect(tx.carrinhoItem.deleteMany).toHaveBeenCalledWith({ where: { carrinhoId: 'carrinho1' } });
      expect(mockRedis.setex).toHaveBeenCalledWith('checkout:chave-1', 86400, 'pedido1');
    });

    it('deve lançar NotFoundException para negócio inativo ou inexistente', async () => {
      prisma.negocio.findUnique.mockResolvedValue(null);

      await expect(service.checkout(slug, sessionId, dtoBase())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequest quando o negócio estiver fechado e não houver agendamento', async () => {
      const hoje = new Date().getDay();
      const dias = new Array(7).fill(null);
      dias[hoje] = { abertura: '00:00', fechamento: '23:59', fechado: true };
      prisma.configuracaoNegocio.findUnique.mockResolvedValue({ horarioFuncionamento: { dias } });

      await expect(service.checkout(slug, sessionId, dtoBase())).rejects.toThrow(
        'O estabelecimento está fechado agora',
      );
    });

    it('deve lançar BadRequest quando o carrinho estiver vazio', async () => {
      prisma.carrinho.findUnique.mockResolvedValue({ id: 'carrinho1', negocioId, sessionId, itens: [] });

      await expect(service.checkout(slug, sessionId, dtoBase())).rejects.toThrow('Carrinho vazio');
    });

    it('deve lançar BadRequest quando o estoque for insuficiente no pré-check', async () => {
      const carrinho = {
        ...carrinhoBase,
        itens: [
          {
            ...carrinhoBase.itens[0],
            produto: { ...carrinhoBase.itens[0].produto, controlaEstoque: true },
          },
        ],
      };
      prisma.carrinho.findUnique.mockResolvedValue(carrinho);
      prisma.estoqueItem.findFirst.mockResolvedValue({ id: 'ei1', quantidadeAtual: 1, unidade: 'un' });

      await expect(service.checkout(slug, sessionId, dtoBase())).rejects.toThrow('Estoque insuficiente');
    });
  });

  describe('baixarEstoque', () => {
    it('deve baixar estoque convertendo peso (kg → g) em venda por peso com pagamento em dinheiro', async () => {
      const produtoPeso = {
        id: 'p1',
        nome: 'Queijo',
        preco: 20,
        tipoDesconto: null,
        valorDesconto: null,
        controlaEstoque: true,
        vendaPorPeso: true,
      };
      const carrinho = {
        ...carrinhoBase,
        itens: [{ id: 'ci1', produtoId: 'p1', quantidade: 1.5, opcoesSelecionadas: [], produto: produtoPeso }],
      };
      prisma.carrinho.findUnique.mockResolvedValue(carrinho);
      prisma.estoqueItem.findFirst.mockResolvedValue({ id: 'ei1', quantidadeAtual: 5000, unidade: 'g' });
      tx.pedido.create.mockResolvedValue({
        ...pedidoBase,
        total: 30,
        itens: [{ produtoId: 'p1', quantidade: 1.5 }],
      });
      tx.estoqueItem.findFirst.mockResolvedValue({
        id: 'ei1',
        unidade: 'g',
        quantidadeAtual: 5000,
        produto: { controlaEstoque: true, vendaPorPeso: true },
      });
      tx.estoqueItem.update.mockResolvedValue({});
      tx.movimentacaoEstoque.create.mockResolvedValue({});
      tx.pedido.update.mockResolvedValue({});

      await service.checkout(slug, sessionId, dtoBase({ metodoPagamento: 'DINHEIRO', trocoPara: 50 }));

      expect(tx.estoqueItem.update).toHaveBeenCalledWith({
        where: { id: 'ei1' },
        data: { quantidadeAtual: { decrement: 1500 } },
      });
      expect(tx.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tipo: 'SAIDA_VENDA', quantidade: 1500 }),
        }),
      );
      expect(tx.pedido.update).toHaveBeenCalledWith({
        where: { id: 'pedido1' },
        data: { status: 'CONFIRMADO' },
      });
      expect(mockImprimirService.imprimirComanda).toHaveBeenCalledWith(negocioId, 'pedido1');
      expect(mockCaixaService.registrarPagamento).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith(`catalog:v2:${negocioId}:products`);
    });

    it('deve continuar (sem lançar) quando não houver estoqueItem', async () => {
      const carrinho = {
        ...carrinhoBase,
        itens: [
          {
            ...carrinhoBase.itens[0],
            produto: { ...carrinhoBase.itens[0].produto, controlaEstoque: true },
          },
        ],
      };
      prisma.carrinho.findUnique.mockResolvedValue(carrinho);
      prisma.estoqueItem.findFirst.mockResolvedValue({ id: 'ei1', quantidadeAtual: 100, unidade: 'un' });
      tx.estoqueItem.findFirst.mockResolvedValue(null);
      tx.pedido.update.mockResolvedValue({});

      const result = await service.checkout(slug, sessionId, dtoBase({ metodoPagamento: 'DINHEIRO' }));

      expect(result.id).toBe('pedido1');
      expect(tx.estoqueItem.update).not.toHaveBeenCalled();
      expect(tx.movimentacaoEstoque.create).not.toHaveBeenCalled();
    });

    it('deve continuar (não baixar novamente) quando o estoque já foi baixado (idempotência)', async () => {
      const carrinho = {
        ...carrinhoBase,
        itens: [
          {
            ...carrinhoBase.itens[0],
            produto: { ...carrinhoBase.itens[0].produto, controlaEstoque: true },
          },
        ],
      };
      prisma.carrinho.findUnique.mockResolvedValue(carrinho);
      prisma.estoqueItem.findFirst.mockResolvedValue({ id: 'ei1', quantidadeAtual: 100, unidade: 'un' });
      tx.estoqueItem.findFirst.mockResolvedValue({
        id: 'ei1',
        unidade: 'un',
        quantidadeAtual: 100,
        produto: { controlaEstoque: true, vendaPorPeso: false },
      });
      tx.movimentacaoEstoque.findFirst.mockResolvedValue({ id: 'mov1' });
      tx.pedido.update.mockResolvedValue({});

      await service.checkout(slug, sessionId, dtoBase({ metodoPagamento: 'DINHEIRO' }));

      expect(tx.estoqueItem.update).not.toHaveBeenCalled();
      expect(tx.movimentacaoEstoque.create).not.toHaveBeenCalled();
    });
  });

  describe('estornarEstoque', () => {
    it('deve incrementar o estoque ao cancelar pedido já confirmado', async () => {
      prisma.pedido.findUnique.mockResolvedValue({
        id: 'pedido1',
        negocioId,
        status: 'CONFIRMADO',
        itens: [{ produtoId: 'p1', quantidade: 5 }],
        pagamentos: [],
      });
      tx.movimentacaoEstoque.findFirst.mockResolvedValue({
        estoqueItemId: 'ei1',
        estoqueItem: {
          id: 'ei1',
          quantidadeAtual: 10,
          unidade: 'un',
          produto: { vendaPorPeso: false },
        },
      });
      tx.estoqueItem.update.mockResolvedValue({});
      tx.movimentacaoEstoque.create.mockResolvedValue({});
      tx.pedido.update.mockResolvedValue({
        id: 'pedido1',
        status: 'CANCELADO',
        itens: [],
        pagamentos: [],
      });

      const result = await service.atualizarStatus('pedido1', 'CANCELADO' as any);

      expect(result.id).toBe('pedido1');
      expect(tx.estoqueItem.update).toHaveBeenCalledWith({
        where: { id: 'ei1' },
        data: { quantidadeAtual: { increment: 5 } },
      });
      expect(tx.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tipo: 'ENTRADA', quantidade: 5 }),
        }),
      );
      expect(tx.pedido.update).toHaveBeenCalledWith({
        where: { id: 'pedido1' },
        data: { status: 'CANCELADO' },
        include: { itens: true, pagamentos: true },
      });
      expect(mockRedis.del).toHaveBeenCalledWith(`catalog:v2:${negocioId}:products`);
    });
  });

  describe('idempotência', () => {
    it('deve retornar pedido existente quando a idempotency key já foi processada', async () => {
      mockRedis.get.mockResolvedValue('pedido1');
      prisma.pedido.findUnique.mockResolvedValue({
        id: 'pedido1',
        negocioId,
        status: 'CONFIRMADO',
        itens: [],
        pagamentos: [],
      });

      const result = await service.checkout(slug, sessionId, dtoBase({ idempotencyKey: 'chave-1' }));

      expect(result.id).toBe('pedido1');
      expect(tx.pedido.create).not.toHaveBeenCalled();
    });
  });
});
