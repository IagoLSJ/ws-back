import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../infra/database/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, path } = request;

    if (method === 'GET') return next.handle();

    return next.handle().pipe(
      tap(() => {
        const user = request.user;
        if (!user) return;

        this.prisma.auditLog
          .create({
            data: {
              usuarioId: user.id,
              negocioId: request.params.businessId || request.params.id,
              acao: `${method} ${path}`,
              entidade: context.getClass().name,
              payload: { body: request.body, params: request.params },
              ip: request.ip,
              userAgent: request.headers['user-agent'],
            },
          })
          .catch(() => {});
      }),
    );
  }
}
