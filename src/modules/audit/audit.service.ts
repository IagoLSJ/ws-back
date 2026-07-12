import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async listar(negocioId: string, query?: { page?: number; limit?: number; acao?: string; usuarioId?: string }) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { negocioId };
    if (query?.acao) where.acao = { contains: query.acao, mode: 'insensitive' };
    if (query?.usuarioId) where.usuarioId = query.usuarioId;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip,
        take: limit,
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const dataComDescricao = data.map((log) => ({
      ...log,
      descricao: this.traduzirAcao(log.acao, log.entidade, log.payload as Record<string, any> | null),
    }));

    return { data: dataComDescricao, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private traduzirAcao(acao: string, entidade: string | null, payload: Record<string, any> | null): string {
    if (!acao) return 'Ação desconhecida';

    const acoesSimples: Record<string, string> = {
      LOGIN: 'Fez login no sistema',
      PASSWORD_RESET: 'Redefiniu a própria senha',
    };

    if (acoesSimples[acao]) return acoesSimples[acao];

    const [method, ...pathParts] = acao.split(' ');
    const path = pathParts.join(' ') || '';

    const metodos: Record<string, string> = {
      POST: 'Cadastrou',
      PUT: 'Atualizou',
      PATCH: 'Atualizou',
      DELETE: 'Removeu',
    };

    const verbo = metodos[method] || method;

    if (entidade) {
      const entidadeMap: Record<string, string> = {
        AuthController: 'autenticação',
        NegociosController: 'negócio',
        ProdutosController: 'produto',
        CategoriasController: 'categoria',
        MembrosController: 'membro',
        EstoqueController: 'estoque',
        PedidosAdminController: 'pedido',
        PedidosController: 'pedido',
        CarrinhoController: 'carrinho',
        DashboardController: 'dashboard',
        RelatoriosController: 'relatório',
        WhatsappController: 'WhatsApp',
        AuditController: 'auditoria',
        UsuariosController: 'usuário',
        PdvController: 'PDV',
      };
      const entidadeLabel = entidadeMap[entidade] || entidade.replace('Controller', '').toLowerCase();

      if (method === 'POST' && path.includes('/imagens')) return 'Adicionou imagem ao produto';
      if (method === 'DELETE' && path.includes('/imagens/')) return 'Removeu imagem do produto';
      if (method === 'POST' && path.includes('/logo/confirmar')) return 'Confirmou upload do logo';
      if (path.includes('/logo')) return `${method === 'POST' ? 'Solicitou' : 'Removeu'} upload do logo`;
      if (path.includes('/taxas-frete-bairro/')) {
        if (method === 'POST') return 'Adicionou taxa de frete para bairro';
        if (method === 'PATCH') return 'Atualizou taxa de frete de bairro';
        if (method === 'DELETE') return 'Removeu taxa de frete de bairro';
      }
      if (path.includes('/taxas-frete-bairro')) return 'Adicionou taxa de frete para bairro';
      if (path.includes('/configuracoes')) return 'Atualizou as configurações do negócio';
      if (path.includes('/status')) return 'Alterou status do pedido';
      if (path.includes('/movimentar')) return 'Realizou movimentação de estoque';
      if (path.includes('/membros/')) return `${verbo} membro da equipe`;
      if (path.includes('/produtos/')) return `${verbo} produto`;
      if (path.includes('/categorias/')) return `${verbo} categoria`;
      if (path.includes('/estoque/')) return `${verbo} item no estoque`;
      if (path.includes('/pedidos/')) return `${verbo} pedido`;
      if (path.includes('/carrinho/')) return `${verbo} item no carrinho`;

      return `${verbo} ${entidadeLabel}`;
    }

    return acao;
  }
}
