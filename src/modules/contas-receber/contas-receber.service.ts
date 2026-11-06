import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { FiscalService } from '../fiscal/fiscal.service';
import { ContaReceberStatus } from '@prisma/client';

@Injectable()
export class ContasReceberService {
  constructor(
    private prisma: PrismaService,
    private fiscal: FiscalService,
  ) {}

  /**
   * Vale/adiantamento avulso: conta a receber sem pedido/produto,
   * atrelada a um cliente (ex.: adiantamento de funcionário, PIX antecipado).
   */
  async criarVale(data: { clienteId: string; negocioId: string; valorTotal: number; dataVencimento: string; observacao?: string }) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: data.clienteId } });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    if (Number(cliente.saldoDevedor) + data.valorTotal > Number(cliente.limiteCredito)) {
      throw new BadRequestException(
        `Cliente não tem limite de crédito suficiente. Saldo devedor atual: R$ ${Number(cliente.saldoDevedor).toFixed(2)}, Limite: R$ ${Number(cliente.limiteCredito).toFixed(2)}`,
      );
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(data.dataVencimento);
    const status = venc < hoje ? ContaReceberStatus.ATRASADO : ContaReceberStatus.PENDENTE;

    return this.prisma.$transaction(async (tx) => {
      const conta = await tx.contaReceber.create({
        data: {
          clienteId: data.clienteId,
          negocioId: data.negocioId,
          valorTotal: data.valorTotal,
          dataVencimento: venc,
          status,
          observacao: data.observacao,
        },
        include: { cliente: { select: { id: true, nome: true, cpfCnpj: true } } },
      });

      await tx.cliente.update({
        where: { id: data.clienteId },
        data: { saldoDevedor: { increment: data.valorTotal } },
      });

      return conta;
    });
  }

  async criar(data: {
    clienteId: string;
    negocioId: string;
    pedidoId: string;
    valorTotal: number;
    dataVencimento: string;
  }) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(data.dataVencimento);
    const status = venc < hoje ? ContaReceberStatus.ATRASADO : ContaReceberStatus.PENDENTE;

    return this.prisma.contaReceber.create({
      data: {
        clienteId: data.clienteId,
        negocioId: data.negocioId,
        pedidoId: data.pedidoId,
        valorTotal: data.valorTotal,
        dataVencimento: venc,
        status,
      },
      include: { cliente: { select: { id: true, nome: true, cpfCnpj: true } } },
    });
  }

  async listar(negocioId: string, query?: { status?: string; search?: string; clienteId?: string; page?: number; limit?: number }) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { negocioId };

    if (query?.clienteId) {
      where.clienteId = query.clienteId;
    }

    if (query?.status) {
      where.status = query.status;
    } else {
      where.status = { in: ['PENDENTE', 'PARCIAL', 'ATRASADO'] };
    }

    if (query?.search) {
      where.cliente = {
        OR: [
          { nome: { contains: query.search, mode: 'insensitive' } },
          { cpfCnpj: { contains: query.search } },
        ],
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contaReceber.findMany({
        where,
        orderBy: [{ status: 'asc' }, { dataVencimento: 'asc' }],
        skip,
        take: limit,
        include: {
          cliente: { select: { id: true, nome: true, cpfCnpj: true } },
        },
      }),
      this.prisma.contaReceber.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async darBaixa(negocioId: string, id: string, dto: { valor?: number; observacao?: string }) {
    const conta = await this.prisma.contaReceber.findFirst({
      where: { id, negocioId },
    });
    if (!conta) throw new NotFoundException('Conta a receber não encontrada');

    if (conta.status === 'PAGO') {
      throw new BadRequestException('Conta já está paga');
    }

    const valorBaixa = dto.valor ?? Number(conta.valorTotal);
    const novoValorPago = Number(conta.valorPago) + valorBaixa;
    const valorTotal = Number(conta.valorTotal);

    const novoStatus =
      novoValorPago >= valorTotal
        ? ContaReceberStatus.PAGO
        : ContaReceberStatus.PARCIAL;

    return this.prisma.$transaction([
      this.prisma.contaReceber.update({
        where: { id },
        data: {
          valorPago: novoValorPago,
          status: novoStatus,
          dataPagamento: new Date(),
          observacao: dto.observacao,
        },
      }),
      this.prisma.cliente.update({
        where: { id: conta.clienteId },
        data: { saldoDevedor: { decrement: valorBaixa } },
      }),
    ]).then(async ([contaAtualizada]) => {
      // Pós-commit: conciliação financeira (ECONF 110750) da SEFAZ — fire-and-forget,
      // falha não desfaz a baixa; o endpoint manual de ECONF cobre o retry.
      void this.fiscal.enfileirarEconf(negocioId, contaAtualizada.id, valorBaixa, new Date()).catch(() => undefined);
      return this.prisma.contaReceber.findUnique({
        where: { id: contaAtualizada.id },
        include: {
          cliente: { select: { id: true, nome: true, cpfCnpj: true } },
        },
      });
    });
  }

  async atualizar(
    negocioId: string,
    id: string,
    dto: { valorTotal?: number; dataVencimento?: string; observacao?: string },
  ) {
    const conta = await this.prisma.contaReceber.findFirst({
      where: { id, negocioId },
    });
    if (!conta) throw new NotFoundException('Conta a receber não encontrada');

    const valorAtual = Number(conta.valorTotal);
    const novoValor = dto.valorTotal !== undefined ? dto.valorTotal : valorAtual;
    const venc = dto.dataVencimento ? new Date(dto.dataVencimento) : conta.dataVencimento;

    const valorPago = Number(conta.valorPago);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let status = conta.status;
    if (valorPago >= novoValor) {
      status = ContaReceberStatus.PAGO;
    } else if (venc < hoje) {
      status = ContaReceberStatus.ATRASADO;
    } else if (valorPago > 0) {
      status = ContaReceberStatus.PARCIAL;
    } else {
      status = ContaReceberStatus.PENDENTE;
    }

    const data: any = { status };
    if (dto.valorTotal !== undefined) data.valorTotal = dto.valorTotal;
    if (dto.dataVencimento) data.dataVencimento = venc;
    if (dto.observacao !== undefined) data.observacao = dto.observacao;

    // Ajusta o saldoDevedor do cliente pela diferença do valor total
    const saldoNovo = dto.valorTotal !== undefined ? novoValor - valorAtual : 0;

    return this.prisma.$transaction([
      this.prisma.contaReceber.update({ where: { id }, data }),
      ...(saldoNovo !== 0
        ? [this.prisma.cliente.update({
            where: { id: conta.clienteId },
            data: { saldoDevedor: { increment: saldoNovo } },
          })]
        : []),
    ]).then(([contaAtualizada]) => {
      return this.prisma.contaReceber.findUnique({
        where: { id: contaAtualizada.id },
        include: {
          cliente: { select: { id: true, nome: true, cpfCnpj: true } },
        },
      });
    });
  }

  async buscarPorId(negocioId: string, id: string) {
    const conta = await this.prisma.contaReceber.findFirst({
      where: { id, negocioId },
      include: {
        cliente: { select: { id: true, nome: true, cpfCnpj: true } },
        pedido: {
          select: {
            id: true,
            total: true,
            criadoEm: true,
            observacao: true,
            itens: {
              select: {
                produtoNome: true,
                quantidade: true,
                precoUnitario: true,
                modificadores: true,
              },
            },
          },
        },
      },
    });
    if (!conta) throw new NotFoundException('Conta a receber não encontrada');
    return conta;
  }

  async darBaixaCliente(negocioId: string, clienteId: string, dto: { valor?: number; observacao?: string }) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    const saldoAtual = Number(cliente.saldoDevedor);
    const valorBaixa = dto.valor ?? saldoAtual;
    if (valorBaixa <= 0) throw new BadRequestException('Valor deve ser maior que zero');
    if (valorBaixa > saldoAtual) throw new BadRequestException(`Valor excede o saldo devedor (${saldoAtual.toFixed(2)})`);

    const contasPendentes = await this.prisma.contaReceber.findMany({
      where: { clienteId, status: { in: ['PENDENTE', 'PARCIAL', 'ATRASADO'] } },
      orderBy: { dataVencimento: 'asc' },
    });

    let restante = valorBaixa;

    for (const conta of contasPendentes) {
      if (restante <= 0) break;
      const saldoConta = Number(conta.valorTotal) - Number(conta.valorPago);
      const abater = Math.min(restante, saldoConta);
      const novoPago = Number(conta.valorPago) + abater;
      const novoStatus = novoPago >= Number(conta.valorTotal) ? ContaReceberStatus.PAGO : ContaReceberStatus.PARCIAL;

      await this.prisma.contaReceber.update({
        where: { id: conta.id },
        data: { valorPago: novoPago, status: novoStatus, dataPagamento: new Date(), observacao: dto.observacao },
      });
      void this.fiscal.enfileirarEconf(negocioId, conta.id, abater, new Date()).catch(() => undefined);
      restante -= abater;
    }

    const valorAbatido = valorBaixa - restante;
    const novoSaldo = saldoAtual - valorAbatido;

    await this.prisma.cliente.update({
      where: { id: clienteId },
      data: { saldoDevedor: novoSaldo },
    });

    const clienteAtualizado = await this.prisma.cliente.findUnique({ where: { id: clienteId } });

    return {
      cliente: { id: clienteAtualizado!.id, nome: clienteAtualizado!.nome, cpfCnpj: clienteAtualizado!.cpfCnpj },
      valorAbatido,
      saldoAnterior: saldoAtual,
      saldoAtual: Number(clienteAtualizado!.saldoDevedor),
    };
  }
}
