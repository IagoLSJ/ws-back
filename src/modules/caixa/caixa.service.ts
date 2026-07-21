import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { AbrirCaixaDto } from './dto/abrir-caixa.dto';
import { FecharCaixaDto } from './dto/fechar-caixa.dto';
import { MovimentoCaixaDto } from './dto/movimento-caixa.dto';
import { TipoMovimentoCaixa, RoleNegocio } from '@prisma/client';

@Injectable()
export class CaixaService {
  constructor(private prisma: PrismaService) {}

  async temCaixaAberto(negocioId: string, usuarioId?: string): Promise<boolean> {
    const where: any = { negocioId, status: 'ABERTO' };
    if (usuarioId) where.operadorId = usuarioId;
    const caixa = await this.prisma.caixa.findFirst({ where });
    return !!caixa;
  }

  async exigirCaixaAberto(negocioId: string, usuarioId?: string): Promise<void> {
    const temCaixa = await this.temCaixaAberto(negocioId, usuarioId);
    if (!temCaixa) {
      throw new BadRequestException('Nenhum caixa aberto para você. Peça ao gerente para abrir um caixa.');
    }
  }

  async abrir(negocioId: string, dto: AbrirCaixaDto, usuarioId: string) {
    return this.prisma.$transaction(async (tx) => {
      const operadorId = dto.operadorId || usuarioId;

      // Valida se o operador já tem caixa aberto
      const jaTem = await tx.caixa.findFirst({
        where: { negocioId, operadorId, status: 'ABERTO' },
      });
      if (jaTem) {
        throw new BadRequestException('Este operador já possui um caixa aberto');
      }

      // Valida se o operador é membro do negócio com role OPERADOR+
      if (operadorId !== usuarioId) {
        const membro = await tx.membroNegocio.findUnique({
          where: { usuarioId_negocioId: { usuarioId: operadorId, negocioId } },
        });
        if (!membro) {
          throw new BadRequestException('Operador não encontrado como membro deste negócio');
        }
        const hierarquia: Record<string, number> = { SUPER_ADMIN: 100, GERENTE: 80, OPERADOR: 60, VISUALIZADOR: 20 };
        if ((hierarquia[membro.role] || 0) < (hierarquia['OPERADOR'] || 0)) {
          throw new BadRequestException('Operador precisa ter role OPERADOR ou superior');
        }
      }

      const caixa = await tx.caixa.create({
        data: {
          negocioId,
          usuarioAberturaId: usuarioId,
          operadorId,
          saldoInicial: dto.saldoInicial,
          status: 'ABERTO',
          observacao: dto.observacao,
        },
      });

      await tx.caixaMovimento.create({
        data: {
          caixaId: caixa.id,
          tipo: TipoMovimentoCaixa.ABERTURA,
          valor: dto.saldoInicial,
          descricao: 'Abertura de caixa',
        },
      });

      return tx.caixa.findUnique({
        where: { id: caixa.id },
        include: {
          usuarioAbertura: { select: { id: true, nome: true, email: true } },
          operador: { select: { id: true, nome: true, email: true } },
          movimentos: { orderBy: { criadoEm: 'asc' } },
        },
      });
    });
  }

  async atual(negocioId: string, usuarioId: string) {
    const caixa = await this.prisma.caixa.findFirst({
      where: { negocioId, operadorId: usuarioId, status: 'ABERTO' },
      include: {
        usuarioAbertura: { select: { id: true, nome: true, email: true } },
        operador: { select: { id: true, nome: true, email: true } },
        movimentos: { orderBy: { criadoEm: 'desc' }, take: 50 },
      },
    });
    return caixa;
  }

  async listarAbertos(negocioId: string) {
    return this.prisma.caixa.findMany({
      where: { negocioId, status: 'ABERTO' },
      orderBy: { dataAbertura: 'desc' },
      include: {
        usuarioAbertura: { select: { id: true, nome: true } },
        operador: { select: { id: true, nome: true } },
        movimentos: { orderBy: { criadoEm: 'desc' }, take: 5 },
      },
    });
  }

  async listar(negocioId: string) {
    return this.prisma.caixa.findMany({
      where: { negocioId },
      orderBy: { dataAbertura: 'desc' },
      include: {
        usuarioAbertura: { select: { id: true, nome: true } },
        operador: { select: { id: true, nome: true } },
        usuarioFechamento: { select: { id: true, nome: true } },
      },
    });
  }

  async detalhe(negocioId: string, id: string) {
    const caixa = await this.prisma.caixa.findFirst({
      where: { id, negocioId },
      include: {
        usuarioAbertura: { select: { id: true, nome: true, email: true } },
        operador: { select: { id: true, nome: true, email: true } },
        usuarioFechamento: { select: { id: true, nome: true, email: true } },
        movimentos: { orderBy: { criadoEm: 'asc' } },
      },
    });
    if (!caixa) throw new NotFoundException('Caixa não encontrado');
    return caixa;
  }

