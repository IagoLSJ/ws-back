import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CarrinhoService } from './carrinho.service';
import { PrismaService } from '../../infra/database/prisma.service';

const mockPrisma = {
  negocio: {
    findUnique: jest.fn(),
  },
  carrinho: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  carrinhoItem: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  produto: {
    findFirst: jest.fn(),
  },
  opcaoModificador: {
    findMany: jest.fn(),
  },
  grupoModificador: {
    findMany: jest.fn(),
  },
};

describe('CarrinhoService', () => {
  let service: CarrinhoService;
  let prisma: typeof mockPrisma;

  const carrinhoExistente = {
    id: 'c1',
    negocioId: 'n1',
    sessionId: 'sess1',
    usuarioId: null,
    mesaId: null,
    itens: [],
  };

  const produtoAtivo = {
    id: 'p1',
    negocioId: 'n1',
    nome: 'Coxinha',
    preco: 10,
    status: 'ATIVO',
    vendaPorPeso: false,
    tipoDesconto: null,
    valorDesconto: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CarrinhoService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CarrinhoService>(CarrinhoService);
    prisma = module.get(PrismaService);

    jest.resetAllMocks();
  });

  describe('resolverNegócio por slug', () => {
    it('deve resolver negócio pelo slug', async () => {
      mockPrisma.negocio.findUnique
        .mockResolvedValueOnce({ id: 'n1' })
        .mockResolvedValueOnce(null);

      const carrinho = { ...carrinhoExistente };
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinho);
      mockPrisma.carrinhoItem.findMany.mockResolvedValue([]);

      await service.listar('meu-slug', 'sess1');

      expect(mockPrisma.negocio.findUnique).toHaveBeenCalledWith({
        where: { slug: 'meu-slug', ativo: true },
        select: { id: true },
      });
    });

    it('deve resolver negócio pelo id quando o slug não for encontrado', async () => {
      mockPrisma.negocio.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'n1' });

      const carrinho = { ...carrinhoExistente };
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinho);
      mockPrisma.carrinhoItem.findMany.mockResolvedValue([]);

      await service.listar('n1', 'sess1');

      expect(mockPrisma.negocio.findUnique).toHaveBeenLastCalledWith({
        where: { id: 'n1', ativo: true },
        select: { id: true },
      });
    });

    it('deve lançar NotFoundException quando o negócio não existir', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue(null);

      await expect(service.listar('inexistente', 'sess1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('adicionar', () => {
    it('deve lançar NotFoundException quando o produto não existir ou estiver inativo', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.produto.findFirst.mockResolvedValue(null);

      await expect(
        service.adicionar('slug', 'sess1', { produtoId: 'p1' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException quando produto por peso não informar quantidade', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.produto.findFirst.mockResolvedValue({ ...produtoAtivo, vendaPorPeso: true });

      await expect(
        service.adicionar('slug', 'sess1', { produtoId: 'p1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve adicionar item criando um novo carrinho', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.produto.findFirst.mockResolvedValue(produtoAtivo);
      mockPrisma.carrinho.findUnique.mockResolvedValue(null);
      mockPrisma.carrinho.create.mockResolvedValue(carrinhoExistente);
      mockPrisma.grupoModificador.findMany.mockResolvedValue([]);
      const itemCriado = {
        id: 'item1',
        carrinhoId: 'c1',
        produtoId: 'p1',
        quantidade: 2,
        produto: produtoAtivo,
        opcoesSelecionadas: [],
      };
      mockPrisma.carrinhoItem.create.mockResolvedValue(itemCriado);

      const result = await service.adicionar(
        'slug',
        'sess1',
        { produtoId: 'p1', quantidade: 2 } as any,
        'u1',
      );

      expect(mockPrisma.carrinho.create).toHaveBeenCalledWith({
        data: { negocioId: 'n1', sessionId: 'sess1', usuarioId: 'u1', mesaId: undefined },
        include: {
          itens: { include: { produto: true, opcoesSelecionadas: { include: { opcao: true } } } },
        },
      });
      expect(mockPrisma.carrinhoItem.create).toHaveBeenCalled();
      expect(result.id).toBe('item1');
    });

    it('deve adicionar item em carrinho existente sem criar um novo', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.produto.findFirst.mockResolvedValue(produtoAtivo);
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinhoExistente);
      mockPrisma.grupoModificador.findMany.mockResolvedValue([]);
      mockPrisma.carrinhoItem.create.mockResolvedValue({ id: 'item1' });

      const result = await service.adicionar('slug', 'sess1', { produtoId: 'p1', quantidade: 1 } as any);

      expect(mockPrisma.carrinho.create).not.toHaveBeenCalled();
      expect(mockPrisma.carrinhoItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ carrinhoId: 'c1' }),
        }),
      );
      expect(result.id).toBe('item1');
    });

    it('deve lançar BadRequestException quando opções selecionadas forem inválidas', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.produto.findFirst.mockResolvedValue(produtoAtivo);
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinhoExistente);
      mockPrisma.opcaoModificador.findMany.mockResolvedValue([{ id: 'o1' }]);

      await expect(
        service.adicionar('slug', 'sess1', {
          produtoId: 'p1',
          quantidade: 1,
          opcoesSelecionadas: ['o1', 'o2'],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException quando grupo obrigatório não for selecionado', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.produto.findFirst.mockResolvedValue(produtoAtivo);
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinhoExistente);
      mockPrisma.grupoModificador.findMany.mockResolvedValue([
        {
          id: 'g1',
          nome: 'Recheio',
          obrigatorio: true,
          opcoes: [{ id: 'o1' }],
        },
      ]);

      await expect(
        service.adicionar('slug', 'sess1', { produtoId: 'p1', quantidade: 1 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removerItem', () => {
    it('deve lançar NotFoundException quando o item não existir no carrinho', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinhoExistente);
      mockPrisma.carrinhoItem.findFirst.mockResolvedValue(null);

      await expect(service.removerItem('slug', 'sess1', 'item1')).rejects.toThrow(NotFoundException);
    });

    it('deve remover o item do carrinho com sucesso', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinhoExistente);
      mockPrisma.carrinhoItem.findFirst.mockResolvedValue({ id: 'item1', carrinhoId: 'c1' });
      mockPrisma.carrinhoItem.delete.mockResolvedValue({});

      const result = await service.removerItem('slug', 'sess1', 'item1');

      expect(result).toEqual({ removido: true });
      expect(mockPrisma.carrinhoItem.delete).toHaveBeenCalledWith({ where: { id: 'item1' } });
    });
  });

  describe('atualizarQuantidade', () => {
    it('deve lançar NotFoundException quando o item não existir', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinhoExistente);
      mockPrisma.carrinhoItem.findFirst.mockResolvedValue(null);

      await expect(service.atualizarQuantidade('slug', 'sess1', 'item1', 2)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve remover o item quando a quantidade for <= 0', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinhoExistente);
      mockPrisma.carrinhoItem.findFirst.mockResolvedValue({
        id: 'item1',
        carrinhoId: 'c1',
        produto: { vendaPorPeso: false, nome: 'Coxinha' },
      });
      mockPrisma.carrinhoItem.delete.mockResolvedValue({});

      const result = await service.atualizarQuantidade('slug', 'sess1', 'item1', 0);

      expect(result).toEqual({ removido: true });
      expect(mockPrisma.carrinhoItem.delete).toHaveBeenCalledWith({ where: { id: 'item1' } });
    });

    it('deve atualizar a quantidade do item com sucesso', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinhoExistente);
      mockPrisma.carrinhoItem.findFirst.mockResolvedValue({
        id: 'item1',
        carrinhoId: 'c1',
        produto: { vendaPorPeso: false, nome: 'Coxinha' },
      });
      const atualizado = { id: 'item1', quantidade: 5 };
      mockPrisma.carrinhoItem.update.mockResolvedValue(atualizado);

      const result = await service.atualizarQuantidade('slug', 'sess1', 'item1', 5);

      expect((result as any).quantidade).toBe(5);
      expect(mockPrisma.carrinhoItem.update).toHaveBeenCalledWith({
        where: { id: 'item1' },
        data: { quantidade: 5 },
        include: { produto: true, opcoesSelecionadas: { include: { opcao: true } } },
      });
    });
  });

  describe('listar (calcular total)', () => {
    it('deve retornar itens e o total calculado considerando opções', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinhoExistente);
      mockPrisma.carrinhoItem.findMany.mockResolvedValue([
        {
          id: 'item1',
          carrinhoId: 'c1',
          produtoId: 'p1',
          quantidade: 2,
          produto: {
            id: 'p1',
            nome: 'Coxinha',
            preco: 10,
            tipoDesconto: null,
            valorDesconto: null,
            imagens: [],
          },
          opcoesSelecionadas: [
            { id: 'os1', opcaoId: 'o1', opcao: { id: 'o1', nome: 'Extra', precoExtra: 2 } },
          ],
        },
      ]);

      const result = await service.listar('slug', 'sess1');

      expect(result.itens).toHaveLength(1);
      expect(result.total).toBe(24);
    });

    it('deve considerar desconto percentual no total', async () => {
      mockPrisma.negocio.findUnique.mockResolvedValue({ id: 'n1' });
      mockPrisma.carrinho.findUnique.mockResolvedValue(carrinhoExistente);
      mockPrisma.carrinhoItem.findMany.mockResolvedValue([
        {
          id: 'item1',
          carrinhoId: 'c1',
          produtoId: 'p1',
          quantidade: 1,
          produto: {
            id: 'p1',
            nome: 'Coxinha',
            preco: 20,
            tipoDesconto: 'PERCENTUAL',
            valorDesconto: 10,
            imagens: [],
          },
          opcoesSelecionadas: [],
        },
      ]);

      const result = await service.listar('slug', 'sess1');

      expect(result.total).toBe(18);
    });
  });
});
