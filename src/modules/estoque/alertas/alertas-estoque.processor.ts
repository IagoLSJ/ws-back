import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../../infra/database/prisma.service';

@Processor('alertas-estoque')
export class AlertasEstoqueProcessor extends WorkerHost {
  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<any>): Promise<void> {
    const { negocioId, produtoId, produtoNome, quantidadeAtual, estoqueMinimo } = job.data;

    const config = await this.prisma.configuracaoNegocio.findUnique({
      where: { negocioId },
      select: { webhookUrl: true, emailAlertas: true },
    });

    console.log(
      `[ALERTA] Ruptura de estoque\n` +
      `  Negócio: ${negocioId}\n` +
      `  Produto: ${produtoNome}${produtoId ? ` (${produtoId})` : ''}\n` +
      `  Estoque atual: ${quantidadeAtual}\n` +
      `  Estoque mínimo: ${estoqueMinimo}`,
    );

    if (config?.webhookUrl) {
      try {
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'estoque-ruptura',
            negocioId,
            produtoId,
            produtoNome,
            quantidadeAtual,
            estoqueMinimo,
            timestamp: new Date().toISOString(),
          }),
        });
        if (!response.ok) {
          console.error(`[ALERTA] Webhook respondeu com status ${response.status}`);
        }
      } catch (err) {
        console.error(`[ALERTA] Erro ao enviar webhook: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (config?.emailAlertas) {
      // TODO: implementar envio de email quando um mailer estiver disponível
      console.log(
        `[ALERTA] Email seria enviado para ${config.emailAlertas}` +
        ` sobre ruptura de "${produtoNome}" (atual: ${quantidadeAtual}, mínimo: ${estoqueMinimo})`,
      );
    }
  }
}
