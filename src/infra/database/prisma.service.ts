import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL || '';
    if (url.startsWith('prisma://')) {
      // Prisma Accelerate
      super({ accelerateUrl: url });
    } else {
      // Conexão direta via driver adapter
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: url,
        max: 5,                    // limite de conexões simultâneas (padrão pg é 10)
        idleTimeoutMillis: 30000,  // fecha conexões ociosas após 30s
        connectionTimeoutMillis: 10000,
      });
      super({ adapter: new PrismaPg(pool) });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
