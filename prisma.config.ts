// prisma.config.ts
// Konfigurasi Prisma 7 — URL koneksi untuk CLI (db pull, generate, dst.)
// Dibangun dari env vars individual agar konsisten dengan lib/db/prisma.ts

import { defineConfig } from "prisma/config";

const host = process.env.DATABASE_HOST;
const port = process.env.DATABASE_PORT;
const user = process.env.DATABASE_USER;
const password = process.env.DATABASE_PASSWORD;
const database = process.env.DATABASE_NAME;

export default defineConfig({
  datasource: {
    url: `mysql://${user}:${password}@${host}:${port}/${database}`,
  },
});
