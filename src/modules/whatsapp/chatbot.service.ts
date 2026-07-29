import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { GroqService, GroqTool, GroqToolCall } from './groq.service';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { ImprimirService } from '../imprimir/imprimir.service';
import { MetodoPagamento, ProdutoStatus, TipoMensagemWhatsApp, TipoEntrega } from '@prisma/client';

interface ContextoConversa {
  historico: { role: 'user' | 'assistant'; content: string }[];
  dadosPedido?: Record<string, unknown>;
}

const MAX_HISTORICO = 20;
const TTL = 7200;

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private groq: GroqService,
    private meta: MetaWhatsappService,
    private imprimirService: ImprimirService,
  ) {}

  async processar(
    negocioId: string,
    slug: string,
    telefone: string,
    nome: string | undefined,
    texto: string,
  ): Promise<{ telefone: string; texto: string }> {
    const cliente = await this.obterOuCriarCliente(negocioId, telefone, nome);

    if (cliente.modoHumano) {
      return { telefone, texto: '🔔 Sua mensagem foi encaminhada para nosso atendente.' };
    }

    await this.salvarMensagem(cliente.id, texto, TipoMensagemWhatsApp.CLIENTE);

    const config = await this.prisma.configuracaoNegocio.findUnique({
      where: { negocioId },
    });

    if (!config?.chatbotAtivo) {
      return { telefone, texto: config?.mensagemFallback || 'Atendimento indisponivel no momento.' };
    }

    const contexto = await this.carregarContexto(slug, telefone, cliente);
    const systemPrompt = await this.montarSystemPrompt(negocioId, slug, config);
    const tools = this.montarFerramentas(negocioId, slug);

    const groqModelo = (config as any).groqModelo;
    try {
      const resposta = await this.groq.generateResponse(
        systemPrompt,
        contexto.historico,
        texto,
        tools,
        groqModelo || undefined,
      );

      if (resposta.toolCalls.length > 0) {
        return this.processarToolCalls(resposta.toolCalls, contexto, negocioId, slug, telefone, nome, config, cliente.id);
      }

      const respostaTexto = resposta.content || 'Desculpe, nao entendi. Pode reformular?';

      contexto.historico.push({ role: 'user', content: texto });
      contexto.historico.push({ role: 'assistant', content: respostaTexto });
      this.manterLimiteHistorico(contexto);
      await this.salvarContexto(slug, telefone, contexto, cliente);

      await this.salvarMensagem(cliente.id, respostaTexto, TipoMensagemWhatsApp.BOT);
      return { telefone, texto: respostaTexto };
    } catch (err: any) {
      this.logger.error(`Erro no chatbot Groq: ${err.message}`);
      const fallback = config.mensagemFallback || 'Desculpe, ocorreu um erro. Tente novamente.';
      await this.salvarMensagem(cliente.id, fallback, TipoMensagemWhatsApp.BOT);
      return { telefone, texto: fallback };
    }
  }

  private async processarToolCalls(
    toolCalls: GroqToolCall[],
    contexto: ContextoConversa,
    negocioId: string,
    slug: string,
    telefone: string,
    nome: string | undefined,
    config: { mensagemBoasVindas?: string | null; mensagemFallback?: string | null; groqModelo?: string | null },
    clienteId: string,
  ): Promise<{ telefone: string; texto: string }> {
    let respostaFinal = '';

    for (const toolCall of toolCalls) {
      const { name, arguments: argsStr } = toolCall.function;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(argsStr); } catch { args = {}; }

      try {
        switch (name) {
          case 'listar_produtos': {
            const produtos = (await this.buscarProdutos(negocioId, args.busca as string)).map(p => ({ ...p, preco: Number(p.preco) }));
            respostaFinal += this.formatarProdutos(produtos);
            break;
          }
          case 'criar_pedido': {
            const resultado = await this.criarPedido(negocioId, slug, telefone, nome, args, clienteId);
            respostaFinal += resultado;
            break;
          }
          case 'buscar_pedido': {
            const pedidos = (await this.buscarPedidos(negocioId, slug, telefone)).map(p => ({ ...p, total: Number(p.total) }));
            respostaFinal += this.formatarPedidos(pedidos);
            break;
          }
          case 'info_negocio': {
            const info = await this.buscarInfoNegocio(negocioId);
            respostaFinal += info;
            break;
          }
          case 'horario_funcionamento': {
            const horario = await this.buscarHorario(negocioId);
            respostaFinal += horario;
            break;
          }
          case 'transferir_para_humano': {
            await this.prisma.clienteWhatsApp.update({
              where: { id: clienteId },
              data: { modoHumano: true },
            });
            respostaFinal += '⏳ Transferindo para um atendente humano.';
            break;
          }
          default:
            respostaFinal += `Ferramenta '${name}' nao reconhecida.`;
        }
      } catch (err: any) {
        this.logger.error(`Erro na ferramenta ${name}: ${err.message}`);
        respostaFinal += `Erro ao processar: ${err.message}`;
      }
    }

    if (!respostaFinal.trim()) {
      respostaFinal = config.mensagemFallback || 'Desculpe, nao consegui processar.';
    }

    contexto.historico.push({ role: 'user', content: `[ferramenta usada: ${toolCalls.map(t => t.function.name).join(', ')}]` });
    contexto.historico.push({ role: 'assistant', content: respostaFinal });
    this.manterLimiteHistorico(contexto);
    await this.salvarContexto(slug, telefone, contexto, await this.prisma.clienteWhatsApp.findUnique({ where: { id: clienteId } }));

    await this.salvarMensagem(clienteId, respostaFinal, TipoMensagemWhatsApp.BOT);
    return { telefone, texto: respostaFinal };
  }

  private async montarSystemPrompt(negocioId: string, slug: string, config: { systemPrompt?: string | null; mensagemBoasVindas?: string | null }): Promise<string> {
    const negocio = await this.prisma.negocio.findUnique({
      where: { id: negocioId },
      include: {
        categorias: { where: { ativo: true }, take: 30 },
        taxasFreteBairro: { where: { ativo: true } },
      },
    });

    const base = config.systemPrompt || '';
    const categorias = negocio?.categorias.map(c => c.nome).join(', ') || '';
    const bairros = negocio?.taxasFreteBairro.map(t => t.bairro).join(', ') || '';

    return `Voce e um atendente virtual de ${negocio?.nome || 'uma empresa'}.
Use linguagem informal e simpatia, sempre em portugues brasileiro.

${base ? `Instrucoes personalizadas: ${base}` : ''}

Informacoes do negocio:
- Nome: ${negocio?.nome || ''}
- Categorias: ${categorias}
- Bairros de entrega: ${bairros}

${config.mensagemBoasVindas ? `Mensagem de boas-vindas: ${config.mensagemBoasVindas}` : ''}

VOCE TEM ACESSO AS FERRAMENTAS abaixo. Use SEMPRE ferramentas quando necessario:
1. listar_produtos - para buscar produtos quando o cliente perguntar
2. criar_pedido - para finalizar pedido depois de coletar: produtos, modificadores, endereco, pagamento
3. buscar_pedido - para verificar status
4. info_negocio - informacoes gerais
5. horario_funcionamento - horarios
6. transferir_para_humano - quando o cliente pedir ou precisar de atendimento humano

REGRAS IMPORTANTES:
- Colete as informacoes necessarias ANTES de chamar criar_pedido (produtos, modificadores, endereco, forma de pagamento)
- Confirme com o cliente antes de finalizar
- Se o cliente digitar "cardapio" ou "cardapio", use listar_produtos
- Seja breve e direto
- Nao invente informacoes - use as ferramentas`;
  }

  private montarFerramentas(negocioId: string, slug: string): GroqTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'listar_produtos',
          description: 'Busca produtos disponiveis no cardapio. Use quando o cliente pedir o cardapio, menu, ou perguntar por produtos.',
          parameters: {
            type: 'object',
            properties: {
              busca: {
                type: 'string',
                description: 'Termo de busca opcional para filtrar produtos (ex: "hamburguer", "suco", "pizza"). Se vazio, lista todos.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'criar_pedido',
          description: 'Cria um novo pedido. Chame SOMENTE depois de coletar todas as informacoes do cliente (produtos com modificadores, endereco, forma de pagamento) e confirmar com ele.',
          parameters: {
            type: 'object',
            properties: {
              itens: {
                type: 'array',
                description: 'Lista de itens do pedido',
                items: {
                  type: 'object',
                  properties: {
                    produtoNome: { type: 'string', description: 'Nome do produto' },
                    quantidade: { type: 'number', description: 'Quantidade (padrao: 1)' },
                    modificadores: { type: 'string', description: 'Descricao dos modificadores escolhidos ex: "Borda: Catupiry, Tamanho: Grande"' },
                    observacao: { type: 'string', description: 'Observacao opcional' },
                  },
                },
              },
              metodoPagamento: { type: 'string', description: 'Forma de pagamento: DINHEIRO, CARTAO_CREDITO, CARTAO_DEBITO, PIX' },
              tipoEntrega: { type: 'string', description: 'ENTREGA ou RETIRADA' },
              endereco: { type: 'string', description: 'Endereco completo de entrega (obrigatorio se for ENTREGA)' },
              observacao: { type: 'string', description: 'Observacao geral do pedido' },
            },
            required: ['itens', 'metodoPagamento', 'tipoEntrega'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'buscar_pedido',
          description: 'Busca os pedidos recentes do cliente para mostrar o status.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'info_negocio',
          description: 'Retorna informacoes gerais sobre o negocio (descricao, contato, etc).',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'horario_funcionamento',
          description: 'Retorna os horarios de funcionamento do negocio.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'transferir_para_humano',
          description: 'Transfere o atendimento para um atendente humano. Use quando o cliente pedir explicitamente para falar com atendente, suporte, ou quando nao conseguir resolver.',
          parameters: { type: 'object', properties: {} },
        },
      },
    ];
  }

  private async buscarProdutos(negocioId: string, busca?: string) {
    const where: Record<string, unknown> = {
      negocioId,
      status: ProdutoStatus.ATIVO,
    };
    if (busca) {
      where.nome = { contains: busca, mode: 'insensitive' };
    }

    return this.prisma.produto.findMany({
      where,
      select: { id: true, nome: true, preco: true, descricao: true },
      orderBy: { ordem: 'asc' },
      take: 50,
    });
  }

  private formatarProdutos(produtos: { id: string; nome: string; preco: number; descricao?: string | null }[]): string {
    if (produtos.length === 0) return 'Nenhum produto encontrado.';

    return produtos.map((p) =>
      `• ${p.nome} - R$ ${Number(p.preco).toFixed(2)}${p.descricao ? `\n  ${p.descricao}` : ''}`
    ).join('\n');
  }

  private async criarPedido(
    negocioId: string,
    slug: string,
    telefone: string,
    nome: string | undefined,
    args: Record<string, unknown>,
    clienteId: string,
  ): Promise<string> {
    const itens = args.itens as Array<Record<string, unknown>> || [];
    const metodoPagamento = (args.metodoPagamento as string) || 'PIX';
    const tipoEntrega = (args.tipoEntrega as string) || 'ENTREGA';
    const endereco = args.endereco as string;
    const observacao = args.observacao as string;

    if (itens.length === 0) return 'Nao foi possivel criar o pedido: nenhum item informado.';

    const cliente = await this.prisma.clienteWhatsApp.findUnique({ where: { id: clienteId } });
    if (!cliente) return 'Erro: cliente nao encontrado.';

    let total = 0;
    const itensPedido: any[] = [];

    for (const item of itens) {
      const produtoNome = item.produtoNome as string;
      const quantidade = (item.quantidade as number) || 1;

      const produto = await this.prisma.produto.findFirst({
        where: {
          negocioId,
          nome: { contains: produtoNome, mode: 'insensitive' },
          status: ProdutoStatus.ATIVO,
        },
        select: { id: true, nome: true, preco: true },
      });

      if (!produto) return `Produto "${produtoNome}" nao encontrado.`;

      const preco = Number(produto.preco) * quantidade;
      total += preco;

      itensPedido.push({
        produtoId: produto.id,
        produtoNome: produto.nome,
        precoUnitario: Number(produto.preco),
        quantidade,
        modificadores: item.modificadores ? { descricao: item.modificadores } : {},
      });
    }

    const pedido = await this.prisma.pedido.create({
      data: {
        negocioId,
        sessionId: cliente.sessionId,
        status: 'CONFIRMADO',
        total,
        tipoEntrega: tipoEntrega as TipoEntrega,
        endereco: endereco ? { enderecoCompleto: endereco } : undefined,
        contato: telefone,
        observacao: observacao || undefined,
        itens: {
          create: itensPedido,
        },
        pagamentos: {
          create: {
            valor: total,
            metodo: metodoPagamento as MetodoPagamento,
            status: 'PENDENTE',
          },
        },
      },
      include: { itens: true, pagamentos: true },
    });

    this.imprimirService.imprimirComanda(negocioId, pedido.id).catch(() => {});

    return `✅ *Pedido Confirmado!* #${pedido.id.slice(0, 8).toUpperCase()}\nTotal: R$ ${total.toFixed(2)}\nPagamento: ${metodoPagamento}\n${endereco ? `Endereco: ${endereco}` : `Retirada no local`}\n\nAgradecemos a preferencia!`;
  }

  private async buscarPedidos(negocioId: string, slug: string, telefone: string) {
    const cliente = await this.prisma.clienteWhatsApp.findUnique({
      where: { negocioId_telefone: { negocioId, telefone } },
    });

    if (!cliente) return [];

    return this.prisma.pedido.findMany({
      where: { negocioId, sessionId: cliente.sessionId },
      orderBy: { criadoEm: 'desc' },
      take: 5,
      include: { itens: true, pagamentos: true },
    });
  }

  private formatarPedidos(pedidos: Array<{ id: string; status: string; total: number; criadoEm: Date; itens: Array<{ produtoNome: string }> }>): string {
    if (pedidos.length === 0) return 'Voce nao tem pedidos recentes.';

    return pedidos.map((p) =>
      `• Pedido #${p.id.slice(0, 8).toUpperCase()} - ${p.status}\n  Itens: ${p.itens.map(i => i.produtoNome).join(', ')}\n  Total: R$ ${Number(p.total).toFixed(2)}\n  Data: ${new Date(p.criadoEm).toLocaleString('pt-BR')}`
    ).join('\n\n');
  }

  private async buscarInfoNegocio(negocioId: string): Promise<string> {
    const negocio = await this.prisma.negocio.findUnique({
      where: { id: negocioId },
      select: { nome: true, descricao: true },
    });

    if (!negocio) return 'Informacoes nao disponiveis.';
    return `${negocio.nome}${negocio.descricao ? `\n${negocio.descricao}` : ''}`;
  }

  private async buscarHorario(negocioId: string): Promise<string> {
    const config = await this.prisma.configuracaoNegocio.findUnique({
      where: { negocioId },
      select: { horarioFuncionamento: true },
    });

    if (!config?.horarioFuncionamento) return 'Horario nao informado.';

    try {
      const h = config.horarioFuncionamento as Record<string, unknown>;
      return Object.entries(h)
        .map(([dia, horario]) => `${dia}: ${horario}`)
        .join('\n');
    } catch {
      return JSON.stringify(config.horarioFuncionamento);
    }
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
          sessionId: `chatbot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          nome,
          contexto: { historico: [] },
        },
      });
    } else {
      const updateData: Record<string, unknown> = { ultimaInteracao: new Date() };
      if (nome) updateData.nome = nome;
      if (!(cliente as any).contexto) updateData.contexto = { historico: [] };
      cliente = await this.prisma.clienteWhatsApp.update({
        where: { id: cliente.id },
        data: updateData as any,
      });
    }

    return cliente;
  }

  private async salvarMensagem(clienteId: string, texto: string, tipo: TipoMensagemWhatsApp) {
    await this.prisma.mensagemWhatsApp.create({
      data: { clienteId, texto, tipo },
    });
  }

  private async carregarContexto(slug: string, telefone: string, cliente: { id: string; contexto?: unknown }): Promise<ContextoConversa> {
    if (cliente.contexto && typeof cliente.contexto === 'object') {
      const ctx = cliente.contexto as ContextoConversa;
      if (ctx.historico) return ctx;
    }

    const key = `chatbot:${slug}:${telefone}`;
    const raw = await this.redis.get(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.historico) return parsed;
      } catch {}
    }

    return { historico: [] };
  }

  private async salvarContexto(slug: string, telefone: string, contexto: ContextoConversa, cliente: { id: string } | null): Promise<void> {
    const ctx = JSON.parse(JSON.stringify(contexto));

    if (cliente) {
      await this.prisma.clienteWhatsApp.update({
        where: { id: cliente.id },
        data: { contexto: ctx, ultimaInteracao: new Date() },
      }).catch(() => {});
    }

    const key = `chatbot:${slug}:${telefone}`;
    await this.redis.setex(key, TTL, JSON.stringify(ctx)).catch(() => {});
  }

  private manterLimiteHistorico(contexto: ContextoConversa): void {
    if (contexto.historico.length > MAX_HISTORICO) {
      contexto.historico = contexto.historico.slice(-MAX_HISTORICO);
    }
  }
}
