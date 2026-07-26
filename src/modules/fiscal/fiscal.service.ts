import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { INfeGateway, EmitirNFeParams, NFeItem, NFePagamento } from './nfe-gateway.interface';

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);
  private gateway: INfeGateway | null = null;

  constructor(private prisma: PrismaService) {}

  /**
   * Registra o gateway de NFe (ex: FocusNFe, NFe.io, SEFAZ direto).
   * Chame isso no bootstrap da aplicação.
   */
  setGateway(gateway: INfeGateway) {
    this.gateway = gateway;
    this.logger.log('Gateway de NFe registrado');
  }

  async emitirNFe(negocioId: string, pedidoId: string): Promise<boolean> {
    if (!this.gateway) {
      this.logger.warn(`Nenhum gateway de NFe configurado. Pedido ${pedidoId} sem NF.`);
      return false;
    }

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        itens: { include: { produto: true } },
        pagamentos: true,
        negocio: { include: { configuracoes: true } },
      },
    });
    if (!pedido) return false;

    // Só emite NF para VAREJO
    if (pedido.negocio.tipo !== 'VAREJO') return false;

    const config = pedido.negocio.configuracoes;
    if (!config?.cnpj) {
      this.logger.warn(`Negócio ${negocioId} sem CNPJ configurado — não é possível emitir NF`);
      return false;
    }

    const params = this.montarParams(pedido, config);
    try {
      const resultado = await this.gateway.emitir(params);
      await this.prisma.pedido.update({
        where: { id: pedidoId },
        data: {
          chaveAcesso: resultado.chaveAcesso,
          numeroNfe: String(resultado.numeroNfe),
          serieNfe: String(resultado.serieNfe),
          tributosAproximados: resultado.tributosAproximados,
        },
      });
      this.logger.log(`NF-e emitida para pedido ${pedidoId}: ${resultado.chaveAcesso}`);
      return true;
    } catch (err) {
      this.logger.error(`Erro ao emitir NF-e para pedido ${pedidoId}: ${err}`);
      return false;
    }
  }

  private montarParams(pedido: any, config: any): EmitirNFeParams {
    const endEmitente = config.endereco || {};
    const destinatario: any = {};
    if (pedido.clienteCpf) destinatario.cpf = pedido.clienteCpf;
    if (pedido.clienteNome) destinatario.nome = pedido.clienteNome;

    const itens: NFeItem[] = pedido.itens.map((i: any) => {
      const p = i.produto || {};
      return {
        nome: i.produtoNome,
        ncm: p.ncm || '21069090',
        cfop: p.cfop || '5102',
        uCom: p.unidadeMedida || 'UN',
        qCom: Number(i.quantidade),
        vUnCom: Number(i.precoUnitario),
        vProd: Number(i.precoUnitario) * Number(i.quantidade),
        cEAN: p.codigoBarras || undefined,
        cEANTrib: p.codigoBarras || undefined,
      };
    });

    const pagamentos: NFePagamento[] = pedido.pagamentos.map((pg: any) => ({
      tPag: this.mapearPagamento(pg.metodo),
      vPag: Number(pg.valor),
    }));

    return {
      negocio: {
        cnpj: config.cnpj,
        razaoSocial: config.razaoSocial || pedido.negocio.nome,
        nomeFantasia: pedido.negocio.nome,
        ie: config.ie,
        logradouro: endEmitente.logradouro || '',
        numero: endEmitente.numero || '',
        bairro: endEmitente.bairro || '',
        cidade: endEmitente.cidade || '',
        uf: endEmitente.estado || '',
        cep: endEmitente.cep || '',
        regimeTributario: 1,
      },
      destinatario,
      itens,
      pagamentos,
      numeroPedido: pedido.id.slice(0, 8).toUpperCase(),
      observacao: pedido.observacao || undefined,
    };
  }

  private mapearPagamento(metodo: string): string {
    const mapa: Record<string, string> = {
      DINHEIRO: '01',
      CARTAO_CREDITO: '03',
      CARTAO_DEBITO: '04',
      PIX: '17',
      CREDIARIO: '99',
      OUTRO: '99',
    };
    return mapa[metodo] || '99';
  }
}
