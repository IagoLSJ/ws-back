import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/database/prisma.service';

@Injectable()
export class MercadoLivreService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private get creds() {
    const appId = this.config.get<string>('mercadolivre.appId');
    const secret = this.config.get<string>('mercadolivre.secret');
    const redirectUri = this.config.get<string>('mercadolivre.redirectUri');
    if (!appId || !secret || !redirectUri) {
      throw new BadRequestException(
        'Mercado Livre não configurado. Defina MERCADOLIVRE_APP_ID, MERCADOLIVRE_SECRET e MERCADOLIVRE_REDIRECT_URI.',
      );
    }
    return { appId, secret, redirectUri };
  }

  async obterAuthUrl(negocioId: string): Promise<string> {
    const { appId, redirectUri } = this.creds;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: appId,
      redirect_uri: redirectUri,
      state: negocioId,
    });
    return `https://auth.mercadolibre.com.br/authorization?${params.toString()}`;
  }

  async callback(negocioId: string, code: string) {
    const { appId, secret, redirectUri } = this.creds;
    if (!code) throw new BadRequestException('Código de autorização ausente');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: appId,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
    });

    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new BadRequestException(`Falha ao autenticar no Mercado Livre: ${data.error_description || data.error || res.status}`);
    }

    const expiresAt = new Date(Date.now() + (data.expires_in || 21600) * 1000);
    return this.prisma.integracaoMercadoLivre.upsert({
      where: { negocioId },
      create: {
        negocioId,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresAt,
      },
      update: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || undefined,
        expiresAt,
      },
    });
  }

  async status(negocioId: string) {
    const integ = await this.prisma.integracaoMercadoLivre.findUnique({ where: { negocioId } });
    if (!integ) return { conectado: false };
    const expirado = integ.expiresAt ? new Date(integ.expiresAt) < new Date() : false;
    return { conectado: true, expirado };
  }

  async obterToken(negocioId: string): Promise<string> {
    let integ = await this.prisma.integracaoMercadoLivre.findUnique({ where: { negocioId } });
    if (!integ) {
      throw new NotFoundException('Mercado Livre não conectado para este negócio');
    }

    const expirado = integ.expiresAt ? new Date(integ.expiresAt) < new Date() : true;
    if (expirado && integ.refreshToken) {
      integ = await this.refrescarToken(integ);
    }

    return integ.accessToken;
  }

  private async refrescarToken(integ: any) {
    const { appId, secret, redirectUri } = this.creds;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: appId,
      client_secret: secret,
      refresh_token: integ.refreshToken,
      redirect_uri: redirectUri,
    });

    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new BadRequestException(`Falha ao renovar token do Mercado Livre`);
    }

    const expiresAt = new Date(Date.now() + (data.expires_in || 21600) * 1000);
    return this.prisma.integracaoMercadoLivre.update({
      where: { id: integ.id },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || integ.refreshToken,
        expiresAt,
      },
    });
  }

  async buscarImagemProduto(negocioId: string, nome: string): Promise<string | null> {
    const token = await this.obterToken(negocioId);
    const q = nome.length > 60 ? nome.slice(0, 60) : nome;
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=1`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results?.[0]?.secure_thumbnail || data?.results?.[0]?.thumbnail || null;
  }
}
