import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class N8nApiGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key não fornecida');
    }

    if (apiKey !== process.env.N8N_API_KEY) {
      throw new UnauthorizedException('API key inválida');
    }

    return true;
  }
}
