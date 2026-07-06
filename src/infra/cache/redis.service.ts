import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService) {
    const url = config.get<string>('redis.url');

    if (!url || url.startsWith('redis://localhost') || url.startsWith('redis://127.0.0.1') || url.includes('upstash-host')) {
      this.logger.warn('Redis não configurado — operações em cache serão ignoradas');
      return;
    }

    this.client = new Redis(url);
    this.client.on('error', (err) => this.logger.error('Redis error:', err.message));
  }

  async get(key: string): Promise<string | null> {
    return this.client?.get(key) ?? null;
  }

  async setex(key: string, seconds: number, value: string | number | Buffer): Promise<'OK' | null> {
    return this.client?.setex(key, seconds, value) ?? null;
  }

  async del(...keys: string[]): Promise<number> {
    return this.client?.del(...keys) ?? 0;
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
