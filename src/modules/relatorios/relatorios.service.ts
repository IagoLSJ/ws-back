import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { Response } from 'express';

@Injectable()
export class RelatoriosService {
  constructor(private prisma: PrismaService) {}

  async inventario(negocioId: string, res: Response) {
    const itens = await this.prisma.estoqueItem.findMany({
      where: { negocioId },
      include: {
        produto: { select: { id: true, nome: true, sku: true, status: true, preco: true } },
      },
      orderBy: { atualizadoEm: 'desc' },
    });

    const movimentacoes = await this.prisma.movimentacaoEstoque.findMany({
      where: { negocioId },
      orderBy: { criadoEm: 'desc' },
      take: 1000,
      include: {
        estoqueItem: { include: { produto: { select: { nome: true } } } },
        usuario: { select: { nome: true } },
      },
    });

    const csv = this.gerarCSVInventario(itens, movimentacoes);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="inventario-${negocioId}-${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  }

  async vendasCSV(negocioId: string, res: Response, dataInicio?: string, dataFim?: string) {
    const where: any = { pedido: { negocioId } };
    if (dataInicio || dataFim) {
      where.pedido.criadoEm = {};
      if (dataInicio) where.pedido.criadoEm.gte = new Date(dataInicio);
      if (dataFim) where.pedido.criadoEm.lte = new Date(dataFim + 'T23:59:59.999Z');
    }

    const itens = await this.prisma.pedidoItem.findMany({
      where,
      include: { pedido: { select: { criadoEm: true, status: true, total: true } } },
      orderBy: { pedido: { criadoEm: 'desc' } },
    });

    const headers = ['Data', 'Pedido', 'Status', 'Produto', 'Quantidade', 'Preço Unit.', 'Total'];
    const rows = itens.map((i) => [
      i.pedido.criadoEm.toISOString(),
      i.pedidoId,
      i.pedido.status,
      i.produtoNome,
      i.quantidade.toString(),
      Number(i.precoUnitario).toFixed(2),
      (Number(i.precoUnitario) * i.quantidade).toFixed(2),
    ]);

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vendas-${negocioId}-${Date.now()}.csv"`);
    res.send('\uFEFF' + lines.join('\n'));
  }

  async financeiroCSV(negocioId: string, res: Response, dataInicio?: string, dataFim?: string) {
    const where: any = { negocioId };
    if (dataInicio || dataFim) {
      where.criadoEm = {};
      if (dataInicio) where.criadoEm.gte = new Date(dataInicio);
      if (dataFim) where.criadoEm.lte = new Date(dataFim + 'T23:59:59.999Z');
    }

    const pedidos = await this.prisma.pedido.findMany({
      where,
      include: { pagamentos: true },
      orderBy: { criadoEm: 'desc' },
    });

    const headers = ['Data', 'Pedido', 'Status', 'Total', 'Forma Pagamento', 'Status Pagamento', 'Taxa Frete'];
    const rows = pedidos.flatMap((p) => {
      const pagamentos = p.pagamentos.length
        ? p.pagamentos
        : [{ metodo: '-', status: '-', valor: 0 }];
      return pagamentos.map((pg) => [
        p.criadoEm.toISOString(),
        p.id,
        p.status,
        Number(p.total).toFixed(2),
        pg.metodo,
        pg.status,
        p.taxaFrete ? Number(p.taxaFrete).toFixed(2) : '0',
      ]);
    });

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="financeiro-${negocioId}-${Date.now()}.csv"`);
    res.send('\uFEFF' + lines.join('\n'));
  }

  async pedidosCSV(negocioId: string, res: Response, dataInicio?: string, dataFim?: string, status?: string) {
    const where: any = { negocioId };
    if (dataInicio || dataFim) {
      where.criadoEm = {};
      if (dataInicio) where.criadoEm.gte = new Date(dataInicio);
      if (dataFim) where.criadoEm.lte = new Date(dataFim + 'T23:59:59.999Z');
    }
    if (status) where.status = status;

    const pedidos = await this.prisma.pedido.findMany({
      where,
      include: {
        itens: true,
        pagamentos: { select: { metodo: true, valor: true, status: true } },
      },
      orderBy: { criadoEm: 'desc' },
    });

    const headers = ['Data', 'Pedido', 'Status', 'Total Itens', 'Total', 'Forma Pagamento', 'Tipo Entrega', 'Contato'];
    const rows = pedidos.map((p) => [
      p.criadoEm.toISOString(),
      p.id,
      p.status,
      p.itens.reduce((s, i) => s + i.quantidade, 0).toString(),
      Number(p.total).toFixed(2),
      p.pagamentos.map((pg) => pg.metodo).join('; '),
      p.tipoEntrega || '-',
      p.contato || '-',
    ]);

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pedidos-${negocioId}-${Date.now()}.csv"`);
    res.send('\uFEFF' + lines.join('\n'));
  }

