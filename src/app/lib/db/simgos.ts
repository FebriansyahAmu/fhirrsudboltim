// lib/db/simgos.ts
// ─────────────────────────────────────────────────────────────
// Koneksi READ-ONLY ke database SIMGOS (`kemkes-ihs` dkk).
//
// 🔒 KEBIJAKAN: koneksi ini HANYA untuk membaca. `simgosQuery`
//    menolak SQL apa pun selain SELECT / WITH / SHOW sebagai
//    pertahanan berlapis. Tidak ada INSERT/UPDATE/DELETE/DDL.
//    Perubahan ke SIMGOS hanya lewat jalur terpisah yang disetujui.
//
// Sumber koneksi: env DATABASE_URL_SIMGOS.
// ─────────────────────────────────────────────────────────────

import mariadb from "mariadb";

const globalForSimgos = globalThis as unknown as {
  __simgosPool?: mariadb.Pool;
};

function getPool(): mariadb.Pool {
  if (globalForSimgos.__simgosPool) return globalForSimgos.__simgosPool;

  const url = process.env.DATABASE_URL_SIMGOS;
  if (!url) {
    throw new Error("DATABASE_URL_SIMGOS belum diset di environment");
  }

  const u = new URL(url);
  const pool = mariadb.createPool({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    connectionLimit: 3,
    multipleStatements: false, // cegah stacked queries
    bigIntAsNumber: true,
    allowPublicKeyRetrieval: true,
    connectTimeout: 15000,
  });

  globalForSimgos.__simgosPool = pool;
  return pool;
}

/** Hanya izinkan kueri baca. */
function assertReadOnly(sql: string): void {
  const head = sql.trimStart().slice(0, 8).toLowerCase();
  const ok = head.startsWith("select") || head.startsWith("with") || head.startsWith("show");
  if (!ok) {
    throw new Error(
      "Koneksi SIMGOS bersifat read-only: hanya SELECT/WITH/SHOW yang diizinkan",
    );
  }
}

/**
 * Jalankan kueri baca ke SIMGOS. Menolak non-SELECT.
 * `params` di-bind sebagai prepared statement (aman dari injeksi).
 */
export async function simgosQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertReadOnly(sql);
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const rows = await conn.query(sql, params);
    return rows as T[];
  } finally {
    conn.release();
  }
}
