import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../infra/database/prisma.service';
import { CarrinhoService } from '../carrinho/carrinho.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { CriarPedidoWhatsappDto } from './dto/criar-pedido-whatsapp.dto';
import { MetodoPagamento } from '@prisma/client';

@Injectable()
export class WhatsappService {
  constructor(
    private prisma: PrismaService,
    private carrinhoService: CarrinhoService,
    private pedidosService: PedidosService,
  ) {}

  private async resolveNegocioId(slug: string): Promise<string> {
    const negocio = await this.prisma.negocio.findUnique({
      where: { slug, ativo: true },
      select: { id: true },
    });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');
    return negocio.id;
  }

  private async obterOuCriarCliente(negocioId: string, telefone: string, nome?: string) {
    let cliente = await this.prisma.clienteWhatsApp.findUnique({
      where: { negocioId_telefone: { negocioId, telefone } },
    });

    if (!cliente) {
      cliente = await this.prisma.clienteWhatsApp.create({
        data: {
          negocioId,
          telefone,
          sessionId: uuidv4(),
          nome,
        },
      });
    } else {
      if (nome) {
        cliente = await this.prisma.clienteWhatsApp.update({
          where: { id: cliente.id },
          data: { nome, ultimaInteracao: new Date() },
        });
      } else {
        await this.prisma.clienteWhatsApp.update({
          where: { id: cliente.id },
          data: { ultimaInteracao: new Date() },
        });
      }
    }

    return cliente;
  }

  async criarPedido(slug: string, dto: CriarPedidoWhatsappDto) {
    const negocioId = await this.resolveNegocioId(slug);
    const cliente = await this.obterOuCriarCliente(negocioId, dto.telefone, dto.nome);

    for (const item of dto.itens) {
      await this.carrinhoService.adicionar(slug, cliente.sessionId, {
        produtoId: item.produtoId,
        quantidade: item.quantidade ?? 1,
        observacao: item.observacao,
        opcoesSelecionadas: item.opcoesSelecionadas,
      });
    }

    const pedido = await this.pedidosService.checkout(slug, cliente.sessionId, {
      tipoEntrega: dto.tipoEntrega ?? 'RETIRADA',
      metodoPagamento: dto.metodoPagamento ?? MetodoPagamento.PIX,
      observacao: dto.observacao,
      enderecoEntrega: dto.endereco as any,
      contato: dto.telefone,
    });

    return pedido;
  }

  async meusPedidos(slug: string, telefone: string) {
    const negocioId = await this.resolveNegocioId(slug);

    const cliente = await this.prisma.clienteWhatsApp.findUnique({
      where: { negocioId_telefone: { negocioId, telefone } },
    });

    if (!cliente) {
      return [];
    }

    await this.prisma.clienteWhatsApp.update({
      where: { id: cliente.id },
      data: { ultimaInteracao: new Date() },
    });

    return this.prisma.pedido.findMany({
      where: { negocioId, sessionId: cliente.sessionId },
      orderBy: { criadoEm: 'desc' },
      include: { itens: true, pagamentos: true },
    });
  }
}
