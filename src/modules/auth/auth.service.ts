import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../infra/database/prisma.service';
import { RedisService } from '../../infra/cache/redis.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RecuperarSenhaDto } from './dto/recuperar-senha.dto';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private redis: RedisService,
  ) {}

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (!usuario || !(await bcrypt.compare(dto.senha, usuario.senhaHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    if (!usuario.ativo) {
      throw new UnauthorizedException('Conta desativada');
    }

    const tokens = await this.generateTokens(usuario.id, usuario.email);

    await this.logAudit(usuario.id, 'LOGIN', ip, userAgent);

    return {
      user: { id: usuario.id, nome: usuario.nome, email: usuario.email },
      ...tokens,
    };
  }

  async refresh(dto: RefreshDto) {
    try {
      const payload = this.jwt.verify(dto.refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret')!,
      });

      const stored = await this.prisma.refreshToken.findUnique({
        where: { token: dto.refreshToken },
      });

      if (!stored || stored.revogado || stored.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token inválido ou expirado');
      }

      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revogado: true },
      });

      return this.generateTokens(payload.sub, payload.email);
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken, revogado: false },
      data: { revogado: true },
    });
  }

  async getMe(usuarioId: string) {
    return this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nome: true,
        email: true,
        avatarUrl: true,
        criadoEm: true,
        membros: {
          include: {
            negocio: { select: { id: true, nome: true, slug: true, logoUrl: true } },
          },
        },
      },
    });
  }

  private async generateTokens(usuarioId: string, email: string) {
    const payload = { sub: usuarioId, email };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.secret')!,
      expiresIn: this.config.get<string>('jwt.accessExpires')!,
    });

    const refreshTokenValue = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        usuarioId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }

  private async logAudit(usuarioId: string, acao: string, ip?: string, userAgent?: string) {
    await this.prisma.auditLog
      .create({
        data: { usuarioId, acao, ip, userAgent },
      })
      .catch(() => {});
  }

  async recuperarSenha(dto: RecuperarSenhaDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (!usuario) {
      return { message: 'Se o e-mail existir, um link será enviado.' };
    }

    const resetToken = uuidv4();
    const key = `password-reset:${resetToken}`;

    await this.redis.setex(key, 1800, usuario.id);

    return { message: 'Se o e-mail existir, um link será enviado.' };
  }

  async redefinirSenha(dto: RedefinirSenhaDto) {
    const key = `password-reset:${dto.token}`;
    const usuarioId = await this.redis.get(key);

    if (!usuarioId) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    const senhaHash = await bcrypt.hash(dto.novaSenha, this.SALT_ROUNDS);

    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { senhaHash },
    });

    await this.redis.del(key);

    await this.prisma.refreshToken.updateMany({
      where: { usuarioId, revogado: false },
      data: { revogado: true },
    });

    await this.logAudit(usuarioId, 'PASSWORD_RESET');

    return { message: 'Senha redefinida com sucesso.' };
  }
}
