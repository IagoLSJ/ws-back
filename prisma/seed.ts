import { PrismaClient, RoleNegocio, ProdutoStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash('admin123', 12);

  const superAdmin = await prisma.usuario.upsert({
    where: { email: 'admin@multinegocio.com' },
    update: {},
    create: {
      nome: 'Super Admin',
      email: 'admin@multinegocio.com',
      senhaHash,
    },
  });

  const negocio = await prisma.negocio.upsert({
    where: { slug: 'lanchonete-modelo' },
    update: {},
    create: {
      nome: 'Lanchonete Modelo',
      slug: 'lanchonete-modelo',
      descricao: 'Lanchonete exemplo para demonstração',
      corPrimaria: '#4F46E5',
      configuracoes: {
        create: {
          controleEstoqueAtivo: true,
          estoqueMinimoPadrao: 5,
        },
      },
    },
  });

  await prisma.membroNegocio.upsert({
    where: {
      usuarioId_negocioId: {
        usuarioId: superAdmin.id,
        negocioId: negocio.id,
      },
    },
    update: {},
    create: {
      usuarioId: superAdmin.id,
      negocioId: negocio.id,
      role: RoleNegocio.SUPER_ADMIN,
    },
  });

  const catLanches = await prisma.categoria.upsert({
    where: { negocioId_nome: { negocioId: negocio.id, nome: 'Lanches' } },
    update: {},
    create: { negocioId: negocio.id, nome: 'Lanches', ordem: 1 },
  });

  const catBebidas = await prisma.categoria.upsert({
    where: { negocioId_nome: { negocioId: negocio.id, nome: 'Bebidas' } },
    update: {},
    create: { negocioId: negocio.id, nome: 'Bebidas', ordem: 2 },
  });

  const produtos = [
    {
      nome: 'X-Burger',
      descricao: 'Hambúrguer artesanal 180g, queijo cheddar, alface, tomate',
      preco: 25.90,
      categoriaId: catLanches.id,
      status: ProdutoStatus.ATIVO,
      destaque: true,
      controlaEstoque: true,
      grupos: [
        {
          nome: 'Tamanho',
          obrigatorio: true,
          minSelecao: 1,
          maxSelecao: 1,
          opcoes: [
            { nome: 'Tradicional', precoExtra: 0 },
            { nome: 'Grande', precoExtra: 5.00 },
          ],
        },
        {
          nome: 'Adicionais',
          obrigatorio: false,
          minSelecao: 0,
          maxSelecao: 3,
          opcoes: [
            { nome: 'Bacon', precoExtra: 3.50 },
            { nome: 'Cheddar extra', precoExtra: 2.00 },
            { nome: 'Ovo', precoExtra: 2.50 },
          ],
        },
      ],
    },
    {
      nome: 'X-Salada',
      descricao: 'Hambúrguer 150g, queijo, alface, tomate, maionese',
      preco: 22.90,
      categoriaId: catLanches.id,
      status: ProdutoStatus.ATIVO,
      controlaEstoque: true,
    },
    {
      nome: 'Coca-Cola Lata',
      descricao: 'Refrigerante Coca-Cola 350ml',
      preco: 6.00,
      categoriaId: catBebidas.id,
      status: ProdutoStatus.ATIVO,
      controlaEstoque: true,
    },
    {
      nome: 'Suco Natural',
      descricao: 'Suco de laranja natural 500ml',
      preco: 8.50,
      tipoDesconto: 'PERCENTUAL',
      valorDesconto: 15.00,
      categoriaId: catBebidas.id,
      status: ProdutoStatus.ATIVO,
      controlaEstoque: true,
    },
    {
      nome: 'Batata Frita',
      descricao: 'Porção de batata frita crocante 300g',
      preco: 15.00,
      categoriaId: catLanches.id,
      status: ProdutoStatus.PAUSADO,
      controlaEstoque: true,
    },
  ];

  for (const p of produtos) {
    const { grupos, ...prodData } = p;
    const existing = await prisma.produto.findFirst({
      where: { negocioId: negocio.id, nome: p.nome },
    });

    if (!existing) {
      const produto = await prisma.produto.create({
        data: {
          ...prodData,
          preco: prodData.preco,
          tipoDesconto: prodData.tipoDesconto ?? null,
          valorDesconto: prodData.valorDesconto ?? null,
          negocioId: negocio.id,
        },
      });

      if (prodData.controlaEstoque) {
        await prisma.estoqueItem.create({
          data: {
            negocioId: negocio.id,
            produtoId: produto.id,
            quantidadeAtual: 50,
            estoqueMinimo: 5,
            unidade: 'un',
          },
        });
      }

      if (grupos) {
        for (const g of grupos) {
          await prisma.grupoModificador.create({
            data: {
              produtoId: produto.id,
              nome: g.nome,
              obrigatorio: g.obrigatorio,
              minSelecao: g.minSelecao,
              maxSelecao: g.maxSelecao,
              opcoes: {
                create: g.opcoes.map((o) => ({
                  nome: o.nome,
                  precoExtra: o.precoExtra,
                  ativo: true,
                })),
              },
            },
          });
        }
      }
    }
  }

  console.log('Seed concluído com sucesso!');
  console.log('────────────────────────────');
  console.log(`SuperAdmin: admin@multinegocio.com`);
  console.log(`Senha:      admin123`);
  console.log('────────────────────────────');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