  async estoqueResumido(negocioId: string, res: Response) {
    const itens = await this.prisma.estoqueItem.findMany({
      where: { negocioId },
      include: { produto: { select: { nome: true, status: true, preco: true } } },
      orderBy: { quantidadeAtual: 'asc' },
    });

    const headers = ['Produto', 'Status', 'Qtd Atual', 'Estoque Mínimo', 'Unidade', 'Situação', 'Valor Estimado'];
    const rows = itens.map((item) => {
      const situacao = item.quantidadeAtual <= 0 ? 'ZERADO' : item.quantidadeAtual <= item.estoqueMinimo ? 'CRÍTICO' : 'OK';
      return [
        item.produto?.nome || item.nome || 'Sem nome',
        item.produto?.status || 'AVULSO',
        item.quantidadeAtual.toString(),
        item.estoqueMinimo.toString(),
        item.unidade,
        situacao,
        item.produto?.preco ? (Number(item.produto.preco) * item.quantidadeAtual).toFixed(2) : '0',
      ];
    });

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="estoque-resumo-${negocioId}-${Date.now()}.csv"`);
    res.send('\uFEFF' + lines.join('\n'));
  }

  async resumoFinanceiro(negocioId: string, dataInicio?: string, dataFim?: string) {
    const where: any = { negocioId, status: { not: 'CANCELADO' } };
    if (dataInicio || dataFim) {
      where.criadoEm = {};
      if (dataInicio) where.criadoEm.gte = new Date(dataInicio);
      if (dataFim) where.criadoEm.lte = new Date(dataFim + 'T23:59:59.999Z');
    }

    const pedidos = await this.prisma.pedido.findMany({
      where,
      include: { pagamentos: true },
    });

    const totalFaturamento = pedidos.reduce((acc, p) => acc + Number(p.total), 0);
    const totalPedidos = pedidos.length;
    const ticketMedio = totalPedidos > 0 ? totalFaturamento / totalPedidos : 0;

    const porMetodo: Record<string, number> = {};
    for (const p of pedidos) {
      for (const pg of p.pagamentos) {
        porMetodo[pg.metodo] = (porMetodo[pg.metodo] || 0) + Number(pg.valor);
      }
    }

    return {
      totalFaturamento,
      totalPedidos,
      ticketMedio,
      porMetodoPagamento: Object.entries(porMetodo).map(([metodo, valor]) => ({ metodo, valor })),
    };
  }

  private gerarCSVInventario(itens: any[], movimentacoes: any[]): string {
    const headers1 = ['Produto ID', 'SKU', 'Nome', 'Status', 'Preço', 'Quantidade Atual', 'Estoque Mínimo', 'Unidade', 'Última Atualização'];
    const rows1 = itens.map((item) => [
      item.produto?.id || item.id,
      item.produto?.sku || item.sku || '',
      item.produto?.nome || item.nome || 'Sem nome',
      item.produto?.status || 'AVULSO',
      item.produto?.preco?.toString() || '0',
      item.quantidadeAtual.toString(),
      item.estoqueMinimo.toString(),
      item.unidade,
      item.atualizadoEm.toISOString(),
    ]);

    const headers2 = ['Data', 'Tipo', 'Produto', 'Quantidade', 'Quantidade Antes', 'Quantidade Depois', 'Responsável', 'Motivo', 'Referência'];
    const rows2 = movimentacoes.map((mov) => [
      mov.criadoEm.toISOString(),
      mov.tipo,
      mov.estoqueItem?.produto?.nome || '',
      mov.quantidade.toString(),
      mov.quantidadeAntes.toString(),
      mov.quantidadeApos.toString(),
      mov.usuario?.nome || '',
      mov.motivo || '',
      mov.referencia || '',
    ]);

    const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const lines = [
      headers1.map(escape).join(','),
      ...rows1.map((r) => r.map(escape).join(',')),
      '',
      'HISTÓRICO DE MOVIMENTAÇÕES (últimas 1000)',
      '',
      headers2.map(escape).join(','),
      ...rows2.map((r) => r.map(escape).join(',')),
    ];
    return lines.join('\n');
  }
}
