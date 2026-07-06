import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { AdicionarAoCarrinhoDto } from './dto/adicionar-ao-carrinho.dto';
import { calcularPrecoFinal } from '../../common/utils/preco';

@Injectable()
export class CarrinhoService {
  constructor(private prisma: PrismaService) {}

  private async resolveNegocioId(slug: string): Promise<string> {
    const negocio = await this.prisma.negocio.findUnique({
      where: { slug, ativo: true },
      select: { id: true },
    });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');
    return negocio.id;
  }

  private async obterOuCriarCarrinho(negocioId: string, sessionId: string, usuarioId?: string) {
    let carrinho = await this.prisma.carrinho.findUnique({
      where: { negocioId_sessionId: { negocioId, sessionId } },
      include: {
        itens: { include: { produto: true, opcoesSelecionadas: { include: { opcao: true } } } },
      },
    });

    if (!carrinho) {
      carrinho = await this.prisma.carrinho.create({
        data: { negocioId, sessionId, usuarioId },
        include: {
          itens: { include: { produto: true, opcoesSelecionadas: { include: { opcao: true } } } },
        },
      });
    }

    return carrinho;
  }

  async listar(slug: string, sessionId: string) {
    const negocioId = await this.resolveNegocioId(slug);
    const carrinho = await this.obterOuCriarCarrinho(negocioId, sessionId);
    const itens = await this.prisma.carrinhoItem.findMany({
      where: { carrinhoId: carrinho.id },
      include: {
        produto: {
          select: {
            id: true,
            nome: true,
            preco: true,
            tipoDesconto: true,
            valorDesconto: true,
            imagens: { take: 1, where: { principal: true } },
          },
        },
        opcoesSelecionadas: { include: { opcao: true } },
      },
    });

    const total = itens.reduce((acc, item) => {
      const precoBase = calcularPrecoFinal(item.produto);
      const extraOpcoes = item.opcoesSelecionadas.reduce(
        (s, o) => s + Number(o.opcao.precoExtra),
        0,
      );
      return acc + (precoBase + extraOpcoes) * item.quantidade;
    }, 0);

    return { itens, total: Math.round(total * 100) / 100 };
  }

  async adicionar(
    slug: string,
    sessionId: string,
    dto: AdicionarAoCarrinhoDto,
    usuarioId?: string,
  ) {
    const negocioId = await this.resolveNegocioId(slug);

    const produto = await this.prisma.produto.findFirst({
      where: { id: dto.produtoId, negocioId, status: 'ATIVO' },
    });
    if (!produto) throw new NotFoundException('Produto não encontrado ou inativo');

    const carrinho = await this.obterOuCriarCarrinho(negocioId, sessionId, usuarioId);

    if (dto.opcoesSelecionadas?.length) {
      const opcoes = await this.prisma.opcaoModificador.findMany({
        where: { id: { in: dto.opcoesSelecionadas }, ativo: true },
      });
      if (opcoes.length !== dto.opcoesSelecionadas.length) {
        throw new BadRequestException('Algumas opções selecionadas são inválidas');
      }
    }

    const item = await this.prisma.carrinhoItem.create({
      data: {
        carrinhoId: carrinho.id,
        produtoId: dto.produtoId,
        quantidade: dto.quantidade ?? 1,
        observacao: dto.observacao,
        opcoesSelecionadas: dto.opcoesSelecionadas?.length
          ? { create: dto.opcoesSelecionadas.map((opcaoId) => ({ opcaoId })) }
          : undefined,
      },
      include: {
        produto: {
          select: {
            id: true,
            nome: true,
            preco: true,
            tipoDesconto: true,
            valorDesconto: true,
            imagens: { take: 1, where: { principal: true } },
          },
        },
        opcoesSelecionadas: { include: { opcao: true } },
      },
    });

    return item;
  }

  async atualizarQuantidade(slug: string, sessionId: string, itemId: string, quantidade: number) {
    const negocioId = await this.resolveNegocioId(slug);
    const carrinho = await this.obterOuCriarCarrinho(negocioId, sessionId);

    const item = await this.prisma.carrinhoItem.findFirst({
      where: { id: itemId, carrinhoId: carrinho.id },
    });
    if (!item) throw new NotFoundException('Item não encontrado no carrinho');

    if (quantidade <= 0) {
      await this.prisma.carrinhoItem.delete({ where: { id: itemId } });
      return { removido: true };
    }

    return this.prisma.carrinhoItem.update({
      where: { id: itemId },
      data: { quantidade },
      include: { produto: true, opcoesSelecionadas: { include: { opcao: true } } },
    });
  }

  async removerItem(slug: string, sessionId: string, itemId: string) {
    const negocioId = await this.resolveNegocioId(slug);
    const carrinho = await this.obterOuCriarCarrinho(negocioId, sessionId);

    const item = await this.prisma.carrinhoItem.findFirst({
      where: { id: itemId, carrinhoId: carrinho.id },
    });
    if (!item) throw new NotFoundException('Item não encontrado no carrinho');

    await this.prisma.carrinhoItem.delete({ where: { id: itemId } });
    return { removido: true };
  }
}
