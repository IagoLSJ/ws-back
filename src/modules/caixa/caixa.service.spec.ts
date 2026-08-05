import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CaixaService } from './caixa.service';
import { PrismaService } from '../../infra/database/prisma.service';

const mockPrisma = {
  caixa: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  caixaMovimento: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  pedido: {
    findMany: jest.fn(),
  },
  membroNegocio: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const criarMovimento = (
  id: string,
  tipo: string,
  valor: number,
  overrides: any = {},
) => ({
  id,
  caixaId: overrides.caixaId ?? 'c1',
  tipo,
  valor,
  formaPagamento: null,
  pedidoId: null,
  criadoEm: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('CaixaService', () => {
  let service: CaixaService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaixaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CaixaService>(CaixaService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('temCaixaAberto', () => {
    it('deve retornar true quando existir caixa aberto', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue({ id: 'c1' });

      const result = await service.temCaixaAberto('n1');

      expect(result).toBe(true);
      expect(mockPrisma.caixa.findFirst).toHaveBeenCalledWith({
        where: { negocioId: 'n1', status: 'ABERTO' },
      });
    });

    it('deve incluir operadorId no filtro quando usuarioId for informado', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue({ id: 'c1' });

      await service.temCaixaAberto('n1', 'u1');

      expect(mockPrisma.caixa.findFirst).toHaveBeenCalledWith({
        where: { negocioId: 'n1', status: 'ABERTO', operadorId: 'u1' },
      });
    });

    it('deve retornar false quando não existir caixa aberto', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue(null);

      const result = await service.temCaixaAberto('n1');

      expect(result).toBe(false);
    });
  });

  describe('exigirCaixaAberto', () => {
    it('deve lançar BadRequestException quando não houver caixa aberto', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue(null);

      await expect(service.exigirCaixaAberto('n1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('não deve lançar quando existir caixa aberto', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue({ id: 'c1' });

      await expect(service.exigirCaixaAberto('n1', 'u1')).resolves.toBeUndefined();
    });
  });

  describe('atual', () => {
    const caixa = { id: 'c1', saldoInicial: 0, negocioId: 'n1', operadorId: 'u1', status: 'ABERTO' };

    it('deve retornar null quando não houver caixa aberto', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue(null);

      const result = await service.atual('n1', 'u1');

      expect(result).toBeNull();
    });

    it('deve calcular totais ao vivo a partir dos movimentos', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue(caixa);
      const movimentos = [
        criarMovimento('m1', 'PAGAMENTO', 100, { formaPagamento: 'DINHEIRO', pedidoId: 'ped1' }),
        criarMovimento('m2', 'PAGAMENTO', 50, { formaPagamento: 'PIX', pedidoId: 'ped2' }),
        criarMovimento('m3', 'PAGAMENTO', 30, { formaPagamento: 'CARTAO_DEBITO' }),
        criarMovimento('m4', 'PAGAMENTO', 20, { formaPagamento: 'CARTAO_CREDITO' }),
        criarMovimento('m5', 'PAGAMENTO', 10, { formaPagamento: 'VALE_REFEICAO' }),
        criarMovimento('m6', 'SANGRIA', 15),
        criarMovimento('m7', 'SUPRIMENTO', 25),
      ];
      mockPrisma.caixaMovimento.findMany.mockResolvedValue(movimentos);
      mockPrisma.pedido.findMany.mockResolvedValue([{ troco: 10 }, { troco: 5 }]);

      const result = await service.atual('n1', 'u1');

      expect(result!.totalVendas).toBe(210);
      expect(result!.totalDinheiro).toBe(100);
      expect(result!.totalDebito).toBe(30);
      expect(result!.totalCredito).toBe(20);
      expect(result!.totalPix).toBe(50);
      expect(result!.totalOutros).toBe(10);
      expect(result!.totalSangrias).toBe(15);
      expect(result!.totalSuprimentos).toBe(25);
      expect(result!.totalTroco).toBe(15);
      expect(mockPrisma.caixaMovimento.findMany).toHaveBeenCalledWith({
        where: { caixaId: 'c1' },
        orderBy: { criadoEm: 'desc' },
      });
      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['ped1', 'ped2'] } },
        select: { troco: true },
      });
    });

    it('deve calcular totais usando TODOS os movimentos, não apenas os 50 exibidos', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue(caixa);
      const movimentos = Array.from({ length: 60 }, (_, i) =>
        criarMovimento(`m${i}`, 'PAGAMENTO', 1, { formaPagamento: 'DINHEIRO' }),
      );
      mockPrisma.caixaMovimento.findMany.mockResolvedValue(movimentos);

      const result = await service.atual('n1', 'u1');

      expect(result!.totalVendas).toBe(60);
      expect((result as any)!.movimentos).toHaveLength(50);
      const findManyArgs = mockPrisma.caixaMovimento.findMany.mock.calls[0][0];
      expect(findManyArgs.take).toBeUndefined();
      expect(mockPrisma.pedido.findMany).not.toHaveBeenCalled();
    });
  });

  describe('listarAbertos', () => {
    it('deve calcular totais ao vivo para cada caixa aberto e limitar a 5 movimentos recentes', async () => {
      mockPrisma.caixa.findMany.mockResolvedValue([
        { id: 'c1', saldoInicial: 0 },
        { id: 'c2', saldoInicial: 0 },
      ]);
      const movimentosC1 = Array.from({ length: 6 }, (_, i) =>
        criarMovimento(`c1-m${i}`, 'PAGAMENTO', 10, { formaPagamento: 'DINHEIRO' }),
      );
      const movimentosC2 = [
        criarMovimento('c2-m1', 'PAGAMENTO', 5, { caixaId: 'c2', formaPagamento: 'PIX' }),
        criarMovimento('c2-m2', 'PAGAMENTO', 5, { caixaId: 'c2', formaPagamento: 'PIX' }),
      ];
      mockPrisma.caixaMovimento.findMany.mockResolvedValue([...movimentosC1, ...movimentosC2]);

      const result = await service.listarAbertos('n1');

      expect(mockPrisma.caixa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { negocioId: 'n1', status: 'ABERTO' } }),
      );
      const caixa1 = result.find((c: any) => c.id === 'c1');
      const caixa2 = result.find((c: any) => c.id === 'c2');
      expect(caixa1!.totalVendas).toBe(60);
      expect((caixa1 as any)!.movimentos).toHaveLength(5);
      expect(caixa2!.totalVendas).toBe(10);
      expect((caixa2 as any)!.movimentos).toHaveLength(2);
    });
  });

  describe('listar', () => {
    it('deve retornar lista de caixas do negócio', async () => {
      mockPrisma.caixa.findMany.mockResolvedValue([{ id: 'c1' }]);

      const result = await service.listar('n1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.caixa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { negocioId: 'n1' } }),
      );
    });
  });

  describe('detalhe', () => {
    it('deve lançar NotFoundException quando caixa não existir', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue(null);

      await expect(service.detalhe('n1', 'inexistente')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar caixa encontrado', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue({ id: 'c1', negocioId: 'n1' });

      const result = await service.detalhe('n1', 'c1');

      expect(result.id).toBe('c1');
      expect(mockPrisma.caixa.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1', negocioId: 'n1' } }),
      );
    });
  });

  describe('fechar', () => {
    const caixa = { id: 'c1', saldoInicial: 100, negocioId: 'n1', status: 'ABERTO', observacao: 'obs' };

    const mockTransaction = () => {
      const tx = {
        caixa: {
          findFirst: jest.fn().mockResolvedValue(caixa),
          update: jest.fn().mockResolvedValue({ id: 'c1', status: 'FECHADO' }),
        },
        caixaMovimento: {
          findMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'mv1' }),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    };

    it('deve atualizar totais, status e criar movimento FECHAMENTO', async () => {
      const tx = mockTransaction();
      tx.caixaMovimento.findMany.mockResolvedValue([
        criarMovimento('m1', 'PAGAMENTO', 100, { formaPagamento: 'DINHEIRO', pedidoId: 'ped1' }),
        criarMovimento('m2', 'SANGRIA', 10),
      ]);
      mockPrisma.pedido.findMany.mockResolvedValue([{ troco: 20 }]);

      await service.fechar('n1', { saldoFinal: 150, caixaId: 'c1' } as any, 'u1');

      expect(tx.caixa.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          data: expect.objectContaining({
            status: 'FECHADO',
            saldoFinal: 150,
            totalVendas: 100,
            totalSangrias: 10,
            totalTroco: 20,
          }),
        }),
      );
      expect(tx.caixaMovimento.create).toHaveBeenCalledWith({
        data: {
          caixaId: 'c1',
          tipo: 'FECHAMENTO',
          valor: 150,
          descricao: 'Fechamento de caixa',
        },
      });
    });

    it('deve fechar pelo operador quando caixaId não for informado', async () => {
      const tx = mockTransaction();
      tx.caixaMovimento.findMany.mockResolvedValue([]);

      await service.fechar('n1', { saldoFinal: 100 } as any, 'u1');

      expect(tx.caixa.findFirst).toHaveBeenCalledWith({
        where: { negocioId: 'n1', status: 'ABERTO', operadorId: 'u1' },
      });
    });

    it('deve lançar NotFoundException quando não houver caixa aberto', async () => {
      const tx = {
        caixa: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
        caixaMovimento: { findMany: jest.fn(), create: jest.fn() },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await expect(
        service.fechar('n1', { saldoFinal: 100 } as any, 'u1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('movimento', () => {
    const caixa = { id: 'c1', saldoInicial: 100, negocioId: 'n1', status: 'ABERTO', operadorId: 'u1' };

    const mockTransaction = () => {
      const tx = {
        caixa: {
          findFirst: jest.fn().mockResolvedValue(caixa),
        },
        caixaMovimento: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: 'mv1' }),
        },
        membroNegocio: { findUnique: jest.fn() },
        pedido: { findMany: jest.fn() },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    };

    it('deve criar movimento de SANGRIA', async () => {
      const tx = mockTransaction();

      await service.movimento('n1', { tipo: 'SANGRIA', valor: 20 } as any, 'u1');

      expect(tx.caixaMovimento.create).toHaveBeenCalledWith({
        data: {
          caixaId: 'c1',
          tipo: 'SANGRIA',
          valor: 20,
          descricao: 'Sangria',
        },
      });
    });

    it('deve criar movimento de SUPRIMENTO', async () => {
      const tx = mockTransaction();

      await service.movimento('n1', { tipo: 'SUPRIMENTO', valor: 30 } as any, 'u1');

      expect(tx.caixaMovimento.create).toHaveBeenCalledWith({
        data: {
          caixaId: 'c1',
          tipo: 'SUPRIMENTO',
          valor: 30,
          descricao: 'Suprimento',
        },
      });
    });

    it('deve usar descricao informada no movimento', async () => {
      const tx = mockTransaction();

      await service.movimento('n1', { tipo: 'SUPRIMENTO', valor: 30, descricao: 'Troco para cliente' } as any, 'u1');

      expect(tx.caixaMovimento.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ descricao: 'Troco para cliente' }),
        }),
      );
    });

    it('deve lançar NotFoundException quando não houver caixa aberto', async () => {
      const tx = {
        caixa: { findFirst: jest.fn().mockResolvedValue(null) },
        caixaMovimento: { findMany: jest.fn(), create: jest.fn() },
        membroNegocio: { findUnique: jest.fn() },
        pedido: { findMany: jest.fn() },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await expect(
        service.movimento('n1', { tipo: 'SANGRIA', valor: 20 } as any, 'u1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException quando sangria exceder saldo disponível', async () => {
      const tx = mockTransaction();
      tx.caixaMovimento.findMany.mockResolvedValue([
        criarMovimento('m1', 'PAGAMENTO', 50, { formaPagamento: 'DINHEIRO' }),
      ]);

      await expect(
        service.movimento('n1', { tipo: 'SANGRIA', valor: 200 } as any, 'u1'),
      ).rejects.toThrow(BadRequestException);
      expect(tx.caixaMovimento.create).not.toHaveBeenCalled();
    });
  });

  describe('registrarPagamento', () => {
    it('deve criar movimento PAGAMENTO com caixa aberto', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue({ id: 'c1', negocioId: 'n1', status: 'ABERTO' });
      mockPrisma.caixaMovimento.create.mockResolvedValue({ id: 'mv1' });

      await service.registrarPagamento('n1', 'pedido-1234', 45.5, 'PIX', 'u1');

      expect(mockPrisma.caixa.findFirst).toHaveBeenCalledWith({
        where: { negocioId: 'n1', status: 'ABERTO', operadorId: 'u1' },
      });
      expect(mockPrisma.caixaMovimento.create).toHaveBeenCalledWith({
        data: {
          caixaId: 'c1',
          tipo: 'PAGAMENTO',
          valor: 45.5,
          formaPagamento: 'PIX',
          pedidoId: 'pedido-1234',
          descricao: 'Venda #pedido-1',
        },
      });
    });

    it('deve lançar BadRequestException quando não houver caixa aberto', async () => {
      mockPrisma.caixa.findFirst.mockResolvedValue(null);

      await expect(
        service.registrarPagamento('n1', 'pedido-1234', 10, 'DINHEIRO'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.caixaMovimento.create).not.toHaveBeenCalled();
    });
  });
});
