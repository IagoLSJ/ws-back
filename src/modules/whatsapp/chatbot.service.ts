import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { ImprimirService } from '../imprimir/imprimir.service';
import { MetodoPagamento, ProdutoStatus, TipoMensagemWhatsApp } from '@prisma/client';

type EtapaConversa =
  | 'NOVO'
  | 'AGUARDANDO_PRODUTO'
  | 'AGUARDANDO_MODIFICADOR'
  | 'AGUARDANDO_PAGAMENTO'
  | 'AGUARDANDO_ENDERECO'
  | 'CONFIRMACAO'
  | 'FINALIZADO';

interface DadosConversa {
  produtoId?: string;
  produtoNome?: string;
  preco?: number;
  modificadorIndex?: number;
  modificadores?: { grupoNome: string; opcaoNome: string; precoExtra: number }[];
  metodoPagamento?: string;
  endereco?: string;
  tipoEntrega?: string;
}

interface EstadoConversa {
  etapa: EtapaConversa;
  dados: DadosConversa;
}

const TTL = 3600;

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private imprimirService: ImprimirService,
  ) {}

  async processar(negocioId: string, slug: string, telefone: string, nome: string | undefined, texto: string): Promise<{ telefone: string; texto: string }> {
    const cliente = await this.obterOuCriarCliente(negocioId, telefone, nome);

    if (cliente.modoHumano) {
      return { telefone, texto: '🔔 Sua mensagem foi encaminhada para nosso atendente. Em breve você receberá uma resposta.' };
    }

    await this.salvarMensagem(cliente.id, texto, TipoMensagemWhatsApp.CLIENTE);

    const estado = await this.carregarEstado(slug, telefone);
    const textoNormalizado = texto.toLowerCase().trim();
    const nomeCliente = nome || 'Cliente';

    let resposta: { telefone: string; texto: string };

    if (textoNormalizado === 'cancelar' || textoNormalizado === 'cancelar pedido') {
      await this.limparEstado(slug, telefone);
      resposta = { telefone, texto: 'Pedido cancelado. Digite *cardapio* para ver o menu ou *quero pedir* para começar!' };
    } else if (estado.etapa === 'NOVO') {
      resposta = await this.handleNovo(estado, slug, telefone, nomeCliente, textoNormalizado);
    } else if (estado.etapa === 'AGUARDANDO_PRODUTO') {
      resposta = await this.handleAguardandoProduto(estado, negocioId, slug, telefone, nomeCliente, textoNormalizado);
    } else if (estado.etapa === 'AGUARDANDO_MODIFICADOR') {
      resposta = await this.handleAguardandoModificador(estado, negocioId, slug, telefone, nomeCliente, textoNormalizado);
    } else if (estado.etapa === 'AGUARDANDO_PAGAMENTO') {
      resposta = await this.handleAguardandoPagamento(estado, slug, telefone, nomeCliente, textoNormalizado);
    } else if (estado.etapa === 'AGUARDANDO_ENDERECO') {
      resposta = await this.handleAguardandoEndereco(estado, slug, telefone, nomeCliente, textoNormalizado);
    } else if (estado.etapa === 'CONFIRMACAO') {
      resposta = await this.handleConfirmacao(estado, negocioId, slug, telefone, nomeCliente, textoNormalizado);
    } else if (estado.etapa === 'FINALIZADO') {
      await this.limparEstado(slug, telefone);
      resposta = { telefone, texto: `Olá ${nomeCliente}! Seu pedido já foi finalizado. Digite *cardapio* para ver o menu ou *quero pedir* para um novo pedido!` };
    } else {
      resposta = { telefone, texto: `Olá ${nomeCliente}! Digite *cardapio* para ver nosso menu ou *quero pedir* para fazer um pedido.` };
    }

    await this.salvarMensagem(cliente.id, resposta.texto, TipoMensagemWhatsApp.BOT);
    return resposta;
  }

  private async obterOuCriarCliente(negocioId: string, telefone: string, nome?: string) {
    let cliente = await this.prisma.clienteWhatsApp.findUnique({
      where: { negocioId_telefone: { negocioId, telefone } },
    });
    if (!cliente) {
      cliente = await this.prisma.clienteWhatsApp.create({
        data: { negocioId, telefone, sessionId: `chatbot-${Date.now()}`, nome },
      });
    } else if (nome) {
      cliente = await this.prisma.clienteWhatsApp.update({
        where: { id: cliente.id },
        data: { nome, ultimaInteracao: new Date() },
      });
    } else {
      await this.prisma.clienteWhatsApp.update({
        where: { id: cliente.id },
        data: { ultimaInteracao: new Date() },
      });
    }
    return cliente;
  }

  private async salvarMensagem(clienteId: string, texto: string, tipo: TipoMensagemWhatsApp) {
    await this.prisma.mensagemWhatsApp.create({
      data: { clienteId, texto, tipo },
    });
  }

  private async carregarEstado(slug: string, telefone: string): Promise<EstadoConversa> {
    const key = `chatbot:${slug}:${telefone}`;
    const raw = await this.redis.get(key);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return { etapa: 'NOVO', dados: {} };
      }
    }
    return { etapa: 'NOVO', dados: {} };
  }

  private async salvarEstado(slug: string, telefone: string, estado: EstadoConversa): Promise<void> {
    const key = `chatbot:${slug}:${telefone}`;
    await this.redis.setex(key, TTL, JSON.stringify(estado));
  }

  private async limparEstado(slug: string, telefone: string): Promise<void> {
    const key = `chatbot:${slug}:${telefone}`;
    await this.redis.del(key);
  }

  private async handleNovo(estado: EstadoConversa, slug: string, telefone: string, nome: string, texto: string): Promise<{ telefone: string; texto: string }> {
    if (texto.includes('quero pedir') || texto.includes('fazer pedido') || texto.includes('comprar') || texto.includes('pedir')) {
      estado.etapa = 'AGUARDANDO_PRODUTO';
      estado.dados = {};
      await this.salvarEstado(slug, telefone, estado);
      return { telefone, texto: `Ótimo ${nome}! Qual produto você deseja? Digite o nome (ex: suco, hamburguer, pizza) ou *cardapio* para ver o menu completo.` };
    }

    if (texto.includes('cardapio') || texto.includes('menu') || texto.includes('catalogo')) {
      return { telefone, texto: `Digite *cardapio* que eu te envio o menu completo!` };
    }

    const produtoEncontrado = await this.buscarProdutoPorNome(slug, texto);
    if (produtoEncontrado) {
      estado.etapa = 'AGUARDANDO_MODIFICADOR';
      estado.dados = {
        produtoId: produtoEncontrado.id,
        produtoNome: produtoEncontrado.nome,
        preco: Number(produtoEncontrado.preco),
        modificadorIndex: 0,
        modificadores: [],
      };
      await this.salvarEstado(slug, telefone, estado);
      return this.perguntarModificador(estado, slug, telefone, nome);
    }

    return {
      telefone,
      texto: `💬 Não entendi "${texto}".\n\nDigite:\n1 - *Cardapio*\n2 - *Quero pedir* (fazer pedido)\n3 - *Status* (acompanhar pedido)\n\nOu o nome de um produto!`,
    };
  }

  private async handleAguardandoProduto(estado: EstadoConversa, negocioId: string, slug: string, telefone: string, nome: string, texto: string): Promise<{ telefone: string; texto: string }> {
    const produtoEncontrado = await this.buscarProdutoPorNome(slug, texto);

    if (!produtoEncontrado) {
      return { telefone, texto: `Não encontrei "${texto}". Digite o nome exato do produto ou *cardapio* para ver o menu.` };
    }

    estado.etapa = 'AGUARDANDO_MODIFICADOR';
    estado.dados = {
      produtoId: produtoEncontrado.id,
      produtoNome: produtoEncontrado.nome,
      preco: Number(produtoEncontrado.preco),
      modificadorIndex: 0,
      modificadores: [],
    };
    await this.salvarEstado(slug, telefone, estado);
    return this.perguntarModificador(estado, slug, telefone, nome);
  }

  private async handleAguardandoModificador(estado: EstadoConversa, negocioId: string, slug: string, telefone: string, nome: string, texto: string): Promise<{ telefone: string; texto: string }> {
    const produto = await this.prisma.produto.findFirst({
      where: { id: estado.dados.produtoId, negocioId, status: ProdutoStatus.ATIVO },
      include: {
        gruposModificadores: {
          include: { opcoes: { where: { ativo: true } } },
          orderBy: { ordem: 'asc' },
        },
      },
    });
    if (!produto) {
      await this.limparEstado(slug, telefone);
      return { telefone, texto: `Produto não encontrado. Vamos começar de novo! Digite *quero pedir*.` };
    }

    const grupos = produto.gruposModificadores;
    const idx = estado.dados.modificadorIndex ?? 0;

    if (idx >= grupos.length) {
      estado.etapa = 'AGUARDANDO_PAGAMENTO';
      await this.salvarEstado(slug, telefone, estado);
      return this.perguntarPagamento(estado, slug, telefone, nome);
    }

    const grupo = grupos[idx];
    const opcaoEscolhida = grupo.opcoes.find(
      (o) => o.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        || o.nome.toLowerCase().includes(texto)
        || texto.includes(o.nome.toLowerCase()),
    );

    if (!opcaoEscolhida) {
      const opcoesList = grupo.opcoes.map((o, i) => `${i + 1} - ${o.nome}${Number(o.precoExtra) > 0 ? ' (+R$' + Number(o.precoExtra).toFixed(2) + ')' : ''}`).join('\n');
      return { telefone, texto: `Escolha o *${grupo.nome}*:\n${opcoesList}` };
    }

    estado.dados.modificadores!.push({
      grupoNome: grupo.nome,
      opcaoNome: opcaoEscolhida.nome,
      precoExtra: Number(opcaoEscolhida.precoExtra),
    });
    estado.dados.modificadorIndex = idx + 1;
    await this.salvarEstado(slug, telefone, estado);

    if (idx + 1 >= grupos.length) {
      estado.etapa = 'AGUARDANDO_PAGAMENTO';
      await this.salvarEstado(slug, telefone, estado);
      return this.perguntarPagamento(estado, slug, telefone, nome);
    }

    return this.perguntarModificador(estado, slug, telefone, nome);
  }

  private async handleAguardandoPagamento(estado: EstadoConversa, slug: string, telefone: string, nome: string, texto: string): Promise<{ telefone: string; texto: string }> {
    const mapa: Record<string, string> = {
      '1': 'DINHEIRO',
      '2': 'CARTAO_CREDITO',
      '3': 'CARTAO_DEBITO',
      '4': 'PIX',
      'dinheiro': 'DINHEIRO',
      'cartao': 'CARTAO_CREDITO',
      'credito': 'CARTAO_CREDITO',
      'debito': 'CARTAO_DEBITO',
      'pix': 'PIX',
    };

    const metodo = mapa[texto] || mapa[Object.keys(mapa).find((k) => texto.includes(k)) || ''];
    if (!metodo) {
      return this.perguntarPagamento(estado, slug, telefone, nome);
    }

    estado.dados.metodoPagamento = metodo;
    estado.etapa = 'AGUARDANDO_ENDERECO';
    estado.dados.tipoEntrega = 'ENTREGA';
    await this.salvarEstado(slug, telefone, estado);
    return { telefone, texto: `Qual o endereço de entrega? (Digite: Rua, número, bairro, cidade)` };
  }

  private async handleAguardandoEndereco(estado: EstadoConversa, slug: string, telefone: string, nome: string, texto: string): Promise<{ telefone: string; texto: string }> {
    estado.dados.endereco = texto;
    estado.etapa = 'CONFIRMACAO';
    await this.salvarEstado(slug, telefone, estado);
    return this.mostrarResumo(estado, slug, telefone, nome);
  }

  private async handleConfirmacao(estado: EstadoConversa, negocioId: string, slug: string, telefone: string, nome: string, texto: string): Promise<{ telefone: string; texto: string }> {
    if (texto === '1' || texto.includes('sim') || texto.includes('confirmo') || texto.includes('pode')) {
      estado.etapa = 'FINALIZADO';
      await this.salvarEstado(slug, telefone, estado);

      try {
        const sessionId = `chatbot:${slug}:${telefone}`;
        let cliente = await this.prisma.clienteWhatsApp.findUnique({
          where: { negocioId_telefone: { negocioId, telefone } },
        });
        if (!cliente) {
          cliente = await this.prisma.clienteWhatsApp.create({
            data: { negocioId, telefone, nome, sessionId: `chatbot-${Date.now()}` },
          });
        }

        const produto = await this.prisma.produto.findFirst({ where: { id: estado.dados.produtoId } });

        const totalItens = estado.dados.preco! + (estado.dados.modificadores?.reduce((acc, m) => acc + m.precoExtra, 0) ?? 0);

        const pedido = await this.prisma.pedido.create({
          data: {
            negocioId,
            sessionId: cliente.sessionId,
            status: 'CONFIRMADO',
            total: totalItens,
            tipoEntrega: estado.dados.tipoEntrega ?? 'ENTREGA',
            endereco: estado.dados.endereco,
            contato: telefone,
            itens: {
              create: {
                produtoId: estado.dados.produtoId!,
                produtoNome: estado.dados.produtoNome!,
                precoUnitario: estado.dados.preco!,
                quantidade: 1,
                modificadores: estado.dados.modificadores,
              },
            },
            pagamentos: {
              create: {
                valor: totalItens,
                metodo: estado.dados.metodoPagamento as MetodoPagamento,
                status: 'PENDENTE',
              },
            },
          },
          include: { itens: true, pagamentos: true },
        });

        this.imprimirService.imprimirComanda(negocioId, pedido.id).catch(() => {});

        await this.limparEstado(slug, telefone);
        return {
          telefone,
          texto: `✅ *Pedido Confirmado!* 🎉\n\nNº #${pedido.id.slice(0, 8).toUpperCase()}\nProduto: ${estado.dados.produtoNome}\nTotal: R$ ${totalItens.toFixed(2)}\nPagamento: ${estado.dados.metodoPagamento}\nEndereço: ${estado.dados.endereco}\n\nAgradecemos a preferência! Digite *cardapio* ou *quero pedir* para um novo pedido.`,
        };
      } catch (error) {
        this.logger.error('Erro ao criar pedido:', error);
        await this.limparEstado(slug, telefone);
        return { telefone, texto: `Desculpe, ocorreu um erro ao criar seu pedido. Tente novamente mais tarde ou digite *quero pedir* para recomeçar.` };
      }
    }

    if (texto === '2' || texto.includes('nao') || texto.includes('cancelar')) {
      await this.limparEstado(slug, telefone);
      return { telefone, texto: `Pedido cancelado. Digite *cardapio* para ver o menu ou *quero pedir* para começar novamente!` };
    }

    return this.mostrarResumo(estado, slug, telefone, nome);
  }

  private async perguntarModificador(estado: EstadoConversa, slug: string, telefone: string, nome: string): Promise<{ telefone: string; texto: string }> {
    const produto = await this.prisma.produto.findFirst({
      where: { id: estado.dados.produtoId },
      include: {
        gruposModificadores: {
          include: { opcoes: { where: { ativo: true } } },
          orderBy: { ordem: 'asc' },
        },
      },
    });
    if (!produto) {
      await this.limparEstado(slug, telefone);
      return { telefone, texto: `Erro ao carregar produto. Digite *quero pedir* para recomeçar.` };
    }

    const idx = estado.dados.modificadorIndex ?? 0;
    const grupos = produto.gruposModificadores;

    if (idx >= grupos.length) {
      estado.etapa = 'AGUARDANDO_PAGAMENTO';
      await this.salvarEstado(slug, telefone, estado);
      return this.perguntarPagamento(estado, slug, telefone, nome);
    }

    const grupo = grupos[idx];
    const opcoesList = grupo.opcoes.map((o, i) => `${i + 1} - ${o.nome}${Number(o.precoExtra) > 0 ? ' (+R$' + Number(o.precoExtra).toFixed(2) + ')' : ''}`).join('\n');
    return { telefone, texto: `Escolha o *${grupo.nome}* para *${estado.dados.produtoNome}*:\n${opcoesList}` };
  }

  private async perguntarPagamento(estado: EstadoConversa, slug: string, telefone: string, nome: string): Promise<{ telefone: string; texto: string }> {
    return { telefone, texto: `Qual a forma de pagamento?\n\n1 - *Dinheiro*\n2 - *Cartão de Crédito*\n3 - *Cartão de Débito*\n4 - *PIX*` };
  }

  private async mostrarResumo(estado: EstadoConversa, slug: string, telefone: string, nome: string): Promise<{ telefone: string; texto: string }> {
    const modificadoresTexto = (estado.dados.modificadores ?? []).map((m) => `  • ${m.grupoNome}: ${m.opcaoNome}`).join('\n');
    const total = estado.dados.preco! + (estado.dados.modificadores?.reduce((acc, m) => acc + m.precoExtra, 0) ?? 0);

    return {
      telefone,
      texto: `*Resumo do Pedido* 📋\n\nProduto: ${estado.dados.produtoNome}\n${modificadoresTexto ? 'Modificadores:\n' + modificadoresTexto + '\n' : ''}Pagamento: ${estado.dados.metodoPagamento}\nEndereço: ${estado.dados.endereco}\n*Total: R$ ${total.toFixed(2)}*\n\nConfirma o pedido?\n\n1 - *Sim*\n2 - *Cancelar*`,
    };
  }

  private async buscarProdutoPorNome(slug: string, texto: string): Promise<{ id: string; nome: string; preco: number } | null> {
    const negocio = await this.prisma.negocio.findUnique({ where: { slug, ativo: true }, select: { id: true } });
    if (!negocio) return null;

    const produtos = await this.prisma.produto.findMany({
      where: {
        negocioId: negocio.id,
        status: ProdutoStatus.ATIVO,
        nome: { contains: texto, mode: 'insensitive' },
      },
      select: { id: true, nome: true, preco: true },
      take: 5,
    });

    if (produtos.length === 1) return { ...produtos[0], preco: Number(produtos[0].preco) };

    if (produtos.length > 1) return null;

    const produtosSemAcento = await this.prisma.produto.findMany({
      where: {
        negocioId: negocio.id,
        status: ProdutoStatus.ATIVO,
      },
      select: { id: true, nome: true, preco: true },
      take: 50,
    });

    const textoNormalizado = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const match = produtosSemAcento.find((p) =>
      p.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(textoNormalizado)
      || textoNormalizado.includes(p.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
    );

    return match ? { ...match, preco: Number(match.preco) } : null;
  }
}
