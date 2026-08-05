import { Global, Module } from '@nestjs/common';
import { BullModule as NestBullModule } from '@nestjs/bullmq';
import { PrintJobProcessor } from './print-job.processor';

function redisConnection(url: string): Record<string, any> {
  try {
    const u = new URL(url);
    const conn: Record<string, any> = {
      host: u.hostname,
      port: parseInt(u.port) || 6379,
    };
    if (u.username) conn.username = decodeURIComponent(u.username);
    if (u.password) conn.password = decodeURIComponent(u.password);
    if (u.protocol === 'rediss:') conn.tls = {};
    if (u.searchParams.get('family')) conn.family = parseInt(u.searchParams.get('family')!, 10);
    if (u.searchParams.get('db')) conn.db = parseInt(u.searchParams.get('db')!, 10);
    return conn;
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

@Global()
@Module({
  imports: [
    NestBullModule.forRoot({
      connection: redisConnection(process.env.KV_URL || process.env.REDIS_URL || 'redis://localhost:6379'),
    }),
    NestBullModule.registerQueue({
      name: 'alertas-estoque',
    }),
    NestBullModule.registerQueue({
      name: 'print-job',
    }),
  ],
  providers: [PrintJobProcessor],
  exports: [NestBullModule, PrintJobProcessor],
})
export class BullModule {}
