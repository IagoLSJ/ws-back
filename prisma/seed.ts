import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL });

async function main() {
  const senhaHash = await bcrypt.hash('admin123', 12);

  const superAdmin = await prisma.usuario.upsert({
    where: { email: 'walker@ws.com' },
    update: {},
    create: {
      nome: 'Waalker',
      email: 'walker@ws.com',
      senhaHash,
    },
  });
  console.log('Seed concluído com sucesso!');
  console.log('────────────────────────────');
  console.log(`SuperAdmin: walker@ws.com`);
  console.log(`Senha:      admin123`);
  console.log('────────────────────────────');
}
main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
