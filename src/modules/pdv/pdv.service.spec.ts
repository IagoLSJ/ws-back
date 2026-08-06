import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PdvService } from './pdv.service';
import { PrismaService } from '../../infra/database/prisma.service';
import { EstoqueService } from '../estoque/estoque.service';
import { ImprimirService } from '../imprimir/imprimir.service';
import { CaixaService } from '../caixa/caixa.service';
import { ContasReceberService } from '../contas-receber/contas-receber.service';
import { FiscalService } from '../fiscal/fiscal.service';
import { RedisService } from '../../infra/cache/redis.service';

const mockPrisma = {
  produto: {
    findMany: jest.fn(),
  },
  negocio: {
    findUnique: jest.fn(),
  },
  opcaoModificador: {
    findMany: jest.fn(),
  },
  configuracaoNegocio: {
    findUnique: jest.fn(),
  },
  cliente: {
    findUnique: jest.fn(),
  },
  caixa: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
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

const mockContasReceberService = {
  criar: jest.fn(),
};

const mockFiscalService = {
  emitirNFe: jest.fn().mockResolvedValue(undefined),
};

const mockRedis = {
  del: jest.fn().mockResolvedValue(undefined),
};

describe('PdvService', () => {
  let service: PdvService;
  let prisma: typeof mockPrisma;
  let caixaService: typeof mockCaixaService;
  let tx: any;

  const negocioId = 'n1';
  const usuarioId = 'u1';
  const caixa = { id: 'c1' };

  const produtoBase = {
    id: 'p1',
    nome: 'Coxinha',
    preco: 10,
    tipoDesconto: null,
    valorDesconto: null,
    controlaEstoque: false,
    vendaPorPeso: false,
    negocioId,
    negocio: { id: negocioId, cidade: null },
  };

  const pedidoMock = {
    id: 'pedido1',
    negocioId,
    total: 20,
    itens: [{ produtoId: 'p1', produtoNome: 'Coxinha', precoUnitario: 10, quantidade: 2 }],
    pagamentos: [],
  };

  const dtoBase = (overrides: any = {}) => ({
    itens: [{ produtoId: 'p1', quantidade: 1 }],
    pagamento: { metodo: 'PIX', valorPago: 10 },
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdvService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EstoqueService, useValue: mockEstoqueService },
        { provide: ImprimirService, useValue: mockImprimirService },
        { provide: CaixaService, useValue: mockCaixaService },
        { provide: ContasReceberService, useValue: mockContasReceberService },
        { provide: FiscalService, useValue: mockFiscalService },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<PdvService>(PdvService);
    prisma = module.get(PrismaService);
    caixaService = module.get(CaixaService);

    tx = {
      pedido: { create: jest.fn() },
      estoqueItem: { findFirst: jest.fn(), update: jest.fn() },
      movimentacaoEstoque: { create: jest.fn() },
      caixaMovimento: { create: jest.fn() },
      contaReceber: { create: jest.fn() },
      cliente: { update: jest.fn() },
    };

    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(async (arg: any) => {
      if (typeof arg === 'function') return arg(tx);
      return Promise.all(arg);
    });
    prisma.caixa.findFirst.mockResolvedValue(caixa);
    prisma.configuracaoNegocio.findUnique.mockResolvedValue(null);
    prisma.cliente.findUnique.mockResolvedValue(null);
    prisma.negocio.findUnique.mockResolvedValue({ id: negocioId, cidade: null });
    caixaService.exigirCaixaAberto.mockResolvedValue(undefined);
  });

  describe('checkout - validações', () => {
    it('deve lançar BadRequest quando não houver caixa aberto', async () => {
      caixaService.exigirCaixaAberto.mockRejectedValue(new BadRequestException('Nenhum caixa aberto'));

      await expect(service.checkout(negocioId, dtoBase(), usuarioId)).rejects.toThrow(
        'Nenhum caixa aberto',
      );
    });

    it('deve lançar BadRequest quando dto.itens estiver vazio', async () => {
      await expect(service.checkout(negocioId, dtoBase({ itens: [] }))).rejects.toThrow(
        'Nenhum item na venda',
      );
    });

    it('deve lançar BadRequest quando algum produto não for encontrado ou inativo', async () => {
      prisma.produto.findMany.mockResolvedValue([produtoBase]);

      await expect(
        service.checkout(
          negocioId,
          dtoBase({
            itens: [{ produtoId: 'p1' }, { produtoId: 'pInexistente' }],
            pagamento: { metodo: 'PIX' },
          }),
        ),
      ).rejects.toThrow('Alguns produtos não encontrados ou inativos');
    });

    it('deve lançar BadRequest quando não houver caixa aberto na transação', async () => {
      prisma.produto.findMany.mockResolvedValue([produtoBase]);
      prisma.caixa.findFirst.mockResolvedValue(null);

      await expect(service.checkout(negocioId, dtoBase())).rejects.toThrow(
        'Nenhum caixa aberto encontrado',
      );
    });
  });

  describe('checkout - venda normal', () => {
    it('deve criar pedido, baixar estoque e registrar pagamento no caixa', async () => {
      const produto = { ...produtoBase, controlaEstoque: true };
      prisma.produto.findMany.mockResolvedValue([produto]);
      tx.pedido.create.mockResolvedValue(pedidoMock);
      tx.estoqueItem.findFirst.mockResolvedValue({
        id: 'ei1',
        negocioId,
        produtoId: 'p1',
        unidade: 'un',
        quantidadeAtual: 100,
      });
      tx.estoqueItem.update.mockResolvedValue({});
      tx.movimentacaoEstoque.create.mockResolvedValue({});
      tx.caixaMovimento.create.mockResolvedValue({});

      const result = await service.checkout(
        negocioId,
        dtoBase({ itens: [{ produtoId: 'p1', quantidade: 2 }], pagamento: { metodo: 'PIX', valorPago: 20 } }),
        usuarioId,
      );

      expect(result.id).toBe('pedido1');
      expect(tx.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ negocioId, usuarioId, status: 'CONFIRMADO', total: 20 }),
        }),
      );
      expect(tx.estoqueItem.update).toHaveBeenCalledWith({
        where: { id: 'ei1' },
        data: { quantidadeAtual: { decrement: 2 } },
      });
      expect(tx.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tipo: 'SAIDA_VENDA', quantidade: 2, referencia: 'pedido1' }),
        }),
      );
      expect(tx.caixaMovimento.create).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith(`catalog:v2:${negocioId}:products`);
      expect(mockImprimirService.imprimirComanda).toHaveBeenCalledWith(negocioId, 'pedido1');
      expect(mockFiscalService.emitirNFe).toHaveBeenCalledWith(negocioId, 'pedido1');
    });
  });

  describe('checkout - venda por peso', () => {
    it('deve converter 1.5kg para 1500 quando a unidade do estoque for gramas', async () => {
      const produto = { ...produtoBase, controlaEstoque: true, vendaPorPeso: true, preco: 12 };
      prisma.produto.findMany.mockResolvedValue([produto]);
      tx.pedido.create.mockResolvedValue({
        ...pedidoMock,
        total: 18,
        itens: [{ produtoId: 'p1', produtoNome: 'Produto', precoUnitario: 12, quantidade: 1.5 }],
      });
      tx.estoqueItem.findFirst.mockResolvedValue({
        id: 'ei1',
        negocioId,
        produtoId: 'p1',
        unidade: 'g',
        quantidadeAtual: 5000,
      });
      tx.estoqueItem.update.mockResolvedValue({});
      tx.movimentacaoEstoque.create.mockResolvedValue({});
      tx.caixaMovimento.create.mockResolvedValue({});

      await service.checkout(negocioId, dtoBase({ itens: [{ produtoId: 'p1', quantidade: 1.5 }] }));

      expect(tx.estoqueItem.update).toHaveBeenCalledWith({
        where: { id: 'ei1' },
        data: { quantidadeAtual: { decrement: 1500 } },
      });
      expect(tx.movimentacaoEstoque.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ quantidade: 1500 }) }),
      );
    });

    it('deve manter 1.5 quando a unidade do estoque for kg', async () => {
      const produto = { ...produtoBase, controlaEstoque: true, vendaPorPeso: true, preco: 12 };
      prisma.produto.findMany.mockResolvedValue([produto]);
      tx.pedido.create.mockResolvedValue({
        ...pedidoMock,
        total: 18,
        itens: [{ produtoId: 'p1', produtoNome: 'Produto', precoUnitario: 12, quantidade: 1.5 }],
      });
      tx.estoqueItem.findFirst.mockResolvedValue({
        id: 'ei1',
        negocioId,
        produtoId: 'p1',
        unidade: 'kg',
        quantidadeAtual: 10,
      });
      tx.estoqueItem.update.mockResolvedValue({});
      tx.movimentacaoEstoque.create.mockResolvedValue({});
      tx.caixaMovimento.create.mockResolvedValue({});

      await service.checkout(negocioId, dtoBase({ itens: [{ produtoId: 'p1', quantidade: 1.5 }] }));

      expect(tx.estoqueItem.update).toHaveBeenCalledWith({
        where: { id: 'ei1' },
        data: { quantidadeAtual: { decrement: 1.5 } },
      });
    });
  });

  describe('checkout - estoque insuficiente', () => {
    it('deve usar fallback por produtoId quando não houver estoqueItem no negócio atual', async () => {
      const produto = { ...produtoBase, controlaEstoque: true };
      prisma.produto.findMany.mockResolvedValue([produto]);
      tx.pedido.create.mockResolvedValue(pedidoMock);
      tx.estoqueItem.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'ei2',
          negocioId: 'n2',
          produtoId: 'p1',
          unidade: 'un',
          quantidadeAtual: 100,
        });
      tx.estoqueItem.update.mockResolvedValue({});
      tx.movimentacaoEstoque.create.mockResolvedValue({});
      tx.caixaMovimento.create.mockResolvedValue({});

      const result = await service.checkout(negocioId, dtoBase({ itens: [{ produtoId: 'p1', quantidade: 2 }] }));

      expect(result.id).toBe('pedido1');
      expect(tx.estoqueItem.update).toHaveBeenCalledWith({
        where: { id: 'ei2' },
        data: { quantidadeAtual: { decrement: 2 } },
      });
    });

    it('deve lançar BadRequest quando realmente não houver estoqueItem', async () => {
      const produto = { ...produtoBase, controlaEstoque: true };
      prisma.produto.findMany.mockResolvedValue([produto]);
      tx.pedido.create.mockResolvedValue(pedidoMock);
      tx.estoqueItem.findFirst.mockResolvedValue(null);

      await expect(service.checkout(negocioId, dtoBase({ itens: [{ produtoId: 'p1', quantidade: 2 }] }))).rejects.toThrow(
        'Estoque insuficiente',
      );
    });

    it('deve lançar BadRequest quando a quantidade em estoque for menor que a vendida', async () => {
      const produto = { ...produtoBase, controlaEstoque: true };
      prisma.produto.findMany.mockResolvedValue([produto]);
      tx.pedido.create.mockResolvedValue(pedidoMock);
      tx.estoqueItem.findFirst.mockResolvedValue({
        id: 'ei1',
        negocioId,
        produtoId: 'p1',
        unidade: 'un',
        quantidadeAtual: 1,
      });

      await expect(service.checkout(negocioId, dtoBase({ itens: [{ produtoId: 'p1', quantidade: 2 }] }))).rejects.toThrow(
        'Estoque insuficiente',
      );
    });
  });

  describe('checkout - descontos', () => {
    it('deve aplicar desconto FIXO por item', async () => {
      prisma.produto.findMany.mockResolvedValue([produtoBase]);
      tx.pedido.create.mockResolvedValue(pedidoMock);

      await service.checkout(
        negocioId,
        dtoBase({
          itens: [{ produtoId: 'p1', quantidade: 1, desconto: { tipo: 'FIXO', valor: 2 } }],
          pagamento: { metodo: 'PIX' },
        }),
      );

      expect(tx.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 8 }) }),
      );
    });

    it('deve aplicar desconto PERCENTUAL por item', async () => {
      prisma.produto.findMany.mockResolvedValue([produtoBase]);
      tx.pedido.create.mockResolvedValue(pedidoMock);

      await service.checkout(
        negocioId,
        dtoBase({
          itens: [{ produtoId: 'p1', quantidade: 1, desconto: { tipo: 'PERCENTUAL', valor: 10 } }],
          pagamento: { metodo: 'PIX' },
        }),
      );

      expect(tx.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 9 }) }),
      );
    });

    it('deve aplicar descontoTotal FIXO', async () => {
      prisma.produto.findMany.mockResolvedValue([produtoBase]);
      tx.pedido.create.mockResolvedValue(pedidoMock);

      await service.checkout(
        negocioId,
        dtoBase({
          itens: [{ produtoId: 'p1', quantidade: 2 }],
          pagamento: { metodo: 'PIX' },
          descontoTotal: { tipo: 'FIXO', valor: 5 },
        }),
      );

      expect(tx.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 15 }) }),
      );
    });

    it('deve aplicar descontoTotal PERCENTUAL', async () => {
      prisma.produto.findMany.mockResolvedValue([produtoBase]);
      tx.pedido.create.mockResolvedValue(pedidoMock);

      await service.checkout(
        negocioId,
        dtoBase({
          itens: [{ produtoId: 'p1', quantidade: 2 }],
          pagamento: { metodo: 'PIX' },
          descontoTotal: { tipo: 'PERCENTUAL', valor: 10 },
        }),
      );

      expect(tx.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 18 }) }),
      );
    });
  });

  describe('checkout - taxa de cartão', () => {
    it('deve somar taxa de cartão no pagamento com cartão de crédito', async () => {
      prisma.produto.findMany.mockResolvedValue([{ ...produtoBase, preco: 50 }]);
      prisma.configuracaoNegocio.findUnique.mockResolvedValue({
        taxaCartaoFaixas: [{ ate: 100, valor: 3 }],
      });
      tx.pedido.create.mockResolvedValue(pedidoMock);

      await service.checkout(
        negocioId,
        dtoBase({
          itens: [{ produtoId: 'p1', quantidade: 1 }],
          pagamento: { metodo: 'CARTAO_CREDITO', valorPago: 100 },
        }),
      );

      const data = tx.pedido.create.mock.calls[0][0].data;
      expect(data.total).toBe(53);
      expect(data.pagamentos.create.dadosPagamento.taxaCartao).toBe(3);
    });

    it('deve somar taxa de cartão no pagamento com cartão de débito', async () => {
      prisma.produto.findMany.mockResolvedValue([{ ...produtoBase, preco: 50 }]);
      prisma.configuracaoNegocio.findUnique.mockResolvedValue({
        taxaCartaoFaixas: [{ ate: 100, valor: 3 }],
      });
      tx.pedido.create.mockResolvedValue(pedidoMock);

      await service.checkout(
        negocioId,
        dtoBase({
          itens: [{ produtoId: 'p1', quantidade: 1 }],
          pagamento: { metodo: 'CARTAO_DEBITO', valorPago: 100 },
        }),
      );

      const data = tx.pedido.create.mock.calls[0][0].data;
      expect(data.total).toBe(53);
      expect(data.pagamentos.create.dadosPagamento.taxaCartao).toBe(3);
    });

    it('não deve calcular taxa para pagamento em PIX', async () => {
      prisma.produto.findMany.mockResolvedValue([produtoBase]);
      tx.pedido.create.mockResolvedValue(pedidoMock);

      await service.checkout(negocioId, dtoBase());

      expect(prisma.configuracaoNegocio.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('checkout - crediário', () => {
    it('deve lançar BadRequest quando não houver clienteId', async () => {
      prisma.produto.findMany.mockResolvedValue([produtoBase]);

      await expect(
        service.checkout(
          negocioId,
          dtoBase({
            pagamento: { metodo: 'CREDIARIO' },
            dataVencimento: '2026-09-01',
          }),
        ),
      ).rejects.toThrow('Selecione um cliente para venda a prazo');
    });

    it('deve lançar BadRequest quando não houver dataVencimento', async () => {
      prisma.produto.findMany.mockResolvedValue([produtoBase]);

      await expect(
        service.checkout(
          negocioId,
          dtoBase({
            pagamento: { metodo: 'CREDIARIO' },
            clienteId: 'cl1',
          }),
        ),
      ).rejects.toThrow('Informe a data de vencimento');
    });

    it('deve lançar BadRequest quando o cliente não tiver limite de crédito suficiente', async () => {
      prisma.produto.findMany.mockResolvedValue([produtoBase]);
      prisma.cliente.findUnique.mockResolvedValue({ id: 'cl1', saldoDevedor: 100, limiteCredito: 50 });

      await expect(
        service.checkout(
          negocioId,
          dtoBase({
            pagamento: { metodo: 'CREDIARIO' },
            clienteId: 'cl1',
            dataVencimento: '2026-09-01',
          }),
        ),
      ).rejects.toThrow('não tem limite de crédito suficiente');
    });

    it('deve criar conta a receber e incrementar saldoDevedor para cliente válido', async () => {
      prisma.produto.findMany.mockResolvedValue([{ ...produtoBase, preco: 50 }]);
      prisma.cliente.findUnique.mockResolvedValue({ id: 'cl1', saldoDevedor: 0, limiteCredito: 1000 });
      tx.pedido.create.mockResolvedValue({
        ...pedidoMock,
        total: 50,
        itens: [{ produtoId: 'p1', produtoNome: 'Coxinha', precoUnitario: 50, quantidade: 1 }],
      });
      tx.contaReceber.create.mockResolvedValue({});
      tx.cliente.update.mockResolvedValue({});

      const result = await service.checkout(
        negocioId,
        dtoBase({
          itens: [{ produtoId: 'p1', quantidade: 1 }],
          pagamento: { metodo: 'CREDIARIO' },
          clienteId: 'cl1',
          dataVencimento: '2026-09-01',
        }),
      );

      expect(result.id).toBe('pedido1');
      expect(tx.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            total: 50,
            pagamentos: expect.objectContaining({
              create: expect.objectContaining({ status: 'PENDENTE' }),
            }),
          }),
        }),
      );
      expect(tx.contaReceber.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clienteId: 'cl1', negocioId, pedidoId: 'pedido1', valorTotal: 50 }),
        }),
      );
      expect(tx.cliente.update).toHaveBeenCalledWith({
        where: { id: 'cl1' },
        data: { saldoDevedor: { increment: 50 } },
      });
      expect(tx.caixaMovimento.create).not.toHaveBeenCalled();
    });
  });

  describe('checkout - total e troco', () => {
    it('deve arredondar o total e calcular troco quando valorPago for maior que o total', async () => {
      prisma.produto.findMany.mockResolvedValue([{ ...produtoBase, preco: 3.333 }]);
      tx.pedido.create.mockResolvedValue(pedidoMock);

      await service.checkout(
        negocioId,
        dtoBase({
          itens: [{ produtoId: 'p1', quantidade: 2 }],
          pagamento: { metodo: 'DINHEIRO', valorPago: 10 },
        }),
      );

      const data = tx.pedido.create.mock.calls[0][0].data;
      expect(data.total).toBe(6.66);
      expect(data.troco).toBe(3.34);
    });
  });
});
