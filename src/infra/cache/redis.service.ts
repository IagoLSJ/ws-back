import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis | null = null;
  private readonly mem = new Map<string, string>();
  private readonly memTimers = new Map<string, NodeJS.Timeout>();
  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService) {
    const url = config.get<string>('redis.url');

    if (!url || url.startsWith('redis://localhost') || url.startsWith('redis://127.0.0.1') || url.includes('upstash-host')) {
      this.logger.warn('Redis não configurado — usando fallback em memória (dedupe/lock locais)');
      return;
    }

    this.client = new Redis(url);
    this.client.on('error', (err) => this.logger.error('Redis error:', err.message));
  }

  async get(key: string): Promise<string | null> {
    if (this.client) return this.client.get(key);
    return this.mem.get(key) ?? null;
  }

  async setex(key: string, seconds: number, value: string | number | Buffer): Promise<'OK' | null> {
    if (this.client) return this.client.setex(key, seconds, value);
    this.memSet(key, String(value), seconds);
    return 'OK' as const;
  }

  /**
   * set com suporte a NX (set if not exists). Retorna true se a chave foi gravada.
   * Com Redis indisponível, usa fallback em memória (por instância).
   */
  async set(key: string, value: string, seconds = 0, nx = false): Promise<boolean> {
    if (this.client) {
      const res = nx
        ? await this.client.set(key, value, 'EX', seconds, 'NX')
        : seconds
          ? await this.client.set(key, value, 'EX', seconds)
          : await this.client.set(key, value);
      return res === 'OK' || res === null;
    }

    if (nx && this.mem.has(key)) return false;
    this.memSet(key, value, seconds);
    return true;
  }

  async del(...keys: string[]): Promise<number> {
    if (this.client) return this.client.del(...keys);

    let n = 0;
    for (const k of keys) {
      if (this.mem.delete(k)) {
        n++;
        const t = this.memTimers.get(k);
        if (t) clearTimeout(t);
        this.memTimers.delete(k);
      }
    }
    return n;
  }

  private memSet(key: string, value: string, seconds: number) {
    this.mem.set(key, value);
    if (seconds > 0) {
      const t = setTimeout(() => {
        this.mem.delete(key);
        this.memTimers.delete(key);
      }, seconds * 1000);
      t.unref?.();
      const prev = this.memTimers.get(key);
      if (prev) clearTimeout(prev);
      this.memTimers.set(key, t);
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
