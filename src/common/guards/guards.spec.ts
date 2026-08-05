import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { BusinessAccessGuard } from './business-access.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../../infra/database/prisma.service';

function ctx(user: any, params: any = {}) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  } as any;
}

const mockPrisma = {
  membroNegocio: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
};

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get(Reflector);
    jest.clearAllMocks();
  });

  it('permite quando não há roles requeridas', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    await expect(guard.canActivate(ctx({ id: 'u1' }))).resolves.toBe(true);
  });

  it('permite SUPER_ADMIN sempre', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['OPERADOR']);
    await expect(guard.canActivate(ctx({ id: 'u1', role: 'SUPER_ADMIN' }))).resolves.toBe(true);
  });

  it('permite operador para role GERENTE? não (hierarquia)', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['GERENTE']);
    await expect(guard.canActivate(ctx({ id: 'u1', role: 'OPERADOR' }))).resolves.toBe(false);
  });

  it('permite GERENTE quando role requerida é OPERADOR', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['OPERADOR']);
    await expect(guard.canActivate(ctx({ id: 'u1', role: 'GERENTE' }))).resolves.toBe(true);
  });

  it('usa membros quando user.role não veio', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['GERENTE']);
    mockPrisma.membroNegocio.findMany.mockResolvedValue([{ role: 'SUPER_ADMIN' }]);
    await expect(guard.canActivate(ctx({ id: 'u1' }))).resolves.toBe(true);
  });
});

describe('BusinessAccessGuard', () => {
  let guard: BusinessAccessGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BusinessAccessGuard, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    guard = module.get<BusinessAccessGuard>(BusinessAccessGuard);
    jest.clearAllMocks();
  });

  it('permite sem businessId ou userId', async () => {
    await expect(guard.canActivate(ctx({ id: 'u1' }, {}))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(undefined, { businessId: 'n1' }))).resolves.toBe(true);
  });

  it('SUPER_ADMIN acessa e define role', async () => {
    mockPrisma.membroNegocio.findFirst.mockResolvedValue({ id: 'm1', role: 'SUPER_ADMIN' });
    const request: any = { user: { id: 'u1' }, params: { businessId: 'n1' } };
    const res = await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any);
    expect(res).toBe(true);
    expect(request.user.role).toBe('SUPER_ADMIN');
  });

  it('membro ativo acessa e define role', async () => {
    mockPrisma.membroNegocio.findFirst.mockResolvedValue(null);
    mockPrisma.membroNegocio.findUnique.mockResolvedValue({ id: 'm2', role: 'OPERADOR', ativo: true });
    const request: any = { user: { id: 'u1' }, params: { businessId: 'n1' } };
    const res = await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any);
    expect(res).toBe(true);
    expect(request.user.role).toBe('OPERADOR');
  });

  it('lança Forbidden para não-membro', async () => {
    mockPrisma.membroNegocio.findFirst.mockResolvedValue(null);
    mockPrisma.membroNegocio.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(ctx({ id: 'u1' }, { businessId: 'n1' }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard, { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } }],
    }).compile();
    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    reflector = module.get(Reflector);
    jest.clearAllMocks();
  });

  it('permite rotas públicas sem chamar passport', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    expect(guard.canActivate(ctx({}))).toBe(true);
  });

  it('handleRequest lança Unauthorized sem user', () => {
    expect(() => (guard as any).handleRequest(null, null)).toThrow();
  });
});
