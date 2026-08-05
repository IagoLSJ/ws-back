import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContasReceberService } from './contas-receber.service';
import { PrismaService } from '../../infra/database/prisma.service';

const mockPrisma = {
  contaReceber: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), count: jest.fn(), update: jest.fn() },
  cliente: { findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};

describe('ContasReceberService', () => {
  let service: ContasReceberService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContasReceberService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ContasReceberService>(ContasReceberService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe('criar', () => {
    it('marca ATRASADO quando vencimento é anterior a hoje', async () => {
      mockPrisma.contaReceber.create.mockResolvedValue({ id: 'c1' });
      await service.criar({ clienteId: 'cl1', negocioId: 'n1', pedidoId: 'p1', valorTotal: 50, dataVencimento: '2020-01-01' });
      expect(mockPrisma.contaReceber.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ATRASADO' }) }),
      );
    });

    it('marca PENDENTE quando vencimento é futuro', async () => {
      mockPrisma.contaReceber.create.mockResolvedValue({ id: 'c1' });
      await service.criar({ clienteId: 'cl1', negocioId: 'n1', pedidoId: 'p1', valorTotal: 50, dataVencimento: '2030-01-01' });
      expect(mockPrisma.contaReceber.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDENTE' }) }),
      );
    });
  });

  describe('listar', () => {
    it('retorna paginação', async () => {
      mockPrisma.$transaction.mockResolvedValue([[{ id: 'c1' }], 1]);
      const result = await service.listar('n1', { page: 1, limit: 10 });
      expect(result.data).toEqual([{ id: 'c1' }]);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('filtra por status padrão (não-PAGO)', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      await service.listar('n1');
      const where = mockPrisma.contaReceber.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: ['PENDENTE', 'PARCIAL', 'ATRASADO'] });
    });
  });

  describe('darBaixa', () => {
    const conta = { id: 'c1', clienteId: 'cl1', valorTotal: 100, valorPago: 0, status: 'PENDENTE' };

    it('lança 404 se conta não existe', async () => {
      mockPrisma.contaReceber.findFirst.mockResolvedValue(null);
      await expect(service.darBaixa('n1', 'c1', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança BadRequest se já paga', async () => {
      mockPrisma.contaReceber.findFirst.mockResolvedValue({ ...conta, status: 'PAGO' });
      await expect(service.darBaixa('n1', 'c1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marca PAGO quando valor cobre o total e decrementa saldo', async () => {
      mockPrisma.contaReceber.findFirst.mockResolvedValue(conta);
      mockPrisma.$transaction.mockImplementation((promises) => Promise.all(promises));
      mockPrisma.contaReceber.update.mockResolvedValue({ id: 'c1', valorPago: 100, status: 'PAGO' });
      mockPrisma.cliente.update.mockResolvedValue({});
      mockPrisma.contaReceber.findUnique.mockResolvedValue({ id: 'c1', status: 'PAGO' });

      const result = await service.darBaixa('n1', 'c1', { valor: 100 });
      expect(result!.status).toBe('PAGO');
      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { saldoDevedor: { decrement: 100 } } }),
      );
    });

    it('marca PARCIAL quando valor cobre parcialmente', async () => {
      mockPrisma.contaReceber.findFirst.mockResolvedValue(conta);
      mockPrisma.$transaction.mockImplementation((promises) => Promise.all(promises));
      mockPrisma.contaReceber.update.mockResolvedValue({ id: 'c1', valorPago: 40, status: 'PARCIAL' });
      mockPrisma.cliente.update.mockResolvedValue({});
      mockPrisma.contaReceber.findUnique.mockResolvedValue({ id: 'c1', status: 'PARCIAL' });

      const result = await service.darBaixa('n1', 'c1', { valor: 40 });
      expect(result!.status).toBe('PARCIAL');
    });
  });

  describe('darBaixaCliente', () => {
    it('lança BadRequest quando valor excede saldo', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue({ id: 'cl1', saldoDevedor: 50 });
      await expect(service.darBaixaCliente('n1', 'cl1', { valor: 100 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('abate nas contas pendentes na ordem de vencimento', async () => {
      mockPrisma.cliente.findUnique
        .mockResolvedValueOnce({ id: 'cl1', saldoDevedor: 80, nome: 'Ana', cpfCnpj: '123' })
        .mockResolvedValueOnce({ id: 'cl1', saldoDevedor: 30, nome: 'Ana', cpfCnpj: '123' });
      mockPrisma.contaReceber.findMany.mockResolvedValue([
        { id: 'a', valorTotal: 50, valorPago: 0, status: 'PENDENTE' },
        { id: 'b', valorTotal: 30, valorPago: 0, status: 'PENDENTE' },
      ]);

      const result = await service.darBaixaCliente('n1', 'cl1', { valor: 50 });

      // 50 abate: 50 na conta 'a' (fica PAGO) e nada na 'b'
      expect(mockPrisma.contaReceber.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.contaReceber.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a' }, data: expect.objectContaining({ status: 'PAGO' }) }),
      );
      expect(result.saldoAtual).toBe(30);
      expect(result.valorAbatido).toBe(50);
    });
  });

  it('buscarPorId lança 404', async () => {
    mockPrisma.contaReceber.findFirst.mockResolvedValue(null);
    await expect(service.buscarPorId('n1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
