import { Global, Module } from '@nestjs/common';
import { BullModule as NestBullModule } from '@nestjs/bullmq';

function redisUrl(url: string): { host: string; port: number } {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: parseInt(u.port) || 6379 };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

@Global()
@Module({
  imports: [
    NestBullModule.forRoot({
      connection: redisUrl(process.env.REDIS_URL || 'redis://localhost:6379'),
    }),
    NestBullModule.registerQueue({
      name: 'alertas-estoque',
    }),
  ],
  exports: [NestBullModule],
})
export class BullModule {}
