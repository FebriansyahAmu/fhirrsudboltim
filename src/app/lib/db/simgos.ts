// lib/db/simgos.ts
// ─────────────────────────────────────────────────────────────
// Koneksi ke database SIMGOS (`kemkes-ihs` dkk).
//
// 🔒 KEBIJAKAN: koneksi ini PADA DASARNYA read-only. `simgosQuery`
//    dipakai untuk baca (SELECT / WITH / SHOW). SATU pengecualian
//    tulis diizinkan lewat `simgosExecute`: perintah UPDATE saja —
//    dipakai untuk write-back IHS `id` ke tabel `patient` setelah
//    POST /Patient ke Satu Sehat berhasil. INSERT / DELETE / DDL
//    (DROP/ALTER/TRUNCATE/REPLACE, dll.) TETAP DITOLAK sebagai
//    pertahanan berlapis, dan `multipleStatements:false` mencegah
//    stacked queries.
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

/**
 * Izinkan hanya statement yang disetujui: baca (SELECT/WITH/SHOW) dan
 * satu-satunya tulis (UPDATE). INSERT/DELETE/DDL tetap ditolak.
 */
function assertAllowedStatement(sql: string): void {
  const head = sql.trimStart().slice(0, 8).toLowerCase();
  const ok =
    head.startsWith("select") ||
    head.startsWith("with") ||
    head.startsWith("show") ||
    head.startsWith("update");
  if (!ok) {
    throw new Error(
      "SIMGOS: hanya SELECT/WITH/SHOW (baca) & UPDATE (write-back id) yang diizinkan",
    );
  }
}

/**
 * Jalankan kueri BACA ke SIMGOS (SELECT/WITH/SHOW). Menolak statement lain.
 * `params` di-bind sebagai prepared statement (aman dari injeksi).
 */
export async function simgosQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertAllowedStatement(sql);
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const rows = await conn.query(sql, params);
    return rows as T[];
  } finally {
    conn.release();
  }
}

/**
 * Jalankan UPDATE ke SIMGOS (satu-satunya jalur tulis yang disetujui).
 * Dibatasi keras: HANYA statement yang diawali `UPDATE`. Mengembalikan
 * jumlah baris yang terpengaruh. `params` di-bind (prepared statement).
 *
 * Dipakai untuk write-back IHS `id` ke tabel `patient`. Bukan untuk
 * INSERT/DELETE/DDL — semua itu ditolak.
 */
export async function simgosExecute(
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  assertAllowedStatement(sql);
  if (!sql.trimStart().slice(0, 6).toLowerCase().startsWith("update")) {
    throw new Error("simgosExecute hanya untuk statement UPDATE");
  }
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const res = await conn.query(sql, params);
    return Number((res as { affectedRows?: number }).affectedRows ?? 0);
  } finally {
    conn.release();
  }
}
