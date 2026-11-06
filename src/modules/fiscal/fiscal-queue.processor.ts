import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { FiscalService } from './fiscal.service';

@Processor('emissao-nfce')
@Injectable()
export class FiscalEmissaoProcessor extends WorkerHost {
  private readonly logger = new Logger(FiscalEmissaoProcessor.name);

  constructor(
    private readonly fiscal: FiscalService,
    @InjectQueue('emissao-nfce') private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === 'transmitir') {
      return this.fiscal.transmitirDocumento(job.data.documentoId);
    }
    if (job.name === 'reenviar') {
      return this.fiscal.reenviarContingencia(job.data.documentoId);
    }
    if (job.name === 'econf') {
      return this.fiscal.processarEconf(job.data.eventoId);
    }
    if (job.name === 'recuperar') {
      const resultado = await this.fiscal.recuperarPendentes();
      await this.queue.add('recuperar', {}, { delay: 15 * 60_000, attempts: 1, removeOnComplete: 10, removeOnFail: 10 });
      return resultado;
    }
    return null;
  }
}
