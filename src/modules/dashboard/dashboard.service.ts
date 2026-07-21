import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async resumo(negocioId: string) {
    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const inicioSemana = new Date(inicioHoje);
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

    const [
      faturamentoHoje,
      faturamentoSemana,
      faturamentoMes,
      pedidosHoje,
      pedidosPendentes,
      pedidosPorStatus,
      maisVendidos,
      ultimosPedidos,
      alertas,
      produtos,
      categorias,
      membros,
    ] = await Promise.all([
      // Faturamento hoje: soma dos pedidos não cancelados de hoje
      this.prisma.pedido.aggregate({
        where: { negocioId, criadoEm: { gte: inicioHoje }, status: { not: 'CANCELADO' } },
        _sum: { total: true },
      }).then(r => Number(r._sum.total ?? 0)),

      // Faturamento semana
      this.prisma.pedido.aggregate({
        where: { negocioId, criadoEm: { gte: inicioSemana }, status: { not: 'CANCELADO' } },
        _sum: { total: true },
      }).then(r => Number(r._sum.total ?? 0)),

      // Faturamento mês
      this.prisma.pedido.aggregate({
        where: { negocioId, criadoEm: { gte: inicioMes }, status: { not: 'CANCELADO' } },
        _sum: { total: true },
      }).then(r => Number(r._sum.total ?? 0)),

      // Total pedidos hoje
      this.prisma.pedido.count({ where: { negocioId, criadoEm: { gte: inicioHoje } } }),

      // Pedidos pendentes
      this.prisma.pedido.count({ where: { negocioId, status: 'PENDENTE' } }),

      // Pedidos por status (agregação)
      this.prisma.pedido.groupBy({
        by: ['status'],
        where: { negocioId },
        _count: { status: true },
      }).then(rows => rows.map(r => ({ status: r.status, count: r._count.status }))),

      // Mais vendidos (top 5)
      this.prisma.pedidoItem.groupBy({
        by: ['produtoNome', 'produtoId'],
        where: { pedido: { negocioId, status: { not: 'CANCELADO' } } },
        _sum: { quantidade: true, precoUnitario: true },
        orderBy: { _sum: { quantidade: 'desc' } },
        take: 5,
      }),

      // Últimos 10 pedidos
      this.prisma.pedido.findMany({
        where: { negocioId },
        orderBy: { criadoEm: 'desc' },
        take: 10,
        select: { id: true, status: true, total: true, criadoEm: true, taxaFrete: true },
      }),

      // Alertas de estoque
      this.prisma.estoqueItem.count({
        where: { negocioId, quantidadeAtual: { lte: 0 } },
      }),

      // Total produtos
      this.prisma.produto.count({ where: { negocioId } }),

      // Total categorias
      this.prisma.categoria.count({ where: { negocioId } }),

      // Total membros
      this.prisma.membroNegocio.count({ where: { negocioId } }),
    ]);

    // Receita por produto mais vendido
    const receitaMap = new Map<string, number>();
    if (maisVendidos.length) {
      const ids = maisVendidos.map((m) => m.produtoId);
      const receitas: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT "produtoId", SUM("precoUnitario" * "quantidade") as "receita"
         FROM "pedido_itens"
         WHERE "produtoId" = ANY($1)
           AND "pedidoId" IN (SELECT id FROM "pedidos" WHERE "negocioId" = $2 AND "status" != 'CANCELADO')
         GROUP BY "produtoId"`,
        ids,
        negocioId,
      );
      for (const r of receitas) {
        receitaMap.set(r.produtoId, Number(r.receita));
      }
    }

    return {
      faturamentoHoje,
      faturamentoSemana,
      faturamentoMes,
      pedidosHoje,
      pedidosPendentes,
      pedidosPorStatus,
      maisVendidos: maisVendidos.map((m) => ({
        produtoNome: m.produtoNome,
        produtoId: m.produtoId,
        totalVendido: m._sum.quantidade ?? 0,
        receita: receitaMap.get(m.produtoId!) ?? 0,
      })),
      totalProdutos: produtos,
      totalCategorias: categorias,
      totalMembros: membros,
      alertasCount: alertas,
      ultimosPedidos: ultimosPedidos.map((p) => ({
        id: p.id,
        status: p.status,
        total: Number(p.total),
        criadoEm: p.criadoEm,
        taxaFrete: p.taxaFrete ? Number(p.taxaFrete) : null,
      })),
    };
  }

  async faturamentoDiario(negocioId: string, dias: number = 7) {
    const dataFim = new Date();
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - dias + 1);
    dataInicio.setHours(0, 0, 0, 0);

    const pedidos = await this.prisma.pedido.findMany({
      where: {
        negocioId,
        criadoEm: { gte: dataInicio },
        status: { not: 'CANCELADO' },
      },
      select: { criadoEm: true, total: true },
      orderBy: { criadoEm: 'asc' },
    });

    const diasLabels: string[] = [];
    const diasFaturamento: number[] = [];
    const diasPedidos: number[] = [];

    for (let i = 0; i < dias; i++) {
      const d = new Date(dataInicio);
      d.setDate(d.getDate() + i);
      diasLabels.push(d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }));

      const fimDia = new Date(d);
      fimDia.setHours(23, 59, 59, 999);

      const doDia = pedidos.filter((p) => p.criadoEm >= d && p.criadoEm <= fimDia);
      diasFaturamento.push(doDia.reduce((acc, p) => acc + Number(p.total), 0));
      diasPedidos.push(doDia.length);
    }

    return { labels: diasLabels, faturamento: diasFaturamento, pedidos: diasPedidos };
  }
}
