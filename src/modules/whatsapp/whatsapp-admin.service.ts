import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { TipoMensagemWhatsApp } from '@prisma/client';

@Injectable()
export class WhatsappAdminService {
  constructor(
    private prisma: PrismaService,
    private meta: MetaWhatsappService,
  ) {}

  async listarConversas(businessId: string) {
    const clientes = await this.prisma.clienteWhatsApp.findMany({
      where: { negocioId: businessId },
      orderBy: { ultimaInteracao: 'desc' },
      include: {
        mensagens: {
          orderBy: { criadoEm: 'desc' },
          take: 1,
        },
      },
    });

    return clientes.map((c) => ({
      id: c.id,
      telefone: c.telefone,
      nome: c.nome,
      modoHumano: c.modoHumano,
      ultimaInteracao: c.ultimaInteracao,
      ultimaMensagem: c.mensagens[0]?.texto || null,
    }));
  }

  async mensagens(businessId: string, clienteId: string) {
    const cliente = await this.prisma.clienteWhatsApp.findFirst({
      where: { id: clienteId, negocioId: businessId },
    });

    if (!cliente) throw new NotFoundException('Conversa não encontrada');

    const mensagens = await this.prisma.mensagemWhatsApp.findMany({
      where: { clienteId },
      orderBy: { criadoEm: 'asc' },
    });

    return { cliente, mensagens };
  }

  async enviarMensagem(businessId: string, clienteId: string, texto: string) {
    if (!texto || !texto.trim()) {
      throw new BadRequestException('Texto da mensagem é obrigatório');
    }

    const cliente = await this.prisma.clienteWhatsApp.findFirst({
      where: { id: clienteId, negocioId: businessId },
    });

    if (!cliente) throw new NotFoundException('Conversa não encontrada');

    const mensagem = await this.prisma.mensagemWhatsApp.create({
      data: {
        clienteId,
        texto: texto.trim(),
        tipo: TipoMensagemWhatsApp.ADMIN,
      },
    });

    await this.prisma.clienteWhatsApp.update({
      where: { id: clienteId },
      data: { ultimaInteracao: new Date() },
    });

    const telefone = cliente.telefone.replace(/\D/g, '');
    await this.meta.sendText(telefone, texto.trim());

    return mensagem;
  }

  async alternarModo(businessId: string, clienteId: string, modoHumano: boolean) {
    const cliente = await this.prisma.clienteWhatsApp.findFirst({
      where: { id: clienteId, negocioId: businessId },
    });

    if (!cliente) throw new NotFoundException('Conversa não encontrada');

    return this.prisma.clienteWhatsApp.update({
      where: { id: clienteId },
      data: { modoHumano },
    });
  }
}
