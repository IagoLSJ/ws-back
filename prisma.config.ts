import "dotenv/config";
import { defineConfig } from "prisma/config";

const isAccelerate = (process.env.DATABASE_URL || '').startsWith('prisma://');

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node prisma/seed.ts",
  },
  datasource: {
    url: isAccelerate ? process.env.DIRECT_URL! : process.env.DATABASE_URL!,
  },
});
