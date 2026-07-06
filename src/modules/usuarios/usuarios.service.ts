import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../infra/database/prisma.service';
import { CriarUsuarioDto } from './dto/criar-usuario.dto';
import { AtualizarUsuarioDto } from './dto/atualizar-usuario.dto';

@Injectable()
export class UsuariosService {
  private readonly SALT_ROUNDS = 12;

  constructor(private prisma: PrismaService) {}

  async create(dto: CriarUsuarioDto) {
    const existing = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const senhaHash = await bcrypt.hash(dto.senha, this.SALT_ROUNDS);

    return this.prisma.usuario.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        senhaHash,
      },
      select: { id: true, nome: true, email: true, criadoEm: true },
    });
  }

  async findAll() {
    return this.prisma.usuario.findMany({
      select: { id: true, nome: true, email: true, ativo: true, criadoEm: true },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nome: true, email: true, avatarUrl: true, ativo: true, criadoEm: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async update(id: string, dto: AtualizarUsuarioDto) {
    const data: any = {};
    if (dto.nome) data.nome = dto.nome;
    if (dto.email) data.email = dto.email;
    if (dto.senha) data.senhaHash = await bcrypt.hash(dto.senha, this.SALT_ROUNDS);

    return this.prisma.usuario.update({
      where: { id },
      data,
      select: { id: true, nome: true, email: true, ativo: true },
    });
  }

  async remove(id: string) {
    await this.prisma.usuario.update({
      where: { id },
      data: { ativo: false },
    });
  }
}
