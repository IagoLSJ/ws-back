import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { MembrosService } from './membros.service';
import { PrismaService } from '../../infra/database/prisma.service';
import { RoleNegocio } from '@prisma/client';

const mockPrisma = {
  usuario: {
    findUnique: jest.fn(),
  },
  membroNegocio: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('MembrosService', () => {
  let service: MembrosService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembrosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MembrosService>(MembrosService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('convidar', () => {
    it('deve lançar NotFoundException quando o usuário não existir', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.convidar('n1', { email: 'inexistente@email.com', role: RoleNegocio.OPERADOR } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException ao tentar atribuir SUPER_ADMIN', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'u1' });

      await expect(
        service.convidar('n1', { email: 'a@b.com', role: RoleNegocio.SUPER_ADMIN } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ConflictException quando o usuário já é membro do negócio', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.membroNegocio.findUnique.mockResolvedValue({ id: 'm1' });

      await expect(
        service.convidar('n1', { email: 'a@b.com', role: RoleNegocio.OPERADOR } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('deve convidar o usuário com sucesso', async () => {
      const criado = {
        id: 'm1',
        usuarioId: 'u1',
        negocioId: 'n1',
        role: RoleNegocio.OPERADOR,
        ativo: true,
        usuario: { id: 'u1', nome: 'Ana', email: 'ana@b.com' },
      };
      mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'u1', nome: 'Ana', email: 'ana@b.com' });
      mockPrisma.membroNegocio.findUnique.mockResolvedValue(null);
      mockPrisma.membroNegocio.create.mockResolvedValue(criado);

      const result = await service.convidar('n1', { email: 'ana@b.com', role: RoleNegocio.OPERADOR } as any);

      expect(result.id).toBe('m1');
      expect(mockPrisma.membroNegocio.create).toHaveBeenCalledWith({
        data: { usuarioId: 'u1', negocioId: 'n1', role: RoleNegocio.OPERADOR },
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      });
    });
  });

  describe('findAll', () => {
    it('deve listar os membros do negócio', async () => {
      const membros = [
        { id: 'm1', usuarioId: 'u1', negocioId: 'n1', role: RoleNegocio.GERENTE, ativo: true, usuario: { id: 'u1', nome: 'Ana', email: 'ana@b.com', avatarUrl: null } },
      ];
      mockPrisma.membroNegocio.findMany.mockResolvedValue(membros);

      const result = await service.findAll('n1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.membroNegocio.findMany).toHaveBeenCalledWith({
        where: { negocioId: 'n1' },
        include: { usuario: { select: { id: true, nome: true, email: true, avatarUrl: true } } },
        orderBy: { criadoEm: 'desc' },
      });
    });
  });

  describe('update', () => {
    it('deve lançar NotFoundException quando o membro não existir', async () => {
      mockPrisma.membroNegocio.findFirst.mockResolvedValue(null);

      await expect(
        service.update('n1', 'm1', { role: RoleNegocio.OPERADOR } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException ao atribuir SUPER_ADMIN', async () => {
      mockPrisma.membroNegocio.findFirst.mockResolvedValue({ id: 'm1', negocioId: 'n1' });

      await expect(
        service.update('n1', 'm1', { role: RoleNegocio.SUPER_ADMIN } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve atualizar a role do membro com sucesso', async () => {
      const atualizado = {
        id: 'm1',
        usuarioId: 'u1',
        negocioId: 'n1',
        role: RoleNegocio.GERENTE,
        ativo: true,
        usuario: { id: 'u1', nome: 'Ana', email: 'ana@b.com' },
      };
      mockPrisma.membroNegocio.findFirst.mockResolvedValue({ id: 'm1', negocioId: 'n1' });
      mockPrisma.membroNegocio.update.mockResolvedValue(atualizado);

      const result = await service.update('n1', 'm1', { role: RoleNegocio.GERENTE } as any);

      expect(result.role).toBe(RoleNegocio.GERENTE);
      expect(mockPrisma.membroNegocio.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { role: RoleNegocio.GERENTE, ativo: undefined },
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      });
    });
  });

  describe('remove', () => {
    it('deve lançar NotFoundException quando o membro não existir', async () => {
      mockPrisma.membroNegocio.findFirst.mockResolvedValue(null);

      await expect(service.remove('n1', 'm1')).rejects.toThrow(NotFoundException);
    });

    it('deve remover o membro com sucesso', async () => {
      mockPrisma.membroNegocio.findFirst.mockResolvedValue({ id: 'm1', negocioId: 'n1' });
      mockPrisma.membroNegocio.delete.mockResolvedValue({ id: 'm1' });

      await expect(service.remove('n1', 'm1')).resolves.toBeUndefined();
      expect(mockPrisma.membroNegocio.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });
});
