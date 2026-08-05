import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { GeminiService } from './gemini.service';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { calcularTaxaCartao } from '../../common/utils/taxa-cartao';
import { ImprimirService } from '../imprimir/imprimir.service';
import { MetodoPagamento, ProdutoStatus, TipoMensagemWhatsApp, TipoEntrega } from '@prisma/client';

interface ItemRascunho {
  produtoNome: string;
  quantidade: number;
  modificadores?: string;
  observacao?: string;
  produtoId?: string;
  precoUnitario?: number;
}

interface PedidoRascunho {
  itens: ItemRascunho[];
  endereco?: string;
  pagamento?: string;
  tipoEntrega?: string;
  observacao?: string;
}

interface ContextoConversa {
  historico: { role: 'user' | 'assistant'; content: string }[];
  estado?: string;
  pedidoRascunho?: PedidoRascunho | null;
}

interface RespostaIa {
  resposta: string;
  acao: string;
  intencao: string;
  dadosExtraidos: Record<string, unknown>;
  faltando: string[];
}

interface ConfigChatbot {
  mensagemBoasVindas?: string | null;
  mensagemFallback?: string | null;
  systemPrompt?: string | null;
  modeloIa?: string | null;
  cardapioImagens?: unknown;
}

const MAX_HISTORICO = 20;
const TTL = 7200;

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private gemini: GeminiService,
    private meta: MetaWhatsappService,
    private imprimirService: ImprimirService,
  ) {}

  async processar(
    negocioId: string,
    slug: string,
    telefone: string,
    nome: string | undefined,
    texto: string,
  ): Promise<{ telefone: string; texto: string; imagens?: string[] }> {
    this.logger.log(`========== [CHAT] INICIO ==========`);
    this.logger.log(`[CHAT] negocioId=${negocioId} slug=${slug} telefone=${telefone} nome=${nome || '(sem nome)'}`);
    this.logger.log(`[CHAT] mensagem recebida: "${texto}"`);

    const cliente = await this.obterOuCriarCliente(negocioId, telefone, nome);
    this.logger.log(`[CHAT] cliente id=${cliente.id} modoHumano=${cliente.modoHumano}`);

    if (cliente.modoHumano) {
      this.logger.log(`[CHAT] cliente em modo humano - nao processa com IA`);
      return { telefone, texto: '🔔 Sua mensagem foi encaminhada para nosso atendente.' };
    }

    await this.salvarMensagem(cliente.id, texto, TipoMensagemWhatsApp.CLIENTE);
    this.logger.log(`[CHAT] mensagem do cliente salva no banco`);

    const config = await this.prisma.configuracaoNegocio.findUnique({
      where: { negocioId },
    });
    this.logger.log(`[CHAT] config chatbotAtivo=${config?.chatbotAtivo} modeloIa=${(config as any)?.modeloIa || 'padrao'}`);

    if (!config?.chatbotAtivo) {
      this.logger.warn(`[CHAT] chatbot desativado para negocio ${negocioId}`);
      return { telefone, texto: config?.mensagemFallback || 'Atendimento indisponivel no momento.' };
    }

    const configChat: ConfigChatbot = config as ConfigChatbot;
    const modeloIa = configChat.modeloIa;

    try {
      const resultado = await this.comLock(`${slug}:${telefone}`, async () => {
        const contexto = await this.carregarContexto(slug, telefone, cliente);
        this.logger.log(`[CHAT] contexto carregado - historico com ${contexto.historico.length} mensagens | estado=${contexto.estado || 'INICIAL'}`);

        const systemPrompt = await this.montarSystemPrompt(negocioId, configChat, contexto);

        this.logger.log(`[GEMINI] chamando API com ${contexto.historico.length + 1} mensagens no historico`);
        const inicio = Date.now();
        const resposta = await this.gemini.generateResponse(
          systemPrompt,
          contexto.historico,
          texto,
          modeloIa || undefined,
        );
        this.logger.log(`[GEMINI] resposta em ${Date.now() - inicio}ms | tokens=${resposta.tokens}`);
        this.logger.log(`[GEMINI] content=${JSON.stringify(resposta.content)}`);

        const parsed = this.parseRespostaJson(resposta.content);
        this.logger.log(`[CHAT] intencao=${parsed.intencao} | acao=${parsed.acao} | dados=${JSON.stringify(parsed.dadosExtraidos)} | faltando=${JSON.stringify(parsed.faltando)}`);

        const resultado = await this.executarAcao(parsed, contexto, negocioId, slug, telefone, nome, configChat, cliente);
        this.logger.log(`[CHAT] resposta final: "${resultado.texto}" | imagens=${resultado.imagens?.length || 0}`);

        contexto.historico.push({ role: 'user', content: texto });
        contexto.historico.push({ role: 'assistant', content: resultado.texto });
        this.manterLimiteHistorico(contexto);
        await this.salvarContexto(slug, telefone, contexto, cliente);
        this.logger.log(`[CHAT] contexto salvo - estado=${contexto.estado || 'INICIAL'} | historico=${contexto.historico.length}`);

        await this.salvarMensagem(cliente.id, resultado.texto, TipoMensagemWhatsApp.BOT);
        this.logger.log(`[CHAT] resposta do bot salva no banco`);
        return resultado;
      });

      this.logger.log(`========== [CHAT] FIM ==========`);
      return { telefone, texto: resultado.texto, ...(resultado.imagens?.length ? { imagens: resultado.imagens } : {}) };
    } catch (err: any) {
      this.logger.error(`[CHAT] ERRO no chatbot Gemini: ${err.message}`);
      this.logger.error(`[CHAT] stack: ${err.stack}`);
      const fallback = configChat.mensagemFallback || 'Desculpe, ocorreu um erro. Tente novamente.';
      await this.salvarMensagem(cliente.id, fallback, TipoMensagemWhatsApp.BOT);
      this.logger.log(`[CHAT] fallback enviado: "${fallback}"`);
      this.logger.log(`========== [CHAT] FIM (erro) ==========`);
      return { telefone, texto: fallback };
    }
  }

  /**
   * Serializa o processamento por conversa: se outra mensagem do mesmo cliente
   * estiver sendo processada, aguarda (fila FIFO) até liberar. Conversas
   * diferentes continuam em paralelo.
   */
  private async comLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = `chatbot:lock:${key}`;
    const prazo = Date.now() + 30000;

    while (Date.now() < prazo) {
      const adquirido = await this.redis.set(lockKey, '1', 45, true).catch(() => true);
      if (adquirido) {
        try {
          return await fn();
        } finally {
          await this.redis.del(lockKey).catch(() => {});
        }
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    this.logger.warn(`[CHAT] lock nao adquirido em tempo (${key}) - processando sem serializacao`);
    return fn();
  }

  private parseRespostaJson(content: string | null): RespostaIa {
    const fallback: RespostaIa = {
      resposta: content || 'Desculpe, não entendi. Pode reformular?',
      acao: 'responder',
      intencao: '',
      dadosExtraidos: {},
      faltando: [],
    };
    if (!content) return fallback;

    let limpo = content.trim();
    limpo = limpo.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    try {
      const parsed = JSON.parse(limpo);
      return {
        resposta: typeof parsed.resposta === 'string' ? parsed.resposta : '',
        acao: typeof parsed.acao === 'string' ? parsed.acao : 'responder',
        intencao: typeof parsed.intencao === 'string' ? parsed.intencao : '',
        dadosExtraidos: (parsed.dadosExtraidos && typeof parsed.dadosExtraidos === 'object' ? parsed.dadosExtraidos : {}),
        faltando: Array.isArray(parsed.faltando) ? parsed.faltando.map(String) : [],
      };
    } catch {
      this.logger.warn('[CHAT] JSON invalido do LLM - tratando como resposta direta');
      return fallback;
    }
  }

  private async executarAcao(
    parsed: RespostaIa,
    contexto: ContextoConversa,
    negocioId: string,
    slug: string,
    telefone: string,
    nome: string | undefined,
    config: ConfigChatbot,
    cliente: { id: string; sessionId: string },
  ): Promise<{ texto: string; imagens?: string[] }> {
    const acao = parsed.acao || 'responder';
    let texto = '';
    let imagens: string[] = [];

    switch (acao) {
      case 'mostrar_cardapio': {
        const cardapioImagens = Array.isArray(config.cardapioImagens) ? (config.cardapioImagens as string[]) : [];
        if (cardapioImagens.length > 0) {
          imagens = [...cardapioImagens];
          texto = parsed.resposta || 'Aqui está o nosso cardápio! 😋';
        } else {
          const produtos = await this.buscarProdutos(negocioId);
          texto = 'Claro! Aqui está nosso cardápio:\n\n' + this.formatarProdutos(this.normalizarProdutos(produtos));
        }
        break;
      }
      case 'listar_produtos': {
        const busca = typeof parsed.dadosExtraidos.busca === 'string' ? parsed.dadosExtraidos.busca : undefined;
        const produtos = await this.buscarProdutos(negocioId, busca);
        texto = this.formatarProdutos(this.normalizarProdutos(produtos));
        break;
      }
      case 'consultar_status': {
        const pedidos = await this.buscarPedidos(negocioId, slug, telefone);
        texto = this.formatarPedidos(pedidos.map(p => ({ ...p, total: Number(p.total) })));
        break;
      }
      case 'info_negocio': {
        const info = await this.buscarInfoNegocio(negocioId);
        texto = info;
        break;
      }
      case 'horario_funcionamento': {
        const horario = await this.buscarHorario(negocioId);
        texto = horario;
        break;
      }
      case 'chamar_humano': {
        await this.prisma.clienteWhatsApp.update({
          where: { id: cliente.id },
          data: { modoHumano: true },
        });
        this.logger.log(`[CHAT] transferido para humano (cliente ${cliente.id})`);
        texto = '⏳ Transferindo para um atendente humano.';
        break;
      }
      case 'confirmar_pedido': {
        const resultado = await this.confirmarPedido(parsed, contexto, negocioId);
        contexto.estado = resultado.estado;
        texto = resultado.texto;
        break;
      }
      case 'criar_pedido': {
        const resultado = await this.criarPedidoConfirmado(contexto, negocioId, slug, telefone, nome, cliente);
        texto = resultado.texto;
        if (resultado.sucesso) {
          contexto.pedidoRascunho = null;
          contexto.estado = 'INICIAL';
        }
        break;
      }
      case 'perguntar':
      case 'responder':
      default: {
        texto = parsed.resposta || config.mensagemFallback || 'Desculpe, não entendi. Pode reformular?';
        break;
      }
    }

    return { texto, ...(imagens.length ? { imagens } : {}) };
  }

  private async confirmarPedido(
    parsed: RespostaIa,
    contexto: ContextoConversa,
    negocioId: string,
  ): Promise<{ texto: string; estado: string }> {
    const dados = parsed.dadosExtraidos;
    const itensBrutos = Array.isArray(dados.itens) ? dados.itens as Array<Record<string, unknown>> : [];

    if (itensBrutos.length === 0 && (!contexto.pedidoRascunho || !contexto.pedidoRascunho.itens.length)) {
      return {
        texto: parsed.resposta || 'Me diz o que você quer pedir, que eu anoto! 😄',
        estado: 'COLETANDO',
      };
    }

    const validacao = await this.validarItensPedido(negocioId, itensBrutos.length ? itensBrutos : (contexto.pedidoRascunho?.itens as unknown as Array<Record<string, unknown>>));

    if (validacao.pendente) {
      const sugestoes = await this.buscarProdutos(negocioId, validacao.pendente);
      if (sugestoes.length > 0) {
        const nomes = sugestoes.map(s => s.nome).join(', ');
        return {
          texto: `Não achei exatamente "${validacao.pendente}", mas temos: ${nomes}. Qual desses você quer?`,
          estado: contexto.estado || 'COLETANDO',
        };
      }
      return {
        texto: `Hmm, não temos "${validacao.pendente}" no momento 😕 Quer ver o cardápio? Posso te mostrar!`,
        estado: contexto.estado || 'COLETANDO',
      };
    }

    const endereco = typeof dados.endereco === 'string' && dados.endereco.trim() ? dados.endereco : undefined;
    const pagamento = typeof dados.pagamento === 'string' && dados.pagamento.trim() ? dados.pagamento.toUpperCase() : undefined;
    const tipoEntrega = typeof dados.tipoEntrega === 'string' && dados.tipoEntrega.trim() ? dados.tipoEntrega.toUpperCase() : undefined;
    const observacao = typeof dados.observacao === 'string' && dados.observacao.trim() ? dados.observacao : undefined;

    contexto.pedidoRascunho = {
      itens: validacao.itens,
      endereco,
      pagamento,
      tipoEntrega,
      observacao,
    };

    const faixasCartao = await this.carregarFaixasCartao(negocioId);
    const resumo = this.resumirPedido(contexto.pedidoRascunho, faixasCartao);
    return {
      texto: `📋 *Confirma seu pedido?*\n\n${resumo}\n\nÉ isso mesmo?`,
      estado: 'CONFIRMAR',
    };
  }

  private async validarItensPedido(
    negocioId: string,
    itens: Array<Record<string, unknown>>,
  ): Promise<{ itens: ItemRascunho[]; pendente: string | null }> {
    const validos: ItemRascunho[] = [];

    for (const raw of itens) {
      const nomeBuscado = String(raw.produtoNome || '').trim();
      const quantidade = Math.max(1, Number(raw.quantidade) || 1);
      if (!nomeBuscado) continue;

      let produto = await this.prisma.produto.findFirst({
        where: {
          negocioId,
          nome: { contains: nomeBuscado, mode: 'insensitive' },
          status: ProdutoStatus.ATIVO,
        },
        select: { id: true, nome: true, preco: true },
      });

      if (!produto) {
        produto = await this.buscarProdutoPorModificador(negocioId, nomeBuscado);
      }
      if (!produto) {
        produto = await this.buscarProdutoPorTexto(negocioId, nomeBuscado);
      }

      if (!produto) {
        return { itens: validos, pendente: nomeBuscado };
      }

      validos.push({
        produtoId: produto.id,
        produtoNome: produto.nome,
        quantidade,
        precoUnitario: Number(produto.preco),
        modificadores: typeof raw.modificadores === 'string' ? raw.modificadores : undefined,
        observacao: typeof raw.observacao === 'string' ? raw.observacao : undefined,
      });
    }

    return { itens: validos, pendente: null };
  }

  private ehCartao(pagamento?: string): boolean {
    const p = (pagamento || '').toUpperCase();
    return p === 'CARTAO_CREDITO' || p === 'CARTAO_DEBITO';
  }

  private async carregarFaixasCartao(negocioId: string): Promise<{ ate: number; valor: number }[]> {
    const config = await this.prisma.configuracaoNegocio.findUnique({ where: { negocioId } });
    return Array.isArray(config?.taxaCartaoFaixas)
      ? (config.taxaCartaoFaixas as { ate: number; valor: number }[])
      : [];
  }

  private resumirPedido(r: PedidoRascunho, faixasCartao?: { ate: number; valor: number }[]): string {
    const linhas = r.itens.map(
      (i) => `${i.quantidade}x ${i.produtoNome}${i.modificadores ? ` (${i.modificadores})` : ''} - R$ ${((i.precoUnitario || 0) * i.quantidade).toFixed(2)}`,
    );
    const total = r.itens.reduce((acc, i) => acc + (i.precoUnitario || 0) * i.quantidade, 0);

    let totalFinal = total;
    let textoTaxa = '';
    if (faixasCartao?.length && this.ehCartao(r.pagamento)) {
      const taxa = calcularTaxaCartao(total, faixasCartao);
      if (taxa > 0) {
        totalFinal = Math.round((total + taxa) * 100) / 100;
        textoTaxa = `\nTaxa cartão: R$ ${taxa.toFixed(2)}`;
      }
    }

    let resumo = linhas.join('\n') + `\n*Total: R$ ${totalFinal.toFixed(2)}*${textoTaxa}`;
    if (r.pagamento) resumo += `\nPagamento: ${r.pagamento}`;
    if (r.endereco) resumo += `\nEntrega: ${r.endereco}`;
    else if (r.tipoEntrega === 'ENTREGA') resumo += '\nEntrega: (informe o endereço)';
    else resumo += '\nRetirada no local';
    if (r.observacao) resumo += `\nObservação: ${r.observacao}`;
    return resumo;
  }

  private async criarPedidoConfirmado(
    contexto: ContextoConversa,
    negocioId: string,
    slug: string,
    telefone: string,
    nome: string | undefined,
    cliente: { id: string; sessionId: string },
  ): Promise<{ texto: string; sucesso: boolean }> {
    const rascunho = contexto.pedidoRascunho;
    if (!rascunho || !rascunho.itens.length) {
      return { texto: 'Não tenho um pedido em andamento para confirmar. 😅', sucesso: false };
    }

    const total = rascunho.itens.reduce((acc, i) => acc + (i.precoUnitario || 0) * i.quantidade, 0);
    const metodoPagamento = (rascunho.pagamento || 'PIX').toUpperCase();
    const tipoEntrega = rascunho.tipoEntrega === 'ENTREGA' ? 'ENTREGA' : 'RETIRADA';
    const endereco = rascunho.endereco;

    // Taxa de cartão (repasse): crédito e débito
    let taxaCartao = 0;
    let totalFinal = Math.round(total * 100) / 100;
    if (this.ehCartao(metodoPagamento)) {
      const faixas = await this.carregarFaixasCartao(negocioId);
      taxaCartao = calcularTaxaCartao(totalFinal, faixas);
      totalFinal = Math.round((totalFinal + taxaCartao) * 100) / 100;
    }

    const itensPedido = rascunho.itens.map((i) => ({
      produtoId: i.produtoId!,
      produtoNome: i.produtoNome,
      precoUnitario: i.precoUnitario!,
      quantidade: i.quantidade,
      modificadores: i.modificadores ? { descricao: i.modificadores } : {},
    }));

    const pedido = await this.prisma.pedido.create({
      data: {
        negocioId,
        sessionId: cliente.sessionId,
        status: 'CONFIRMADO',
        total: totalFinal,
        taxaCartao: taxaCartao || undefined,
        tipoEntrega: tipoEntrega as TipoEntrega,
        endereco: endereco ? { enderecoCompleto: endereco } : undefined,
        contato: telefone,
        observacao: rascunho.observacao || undefined,
        itens: { create: itensPedido },
        pagamentos: {
          create: {
            valor: totalFinal,
            metodo: metodoPagamento as MetodoPagamento,
            status: 'PENDENTE',
          },
        },
      },
      include: { itens: true, pagamentos: true },
    });

    this.logger.log(`[PEDIDO] criado #${pedido.id} | total=R$${totalFinal.toFixed(2)} | taxaCartao=R$${taxaCartao.toFixed(2)} | pagamento=${metodoPagamento} | entrega=${tipoEntrega}`);
    this.imprimirService.imprimirComanda(negocioId, pedido.id).catch(() => {});

    const linhaTaxa = taxaCartao > 0 ? `\nTaxa cartão: R$ ${taxaCartao.toFixed(2)}` : '';
    return {
      texto: `✅ *Pedido Confirmado!* #${pedido.id.slice(0, 8).toUpperCase()}\nTotal: R$ ${totalFinal.toFixed(2)}${linhaTaxa}\nPagamento: ${metodoPagamento}\n${endereco ? `Endereço: ${endereco}` : 'Retirada no local'}\n\nAgradecemos a preferência! 😊`,
      sucesso: true,
    };
  }

  private async montarSystemPrompt(
    negocioId: string,
    config: ConfigChatbot,
    contexto: ContextoConversa,
  ): Promise<string> {
    const negocio = await this.prisma.negocio.findUnique({
      where: { id: negocioId },
      select: { nome: true },
    });

    const base = config.systemPrompt || '';
    const estado = contexto.estado || 'INICIAL';
    const pedidoResumo = contexto.pedidoRascunho
      ? this.resumirPedido(contexto.pedidoRascunho, (config as any).taxaCartaoFaixas)
      : '';

    return `Você é ${negocio?.nome || 'um atendente virtual'}, atendente de WhatsApp. Fale português brasileiro, informal e simpático.
${base ? `Instruções do dono do negócio: ${base}` : ''}

SEU PAPEL:
- Você NÃO vê o cardápio e NÃO inventa produtos, preços ou disponibilidade.
- Você decide a AÇÃO certa e extrai os dados do pedido. O sistema executa as ações.

ESTADO ATUAL:
- Etapa: ${estado}
${pedidoResumo ? `- Pedido em andamento:\n${pedidoResumo}` : '- Sem pedido em andamento'}

AÇÕES:
- "responder": conversa simples.
- "perguntar": precisa de mais informação (use "faltando" para indicar o que falta).
- "mostrar_cardapio": cliente pediu cardápio/menu.
- "listar_produtos": cliente perguntou por produto específico (preencha dadosExtraidos.busca).
- "consultar_status": cliente pediu status/andamento do pedido.
- "info_negocio": cliente pediu informações do negócio.
- "horario_funcionamento": cliente perguntou horário.
- "chamar_humano": cliente pediu atendente humano.
- "confirmar_pedido": coletou TODOS os dados do pedido (itens, pagamento e endereço se ENTREGA). O sistema mostra o resumo com preços reais.
- "criar_pedido": o cliente CONFIRMOU o resumo mostrado anteriormente (etapa CONFIRMAR).

REGRAS DE PEDIDO:
- Extraia itens: nome do produto, quantidade, modificadores/sabores, observação.
- Pagamentos válidos: PIX, DINHEIRO, CARTAO_CREDITO, CARTAO_DEBITO.
- tipoEntrega: ENTREGA ou RETIRADA (se ENTREGA, precisa de endereço).
- Se faltar informação, use "perguntar" e aponte em "faltando".
- NUNCA diga que um produto existe antes do sistema confirmar.
- Depois do resumo, espere o cliente confirmar antes de "criar_pedido".

Responda APENAS com JSON (sem markdown):
{"resposta": "mensagem para o cliente", "acao": "...", "intencao": "...", "dadosExtraidos": {"itens": [{"produtoNome": "...", "quantidade": 1, "modificadores": "...", "observacao": "..."}], "endereco": "...", "pagamento": "PIX", "tipoEntrega": "RETIRADA", "observacao": "...", "busca": "..."}, "faltando": []}`;
  }

  private async buscarProdutos(negocioId: string, busca?: string) {
    const where: Record<string, unknown> = {
      negocioId,
      status: ProdutoStatus.ATIVO,
    };
    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { descricao: { contains: busca, mode: 'insensitive' } },
        { gruposModificadores: { some: { opcoes: { some: { nome: { contains: busca, mode: 'insensitive' } } } } } },
      ];
    }

    return this.prisma.produto.findMany({
      where,
      select: {
        id: true,
        nome: true,
        preco: true,
        descricao: true,
        gruposModificadores: {
          where: { opcoes: { some: { ativo: true } } },
          select: {
            nome: true,
            obrigatorio: true,
            opcoes: { where: { ativo: true }, orderBy: { ordem: 'asc' }, select: { nome: true, precoExtra: true } },
          },
        },
      },
      orderBy: { ordem: 'asc' },
      take: 50,
    });
  }

  private async buscarProdutoPorModificador(negocioId: string, texto: string) {
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const opcoes = await this.prisma.opcaoModificador.findMany({
      where: { ativo: true, grupo: { produto: { negocioId, status: ProdutoStatus.ATIVO } } },
      select: { nome: true },
    });

    let resto = normalize(texto);
    for (const o of opcoes) {
      resto = resto.split(normalize(o.nome)).join(' ');
    }
    resto = resto.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    if (!resto) return null;

    return this.prisma.produto.findFirst({
      where: { negocioId, status: ProdutoStatus.ATIVO, nome: { contains: resto, mode: 'insensitive' } },
      select: { id: true, nome: true, preco: true },
    });
  }

  private async buscarProdutoPorTexto(negocioId: string, texto: string) {
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const alvo = normalize(texto);

    const produtos = await this.prisma.produto.findMany({
      where: { negocioId, status: ProdutoStatus.ATIVO },
      select: { id: true, nome: true, preco: true },
      take: 200,
    });

    let melhor: (typeof produtos)[number] | null = null;
    let melhorLen = 0;
    for (const p of produtos) {
      const n = normalize(p.nome);
      if (n.length >= 3 && alvo.includes(n) && n.length > melhorLen) {
        melhor = p;
        melhorLen = n.length;
      }
    }
    return melhor;
  }

  private normalizarProdutos(produtos: Array<{
    id: string;
    nome: string;
    preco: { toNumber: () => number } | number;
    descricao?: string | null;
    gruposModificadores?: Array<{ nome: string; obrigatorio: boolean; opcoes: Array<{ nome: string; precoExtra: { toNumber: () => number } | number }> }>;
  }>) {
    return produtos.map(p => ({
      ...p,
      preco: Number(p.preco),
      gruposModificadores: (p.gruposModificadores || []).map(g => ({
        ...g,
        opcoes: g.opcoes.map(o => ({ ...o, precoExtra: Number(o.precoExtra) })),
      })),
    }));
  }

  private formatarProdutos(produtos: Array<{
    id: string;
    nome: string;
    preco: number;
    descricao?: string | null;
    gruposModificadores?: Array<{ nome: string; obrigatorio: boolean; opcoes: Array<{ nome: string; precoExtra: number }> }>;
  }>): string {
    if (produtos.length === 0) return 'Hmm, não encontrei nada com esse nome no nosso cardápio 😕 Que tal dar uma olhada no cardápio completo? Posso te mostrar!';

    return produtos.map((p) => {
      let linha = `• ${p.nome} - R$ ${Number(p.preco).toFixed(2)}`;
      if (p.descricao) linha += `\n  ${p.descricao}`;
      for (const g of p.gruposModificadores || []) {
        const opcoes = g.opcoes
          .map((o) => (Number(o.precoExtra) > 0 ? `${o.nome} (+R$${Number(o.precoExtra).toFixed(2)})` : o.nome))
          .join(', ');
        linha += `\n  ${g.nome}${g.obrigatorio ? ' (obrigatorio)' : ''}: ${opcoes}`;
      }
      return linha;
    }).join('\n');
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

    return { historico: [], estado: 'INICIAL' };
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
