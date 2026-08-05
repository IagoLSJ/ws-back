import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
import { PrismaService } from '../../infra/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infra/cache/redis.service';

const mockPrisma = {
  usuario: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

const mockJwt = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
  verify: jest.fn(),
  sign: jest.fn(),
};

const mockConfig = {
  get: jest.fn(() => 'secret'),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: typeof mockPrisma;
  let jwt: typeof mockJwt;
  let redis: typeof mockRedis;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwt = module.get(JwtService);
    redis = module.get(RedisService);

    jest.clearAllMocks();

    mockPrisma.auditLog.create.mockResolvedValue({});
    mockJwt.sign.mockReturnValue('access-token');
    mockPrisma.refreshToken.create.mockResolvedValue({});
  });

  const usuarioBase = {
    id: 'u1',
    nome: 'João Silva',
    email: 'joao@exemplo.com',
    senhaHash: 'hash-da-senha',
    ativo: true,
    avatarUrl: null,
    criadoEm: new Date(),
  };

  describe('login', () => {
    it('deve lançar UnauthorizedException quando a senha estiver errada', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ email: 'joao@exemplo.com', senha: 'errada' } as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException quando usuário não existir', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'nao-existe@exemplo.com', senha: '123456' } as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException quando conta estiver desativada', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({ ...usuarioBase, ativo: false });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login({ email: 'joao@exemplo.com', senha: '123456' } as any))
        .rejects.toThrow('Conta desativada');
    });

    it('deve retornar usuário e tokens no login com sucesso', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: 'joao@exemplo.com', senha: '123456' } as any, '127.0.0.1', 'jest');

      expect(result.user).toEqual({ id: 'u1', nome: 'João Silva', email: 'joao@exemplo.com' });
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
      expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1', email: 'joao@exemplo.com' }, expect.any(Object));
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: { usuarioId: 'u1', acao: 'LOGIN', ip: '127.0.0.1', userAgent: 'jest' },
      });
    });
  });

  describe('refresh', () => {
    it('deve lançar UnauthorizedException quando o refresh token for inválido', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('token inválido');
      });

      await expect(service.refresh({ refreshToken: 'token-invalido' } as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException quando token não estiver armazenado', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'u1', email: 'joao@exemplo.com' });
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh({ refreshToken: 'token' } as any))
        .rejects.toThrow(UnauthorizedException);
    });

    it('deve revogar token antigo e gerar novos tokens', async () => {
      const stored = {
        id: 'rt1',
        token: 'token-válido',
        revogado: false,
        expiresAt: new Date(Date.now() + 86400000),
      };
      mockJwt.verify.mockReturnValue({ sub: 'u1', email: 'joao@exemplo.com' });
      mockPrisma.refreshToken.findUnique.mockResolvedValue(stored);

      const result = await service.refresh({ refreshToken: 'token-válido' });

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt1' },
        data: { revogado: true },
      });
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('recuperarSenha', () => {
    it('deve retornar mensagem genérica quando e-mail não existir', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      const result = await service.recuperarSenha({ email: 'nao-existe@exemplo.com' });

      expect(result.message).toBe('Se o e-mail existir, um link será enviado.');
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('deve gerar token de redefinição quando e-mail existir', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);

      const result = await service.recuperarSenha({ email: 'joao@exemplo.com' });

      expect(redis.setex).toHaveBeenCalledWith(expect.stringContaining('password-reset:'), 1800, 'u1');
      expect(result.message).toBe('Se o e-mail existir, um link será enviado.');
    });
  });

  describe('redefinirSenha', () => {
    it('deve lançar BadRequestException quando o token for inválido ou expirado', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.redefinirSenha({ token: 'token-invalido', novaSenha: '654321' } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('deve redefinir senha com sucesso', async () => {
      redis.get.mockResolvedValue('u1');
      (bcrypt.hash as jest.Mock).mockResolvedValue('novo-hash');

      const result = await service.redefinirSenha({ token: 'token-válido', novaSenha: '654321' } as any);

      expect(bcrypt.hash).toHaveBeenCalledWith('654321', 12);
      expect(mockPrisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { senhaHash: 'novo-hash' },
      });
      expect(redis.del).toHaveBeenCalledWith('password-reset:token-válido');
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { usuarioId: 'u1', revogado: false },
        data: { revogado: true },
      });
      expect(result.message).toBe('Senha redefinida com sucesso.');
    });
  });

  describe('getMe', () => {
    it('deve retornar o usuário com seus negócios', async () => {
      const me = { ...usuarioBase, membros: [{ negocio: { id: 'n1', nome: 'Lanchonete', slug: 'lanchonete', logoUrl: null } }] };
      mockPrisma.usuario.findUnique.mockResolvedValue(me);

      const result = await service.getMe('u1');

      expect(result!.id).toBe('u1');
      expect(result!.membros[0].negocio.nome).toBe('Lanchonete');
      expect(mockPrisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: expect.objectContaining({ id: true, nome: true, email: true }),
      });
    });
  });
});
