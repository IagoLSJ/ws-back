import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { PrismaService } from '../../infra/database/prisma.service';

const mockPrisma = {
  cliente: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  contaReceber: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('ClientesService', () => {
  let service: ClientesService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClientesService>(ClientesService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(async (arg: any) => {
      if (typeof arg === 'function') return arg(mockPrisma);
      return Promise.all(arg);
    });
  });

  const clienteBase = {
    id: 'c1',
    cpfCnpj: '123.456.789-09',
    nome: 'João da Silva',
    telefone: '11999999999',
    limiteCredito: null,
    observacao: null,
    saldoDevedor: 0,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };

  describe('criar', () => {
    it('deve lançar ConflictException quando CPF/CNPJ já estiver cadastrado', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(clienteBase);

      await expect(service.criar({ cpfCnpj: '123.456.789-09', nome: 'João da Silva' } as any))
        .rejects.toThrow(ConflictException);

      expect(mockPrisma.cliente.create).not.toHaveBeenCalled();
    });

    it('deve criar cliente com sucesso quando CPF/CNPJ não existir', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null);
      mockPrisma.cliente.create.mockResolvedValue(clienteBase);

      const result = await service.criar({ cpfCnpj: '123.456.789-09', nome: 'João da Silva' } as any);

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith({
        data: { cpfCnpj: '123.456.789-09', nome: 'João da Silva', saldoDevedor: 0 },
      });
      expect(result.nome).toBe('João da Silva');
    });
  });

  describe('listar', () => {
    it('deve retornar clientes paginados sem filtro', async () => {
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        const results = await Promise.all(ops);
        return results;
      });
      mockPrisma.cliente.findMany.mockResolvedValue([clienteBase]);
      mockPrisma.cliente.count.mockResolvedValue(1);

      const result = await service.listar();

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.totalPages).toBe(1);
    });

    it('deve aplicar busca por nome, cpfCnpj ou telefone', async () => {
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        const results = await Promise.all(ops);
        return results;
      });
      mockPrisma.cliente.findMany.mockResolvedValue([]);
      mockPrisma.cliente.count.mockResolvedValue(0);

      await service.listar({ search: 'joão', page: 2, limit: 10 });

      const findManyArgs = mockPrisma.cliente.findMany.mock.calls[0][0];
      expect(findManyArgs.where.OR).toBeDefined();
      expect(findManyArgs.where.OR[0].nome.contains).toBe('joão');
      expect(findManyArgs.skip).toBe(10);
      expect(findManyArgs.take).toBe(10);
    });

    it('deve incluir contas a receber quando comSaldo for informado', async () => {
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        const results = await Promise.all(ops);
        return results;
      });
      mockPrisma.cliente.findMany.mockResolvedValue([]);
      mockPrisma.cliente.count.mockResolvedValue(0);

      await service.listar({ comSaldo: true });

      const findManyArgs = mockPrisma.cliente.findMany.mock.calls[0][0];
      expect(findManyArgs.include.contasReceber).toBeDefined();
    });
  });

  describe('buscarPorId', () => {
    it('deve lançar NotFoundException quando cliente não existir', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null);

      await expect(service.buscarPorId('inexistente')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar cliente com suas contas a receber', async () => {
      const contas = [{ id: 'cr1', clienteId: 'c1', valorTotal: 100, valorPago: 50 }];
      mockPrisma.cliente.findUnique.mockResolvedValue({ ...clienteBase, contasReceber: contas });

      const result = await service.buscarPorId('c1');

      expect(result.contasReceber).toHaveLength(1);
      expect(mockPrisma.cliente.findUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        include: { contasReceber: { orderBy: { criadoEm: 'desc' }, take: 50 } },
      });
    });
  });

  describe('atualizar', () => {
    it('deve lançar ConflictException quando CPF/CNPJ pertencer a outro cliente', async () => {
      mockPrisma.cliente.findUnique
        .mockResolvedValueOnce(clienteBase) // buscarPorId
        .mockResolvedValueOnce({ id: 'c2', cpfCnpj: '999.999.999-99' }); // checagem duplicado

      await expect(service.atualizar('c1', { cpfCnpj: '999.999.999-99' } as any))
        .rejects.toThrow(ConflictException);
    });

    it('deve atualizar cliente com sucesso', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(clienteBase);
      mockPrisma.cliente.update.mockResolvedValue({ ...clienteBase, nome: 'Novo Nome' });

      const result = await service.atualizar('c1', { nome: 'Novo Nome' } as any);

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { nome: 'Novo Nome' } });
      expect(result.nome).toBe('Novo Nome');
    });
  });

  describe('recalcularSaldos', () => {
    it('deve corrigir saldos devedores a partir das contas a receber', async () => {
      mockPrisma.cliente.findMany.mockResolvedValue([{ id: 'c1', nome: 'João' }]);
      mockPrisma.contaReceber.findMany.mockResolvedValue([
        { valorTotal: 100, valorPago: 30 },
        { valorTotal: 50, valorPago: 50 },
      ]);
      mockPrisma.cliente.findUnique.mockResolvedValueOnce({ id: 'c1', saldoDevedor: 0 });

      const result = await service.recalcularSaldos();

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { saldoDevedor: 70 },
      });
      expect(result).toEqual({ total: 1, corrigidos: 1 });
    });

    it('não deve atualizar quando saldo já estiver correto', async () => {
      mockPrisma.cliente.findMany.mockResolvedValue([{ id: 'c1', nome: 'João' }]);
      mockPrisma.contaReceber.findMany.mockResolvedValue([
        { valorTotal: 100, valorPago: 30 },
      ]);
      mockPrisma.cliente.findUnique.mockResolvedValueOnce({ id: 'c1', saldoDevedor: 70 });

      const result = await service.recalcularSaldos();

      expect(mockPrisma.cliente.update).not.toHaveBeenCalled();
      expect(result).toEqual({ total: 1, corrigidos: 0 });
    });
  });
});