  async fechar(negocioId: string, dto: FecharCaixaDto, usuarioId: string) {
    return this.prisma.$transaction(async (tx) => {
      const where: any = { negocioId, status: 'ABERTO' };
      if (dto.caixaId) {
        where.id = dto.caixaId;
      } else {
        where.operadorId = usuarioId;
      }

      const caixa = await tx.caixa.findFirst({ where });
      if (!caixa) throw new NotFoundException('Nenhum caixa aberto encontrado');

      const movimentos = await tx.caixaMovimento.findMany({
        where: { caixaId: caixa.id },
      });

      const totalVendas = movimentos
        .filter((m) => m.tipo === TipoMovimentoCaixa.PAGAMENTO)
        .reduce((s, m) => s + Number(m.valor), 0);

      const totalDinheiro = movimentos
        .filter((m) => m.tipo === TipoMovimentoCaixa.PAGAMENTO && m.formaPagamento === 'DINHEIRO')
        .reduce((s, m) => s + Number(m.valor), 0);

      const totalDebito = movimentos
        .filter((m) => m.tipo === TipoMovimentoCaixa.PAGAMENTO && m.formaPagamento === 'CARTAO_DEBITO')
        .reduce((s, m) => s + Number(m.valor), 0);

      const totalCredito = movimentos
        .filter((m) => m.tipo === TipoMovimentoCaixa.PAGAMENTO && m.formaPagamento === 'CARTAO_CREDITO')
        .reduce((s, m) => s + Number(m.valor), 0);

      const totalPix = movimentos
        .filter((m) => m.tipo === TipoMovimentoCaixa.PAGAMENTO && m.formaPagamento === 'PIX')
        .reduce((s, m) => s + Number(m.valor), 0);

      const totalOutros = movimentos
        .filter((m) => m.tipo === TipoMovimentoCaixa.PAGAMENTO && !['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX'].includes(m.formaPagamento ?? ''))
        .reduce((s, m) => s + Number(m.valor), 0);

      const totalSangrias = movimentos
        .filter((m) => m.tipo === TipoMovimentoCaixa.SANGRIA)
        .reduce((s, m) => s + Number(m.valor), 0);

      const totalSuprimentos = movimentos
        .filter((m) => m.tipo === TipoMovimentoCaixa.SUPRIMENTO)
        .reduce((s, m) => s + Number(m.valor), 0);

      const pedidoIdsComPagamento = movimentos
        .filter((m) => m.tipo === TipoMovimentoCaixa.PAGAMENTO && m.pedidoId)
        .map((m) => m.pedidoId!);

      const pedidosComTroco = pedidoIdsComPagamento.length
        ? await tx.pedido.findMany({
            where: { id: { in: pedidoIdsComPagamento } },
            select: { troco: true },
          })
        : [];

      const totalTroco = pedidosComTroco.reduce((s, p) => s + Number(p.troco ?? 0), 0);

      const atualizado = await tx.caixa.update({
        where: { id: caixa.id },
        data: {
          status: 'FECHADO',
          dataFechamento: new Date(),
          usuarioFechamentoId: usuarioId,
          saldoFinal: dto.saldoFinal,
          totalTroco,
          totalVendas,
          totalDinheiro,
          totalDebito,
          totalCredito,
          totalPix,
          totalOutros,
          totalSangrias,
          totalSuprimentos,
          observacao: dto.observacao || caixa.observacao,
        },
      });

      await tx.caixaMovimento.create({
        data: {
          caixaId: caixa.id,
          tipo: TipoMovimentoCaixa.FECHAMENTO,
          valor: dto.saldoFinal,
          descricao: dto.observacao || 'Fechamento de caixa',
        },
      });

      return atualizado;
    });
  }

  async movimento(negocioId: string, dto: MovimentoCaixaDto, usuarioId: string) {
    return this.prisma.$transaction(async (tx) => {
      const caixa = await tx.caixa.findFirst({
        where: { negocioId, operadorId: usuarioId, status: 'ABERTO' },
      });
      if (!caixa) throw new NotFoundException('Nenhum caixa aberto para você');

      return tx.caixaMovimento.create({
        data: {
          caixaId: caixa.id,
          tipo: dto.tipo,
          valor: dto.valor,
          descricao: dto.descricao || (dto.tipo === TipoMovimentoCaixa.SANGRIA ? 'Sangria' : 'Suprimento'),
        },
      });
    });
  }

  async registrarPagamento(
    negocioId: string,
    pedidoId: string,
    valor: number,
    formaPagamento: string,
    usuarioId?: string,
  ) {
    const where: any = { negocioId, status: 'ABERTO' };
    if (usuarioId) where.operadorId = usuarioId;

    const caixa = await this.prisma.caixa.findFirst({ where });
    if (!caixa) return;

    await this.prisma.caixaMovimento.create({
      data: {
        caixaId: caixa.id,
        tipo: TipoMovimentoCaixa.PAGAMENTO,
        valor,
        formaPagamento,
        pedidoId,
        descricao: `Venda #${pedidoId.slice(0, 8)}`,
      },
    });
  }
}
