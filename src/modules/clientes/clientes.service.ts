import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { CriarClienteDto } from './dto/criar-cliente.dto';
import { AtualizarClienteDto } from './dto/atualizar-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  async criar(dto: CriarClienteDto) {
    const cpf = dto.cpfCnpj?.trim() || undefined;
    if (cpf) {
      const existente = await this.prisma.cliente.findUnique({
        where: { cpfCnpj: cpf },
      });
      if (existente) {
        throw new ConflictException('CPF/CNPJ já cadastrado');
      }
    }

    const { valorDebitoInicial, negocioId, dataVencimento, ...dadosCliente } = dto;

    return this.prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.create({
        data: {
          ...dadosCliente,
          cpfCnpj: cpf,
          saldoDevedor: valorDebitoInicial ?? dadosCliente.saldoDevedor ?? 0,
        },
      });

      if (valorDebitoInicial && valorDebitoInicial > 0) {
        if (!negocioId) {
          throw new BadRequestException('negocioId é obrigatório quando há dívida inicial');
        }
        await tx.contaReceber.create({
          data: {
            clienteId: cliente.id,
            negocioId,
            valorTotal: valorDebitoInicial,
            dataVencimento: dataVencimento ? new Date(dataVencimento) : new Date(),
            observacao: dadosCliente.observacao ?? 'Dívida migrada do sistema antigo',
          },
        });
      }

      return cliente;
    });
  }

  async listar(query?: { search?: string; page?: number; limit?: number; comSaldo?: boolean }) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query?.search) {
      const termo = query.search;
      where.OR = [
        { nome: { contains: termo, mode: 'insensitive' } },
        { cpfCnpj: { contains: termo } },
        { telefone: { contains: termo } },
      ];
    }

    const include = query?.comSaldo
      ? { contasReceber: { orderBy: { criadoEm: 'desc' } as const, take: 50 } }
      : undefined;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.cliente.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip,
        take: limit,
        include,
      }),
      this.prisma.cliente.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async buscarPorId(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        contasReceber: {
          orderBy: { criadoEm: 'desc' },
          take: 50,
        },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  async atualizar(id: string, dto: AtualizarClienteDto) {
    await this.buscarPorId(id);

    const cpf = dto.cpfCnpj?.trim() || undefined;
    if (cpf) {
      const existente = await this.prisma.cliente.findUnique({
        where: { cpfCnpj: cpf },
      });
      if (existente && existente.id !== id) {
        throw new ConflictException('CPF/CNPJ já cadastrado para outro cliente');
      }
    }

    return this.prisma.cliente.update({ where: { id }, data: { ...dto, cpfCnpj: cpf } });
  }

  async remover(id: string) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id } });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    if (Number(cliente.saldoDevedor) > 0) {
      throw new BadRequestException('Cliente ainda possui dívida em aberto. Receba o pagamento antes de remover.');
    }

    return this.prisma.$transaction([
      this.prisma.contaReceber.deleteMany({ where: { clienteId: id } }),
      this.prisma.cliente.delete({ where: { id } }),
    ]).then(([contas, clienteRemovido]) => ({
      removido: true,
      cliente: clienteRemovido,
      contasRemovidas: contas.count,
    }));
  }

  async recalcularSaldos() {
    const clientes = await this.prisma.cliente.findMany({ select: { id: true, nome: true } });
    let corrigidos = 0;

    for (const cliente of clientes) {
      const contas = await this.prisma.contaReceber.findMany({
        where: { clienteId: cliente.id },
      });
      const saldoCalculado = contas.reduce(
        (sum, c) => sum + (Number(c.valorTotal) - Number(c.valorPago)),
        0,
      );
      const saldoAtual = Number((await this.prisma.cliente.findUnique({ where: { id: cliente.id } }))?.saldoDevedor ?? 0);

      if (Math.abs(saldoCalculado - saldoAtual) > 0.01) {
        await this.prisma.cliente.update({
          where: { id: cliente.id },
          data: { saldoDevedor: saldoCalculado },
        });
        corrigidos++;
      }
    }

    return { total: clientes.length, corrigidos };
  }
}
