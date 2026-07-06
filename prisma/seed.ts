import "dotenv/config";
import { PrismaClient, RoleNegocio } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL });

async function main() {
  const senhaHash = await bcrypt.hash('admin123', 12);

  const usuario = await prisma.usuario.upsert({
    where: { email: 'walker@ws.com' },
    update: {},
    create: {
      nome: 'Waalker',
      email: 'walker@ws.com',
      senhaHash,
    },
  });

  const negocio = await prisma.negocio.upsert({
    where: { slug: 'walker-salgados' },
    update: {},
    create: {
      nome: 'Walker Salgados',
      slug: 'walker-salgados',
      descricao: 'Salgados artesanais e delivery',
    },
  });

  await prisma.membroNegocio.upsert({
    where: { usuarioId_negocioId: { usuarioId: usuario.id, negocioId: negocio.id } },
    update: { role: RoleNegocio.SUPER_ADMIN },
    create: {
      usuarioId: usuario.id,
      negocioId: negocio.id,
      role: RoleNegocio.SUPER_ADMIN,
    },
  });

  console.log('Seed concluído com sucesso!');
  console.log('────────────────────────────');
  console.log(`SuperAdmin: walker@ws.com`);
  console.log(`Senha:      admin123`);
  console.log(`Negócio:    ${negocio.nome} (${negocio.slug})`);
  console.log('────────────────────────────');
}
main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
