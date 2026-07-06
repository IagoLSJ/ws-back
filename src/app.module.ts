import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './infra/database/prisma.module';
import { RedisModule } from './infra/cache/redis.module';
import { StorageModule } from './infra/storage/storage.module';
import { BullModule } from './infra/queue/bullmq.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { NegociosModule } from './modules/negocios/negocios.module';
import { MembrosModule } from './modules/membros/membros.module';
import { CategoriasModule } from './modules/categorias/categorias.module';
import { ProdutosModule } from './modules/produtos/produtos.module';
import { EstoqueModule } from './modules/estoque/estoque.module';
import { RelatoriosModule } from './modules/relatorios/relatorios.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CarrinhoModule } from './modules/carrinho/carrinho.module';
import { PedidosModule } from './modules/pedidos/pedidos.module';
import { PdvModule } from './modules/pdv/pdv.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    RedisModule,
    StorageModule,
    BullModule,
    AuthModule,
    UsuariosModule,
    NegociosModule,
    MembrosModule,
    CategoriasModule,
    ProdutosModule,
    EstoqueModule,
    RelatoriosModule,
    DashboardModule,
    CarrinhoModule,
    PedidosModule,
    PdvModule,
    WhatsappModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
