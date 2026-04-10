// ─────────────────────────────────────────────────────────────
//  lib/prisma.ts
//
//  Prisma client singleton — satu instance untuk seluruh app.
//  Pola ini wajib di Next.js agar tidak terjadi connection
//  exhaustion saat hot-reload di development.
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  port: Number(process.env.DATABASE_PORT),
  connectionLimit: 5,
  allowPublicKeyRetrieval: true,
});
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
