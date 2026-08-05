import { Test, TestingModule } from '@nestjs/testing';
import { RelatoriosService } from './relatorios.service';
import { PrismaService } from '../../infra/database/prisma.service';

const mockPrisma = {
  estoqueItem: { findMany: jest.fn() },
  movimentacaoEstoque: { findMany: jest.fn() },
  pedidoItem: { findMany: jest.fn() },
  pedido: { findMany: jest.fn() },
};

function resMock() {
  return { setHeader: jest.fn(), send: jest.fn() };
}

describe('RelatoriosService', () => {
  let service: RelatoriosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RelatoriosService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<RelatoriosService>(RelatoriosService);
    jest.clearAllMocks();
  });

  describe('resumoFinanceiro', () => {
    it('calcula faturamento, custo, lucro e ticket médio', async () => {
      mockPrisma.pedido.findMany.mockResolvedValue([
        {
          id: 'p1', total: 100, status: 'CONFIRMADO', criadoEm: new Date(), taxaFrete: 5,
          pagamentos: [{ metodo: 'DINHEIRO', valor: 100, status: 'PAGO' }],
          itens: [{ produtoId: 'x1', produtoNome: 'X', precoUnitario: 50, quantidade: 2, produto: { precoCusto: 20 } }],
        },
        {
          id: 'p2', total: 30, status: 'PENDENTE', criadoEm: new Date(),
          pagamentos: [{ metodo: 'PIX', valor: 30, status: 'PENDENTE' }],
          itens: [{ produtoId: 'y1', produtoNome: 'Y', precoUnitario: 10, quantidade: 3, produto: { precoCusto: 5 } }],
        },
      ]);

      const r = await service.resumoFinanceiro('n1');
      expect(r.totalFaturamento).toBe(130);
      expect(r.totalCusto).toBe(55); // 20*2 + 5*3
      expect(r.lucroLiquido).toBe(75);
      expect(r.totalPedidos).toBe(2);
      expect(r.ticketMedio).toBe(65);
      expect(r.porMetodoPagamento).toContainEqual({ metodo: 'DINHEIRO', valor: 100 });
      expect(r.lucroPorProduto[0].produtoNome).toBe('X');
      expect(r.lucroPorProduto[0].lucro).toBe(60);
    });

    it('exclui pedidos cancelados', async () => {
      mockPrisma.pedido.findMany.mockResolvedValue([]);
      await service.resumoFinanceiro('n1');
      const where = mockPrisma.pedido.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ not: 'CANCELADO' });
    });
  });

  describe('vendasCSV', () => {
    it('gera CSV com cabeçalhos e itens', async () => {
      mockPrisma.pedidoItem.findMany.mockResolvedValue([
        { pedidoId: 'p1', produtoNome: 'Coca', quantidade: 2, precoUnitario: 5, pedido: { criadoEm: new Date(), status: 'CONFIRMADO', total: 10 } },
      ]);
      const res = resMock();
      await service.vendasCSV('n1', res as any);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      const csv = res.send.mock.calls[0][0];
      expect(csv).toContain('Produto');
      expect(csv).toContain('Coca');
    });

    it('aplica filtro de data quando informado', async () => {
      mockPrisma.pedidoItem.findMany.mockResolvedValue([]);
      const res = resMock();
      await service.vendasCSV('n1', res as any, '2026-08-01', '2026-08-10');
      const where = mockPrisma.pedidoItem.findMany.mock.calls[0][0].where;
      expect(where.pedido.criadoEm.gte).toBeInstanceOf(Date);
      expect(where.pedido.criadoEm.lte).toBeInstanceOf(Date);
    });
  });

  describe('financeiroCSV', () => {
    it('gera uma linha por pagamento', async () => {
      mockPrisma.pedido.findMany.mockResolvedValue([
        { id: 'p1', total: 100, status: 'CONFIRMADO', criadoEm: new Date(), taxaFrete: '5',
          pagamentos: [{ metodo: 'PIX', status: 'PENDENTE' }, { metodo: 'DINHEIRO', status: 'PAGO' }] },
      ]);
      const res = resMock();
      await service.financeiroCSV('n1', res as any);
      const csv = res.send.mock.calls[0][0];
      expect(csv).toContain('Forma Pagamento');
      expect(csv).toContain('PIX');
      expect(csv).toContain('DINHEIRO');
    });
  });

  describe('estoqueResumido', () => {
    it('classifica situação ZERADO/CRÍTICO/OK', async () => {
      mockPrisma.estoqueItem.findMany.mockResolvedValue([
        { quantidadeAtual: 0, estoqueMinimo: 5, unidade: 'un', nome: 'A', produto: { nome: 'A', status: 'ATIVO', preco: 10 } },
        { quantidadeAtual: 3, estoqueMinimo: 5, unidade: 'un', nome: 'B', produto: { nome: 'B', status: 'ATIVO', preco: 10 } },
        { quantidadeAtual: 10, estoqueMinimo: 5, unidade: 'un', nome: 'C', produto: { nome: 'C', status: 'ATIVO', preco: 10 } },
      ]);
      const res = resMock();
      await service.estoqueResumido('n1', res as any);
      const csv = res.send.mock.calls[0][0];
      expect(csv).toContain('ZERADO');
      expect(csv).toContain('CRÍTICO');
      expect(csv).toContain('OK');
    });
  });

  describe('inventario', () => {
    it('gera CSV com inventário e movimentações', async () => {
      mockPrisma.estoqueItem.findMany.mockResolvedValue([
        { id: 'e1', nome: 'Item', quantidadeAtual: 5, estoqueMinimo: 1, unidade: 'un', atualizadoEm: new Date(), produto: { id: 'p1', nome: 'Item', sku: null, status: 'ATIVO', preco: 10 } },
      ]);
      mockPrisma.movimentacaoEstoque.findMany.mockResolvedValue([
        { tipo: 'ENTRADA', quantidade: 5, quantidadeAntes: 0, quantidadeApos: 5, motivo: 'compra', referencia: null, criadoEm: new Date(), estoqueItem: { produto: { nome: 'Item' } }, usuario: { nome: 'Ana' } },
      ]);
      const res = resMock();
      await service.inventario('n1', res as any);
      const csv = res.send.mock.calls[0][0];
      expect(csv).toContain('HISTÓRICO DE MOVIMENTAÇÕES');
      expect(csv).toContain('ENTRADA');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('inventario-'));
    });
  });
});
