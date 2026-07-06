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

    const [pedidos, alertas, produtos, categorias, membros] = await Promise.all([
      this.prisma.pedido.findMany({
        where: { negocioId },
        include: { pagamentos: true },
        orderBy: { criadoEm: 'desc' },
      }),
      this.prisma.estoqueItem.count({
        where: { negocioId, quantidadeAtual: { lte: 0 } },
      }),
      this.prisma.produto.count({ where: { negocioId } }),
      this.prisma.categoria.count({ where: { negocioId } }),
      this.prisma.membroNegocio.count({ where: { negocioId } }),
    ]);

    const pedidosHoje = pedidos.filter((p) => p.criadoEm >= inicioHoje);
    const pedidosSemana = pedidos.filter((p) => p.criadoEm >= inicioSemana);
    const pedidosMes = pedidos.filter((p) => p.criadoEm >= inicioMes);

    const somar = (lista: typeof pedidos) =>
      lista.filter((p) => p.status !== 'CANCELADO').reduce((acc, p) => acc + Number(p.total), 0);

    const contarPorStatus = () => {
      const map: Record<string, number> = {};
      for (const p of pedidos) {
        map[p.status] = (map[p.status] || 0) + 1;
      }
      return Object.entries(map).map(([status, count]) => ({ status, count }));
    };

    const maisVendidos = await this.prisma.pedidoItem.groupBy({
      by: ['produtoNome', 'produtoId'],
      where: { pedido: { negocioId, status: { not: 'CANCELADO' } } },
      _sum: { quantidade: true, precoUnitario: true },
      orderBy: { _sum: { quantidade: 'desc' } },
      take: 5,
    });

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

    const ultimosPedidos = pedidos.slice(0, 10).map((p) => ({
      id: p.id,
      status: p.status,
      total: Number(p.total),
      criadoEm: p.criadoEm,
      taxaFrete: p.taxaFrete ? Number(p.taxaFrete) : null,
    }));

    return {
      faturamentoHoje: somar(pedidosHoje),
      faturamentoSemana: somar(pedidosSemana),
      faturamentoMes: somar(pedidosMes),
      pedidosHoje: pedidosHoje.length,
      pedidosSemana: pedidosSemana.length,
      pedidosMes: pedidosMes.length,
      pedidosPendentes: pedidos.filter((p) => p.status === 'PENDENTE').length,
      pedidosPorStatus: contarPorStatus(),
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
      ultimosPedidos,
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
