import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as net from 'net';
import { Logger } from '@nestjs/common';

interface PrintJobData {
  host: string;
  port: number;
  data: Buffer;
}

@Processor('print-job', { concurrency: 1 })
export class PrintJobProcessor extends WorkerHost {
  private readonly logger = new Logger(PrintJobProcessor.name);

  async process(job: Job<PrintJobData>): Promise<void> {
    const { host, port, data } = job.data;
    this.logger.log(`Imprimindo em ${host}:${port} (job #${job.id})`);

    return new Promise<void>((resolve, reject) => {
      const client = new net.Socket();
      const timeout = 8000;
      client.setTimeout(timeout);

      client.connect(port, host, () => {
        this.logger.log(`Conectado à impressora ${host}:${port}`);
        client.write(data);
      });

      client.on('data', () => {
        client.destroy();
        resolve();
      });

      client.on('error', (err) => {
        this.logger.error(`Erro impressora ${host}:${port}: ${err.message}`);
        client.destroy();
        reject(err);
      });

      client.on('timeout', () => {
        this.logger.warn(`Timeout impressora ${host}:${port}`);
        client.destroy();
        reject(new Error('Timeout'));
      });

      client.on('close', () => resolve());
    });
  }
}
