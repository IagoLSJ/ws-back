import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsuariosService } from './usuarios.service';
import { PrismaService } from '../../infra/database/prisma.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

const mockPrisma = {
  usuario: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('UsuariosService', () => {
  let service: UsuariosService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('deve lançar ConflictException quando o e-mail já estiver cadastrado', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'u1', email: 'joao@exemplo.com' });

      await expect(service.create({ nome: 'João', email: 'joao@exemplo.com', senha: '123456' } as any))
        .rejects.toThrow(ConflictException);

      expect(mockPrisma.usuario.create).not.toHaveBeenCalled();
    });

    it('deve criar usuário com senha hasheada via bcrypt', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash-bcrypt');
      mockPrisma.usuario.create.mockResolvedValue({ id: 'u1', nome: 'João', email: 'joao@exemplo.com', criadoEm: new Date() });

      const result = await service.create({ nome: 'João', email: 'joao@exemplo.com', senha: '123456' } as any);

      expect(bcrypt.hash).toHaveBeenCalledWith('123456', 12);
      expect(mockPrisma.usuario.create).toHaveBeenCalledWith({
        data: { nome: 'João', email: 'joao@exemplo.com', senhaHash: 'hash-bcrypt' },
        select: { id: true, nome: true, email: true, criadoEm: true },
      });
      expect(result.email).toBe('joao@exemplo.com');
    });
  });

  describe('findAll', () => {
    it('deve retornar todos os usuários ordenados por criação', async () => {
      const usuarios = [{ id: 'u1', nome: 'João', email: 'joao@exemplo.com', ativo: true, criadoEm: new Date() }];
      mockPrisma.usuario.findMany.mockResolvedValue(usuarios);

      const result = await service.findAll();

      expect(mockPrisma.usuario.findMany).toHaveBeenCalledWith({
        select: { id: true, nome: true, email: true, ativo: true, criadoEm: true },
        orderBy: { criadoEm: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('deve lançar NotFoundException quando usuário não existir', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar o usuário', async () => {
      const usuario = { id: 'u1', nome: 'João', email: 'joao@exemplo.com', avatarUrl: null, ativo: true, criadoEm: new Date() };
      mockPrisma.usuario.findUnique.mockResolvedValue(usuario);

      const result = await service.findOne('u1');

      expect(result.id).toBe('u1');
    });
  });

  describe('update', () => {
    it('deve atualizar nome e ativo', async () => {
      mockPrisma.usuario.update.mockResolvedValue({ id: 'u1', nome: 'Novo Nome', email: 'joao@exemplo.com', ativo: false });

      const result = await service.update('u1', { nome: 'Novo Nome', ativo: false } as any);

      expect(mockPrisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { nome: 'Novo Nome', ativo: false },
        select: { id: true, nome: true, email: true, ativo: true },
      });
      expect(result.nome).toBe('Novo Nome');
    });

    it('deve hashear a senha quando informada na atualização', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('novo-hash');
      mockPrisma.usuario.update.mockResolvedValue({ id: 'u1', nome: 'João', email: 'joao@exemplo.com', ativo: true });

      await service.update('u1', { senha: '654321' } as any);

      expect(bcrypt.hash).toHaveBeenCalledWith('654321', 12);
      expect(mockPrisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ senhaHash: 'novo-hash' }) }),
      );
    });
  });
});
