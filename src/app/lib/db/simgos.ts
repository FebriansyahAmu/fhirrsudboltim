// lib/db/simgos.ts
// ─────────────────────────────────────────────────────────────
// Koneksi ke database SIMGOS (`kemkes-ihs` dkk).
//
// 🔒 KEBIJAKAN: koneksi ini PADA DASARNYA read-only. `simgosQuery`
//    dipakai untuk baca (SELECT / WITH / SHOW). Pengecualian tulis
//    yang tersanksi (statement DIKUNCI konstanta + param di-bind):
//      1. `simgosExecute` — UPDATE saja (write-back IHS `id`, flip send).
//      2. `simgosInsertEncounterRefId` — INSERT `encounter(refId)` saja,
//         untuk membuat Encounter ranap yang di-skip ETL SIMGOS.
//      3. `simgosCallEpisodeOfCare` — CALL proc `episodeOfCare` (INSERT eof).
//      4. `simgosInsertSpecimenForServiceRequest` /
//         `simgosReconcileMissingLabSpecimens` — INSERT `specimen(refId,nopen)`
//         (MENYALIN persis statement trigger `service_request_after_update`)
//         untuk order lab TANPA petugas (performer null) yang tak pernah
//         memicu trigger; trigger `specimen_before_insert` membangun sisanya.
//    Selain fungsi-fungsi itu, INSERT / DELETE / DDL (DROP/ALTER/
//    TRUNCATE/REPLACE, dll.) TETAP DITOLAK oleh `assertAllowedStatement`
//    sebagai pertahanan berlapis, dan `multipleStatements:false`
//    mencegah stacked queries.
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

/**
 * Tulis TERSANKSI ke-2: buat baris Encounter di staging hanya dgn `refId`.
 * Trigger SIMGOS `encounter_before_insert` membangun seluruh kolom (class,
 * subject, period, participant, dst.) dari refId — sama seperti ETL bawaan
 * (`pendaftaranToEncounter`). Dipakai untuk MEMBUAT Encounter rawat-inap yang
 * di-skip ETL karena `PENDAFTARAN_MASUK_NOMOR` terisi (IGD→ranap) sehingga
 * jenis kunjungan EMER & IMP masing-masing punya Encounter sendiri.
 *
 * Statement DIKUNCI (konstanta, satu kolom, parameterized) → tidak melewati
 * jalur SQL dinamis. INSERT sembarang tetap ditolak.
 */
export async function simgosInsertEncounterRefId(refId: string): Promise<number> {
  if (!/^\d{10}$/.test(refId)) {
    throw new Error("refId Encounter tidak valid untuk INSERT");
  }
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const res = await conn.query(
      "INSERT INTO `kemkes-ihs`.`encounter` (`refId`) VALUES (?)",
      [refId],
    );
    return Number((res as { affectedRows?: number }).affectedRows ?? 0);
  } finally {
    conn.release();
  }
}

/**
 * Tulis TERSANKSI ke-3: bangun baris EpisodeOfCare di staging via CALL
 * procedure `episodeOfCare(PID, PNOPEN)` — yang meng-INSERT `eof` bila belum
 * ada (proc ber-`IF NOT EXISTS`, jadi idempotent).
 *
 * Kenapa perlu dipanggil dari sini: trigger SIMGOS `condition_after_update`
 * yang SEHARUSNYA memanggil proc ini punya guard null-unsafe
 * (`NEW.id != OLD.id`; pada kirim pertama id `NULL→uuid` → `uuid != NULL` =
 * NULL = false), sehingga proc TAK PERNAH tereksekusi & tabel `eof` kosong
 * total. Fungsi ini menutup celah itu: dipanggil untuk Condition (diagnosis
 * UTAMA) yang KODE-nya terpetakan di `diagnosa_to_eof` DAN sudah terkirim.
 * Kelayakan divalidasi oleh pemanggil (episode-of-care-writeback) via BACA,
 * bukan di sini.
 *
 * Statement DIKUNCI (konstanta, satu proc, parameterized). `refId` = int (PK
 * `medicalrecord.diagnosa`), `nopen` = 10 digit. CALL sembarang tetap ditolak
 * pada `simgosQuery`/`simgosExecute` (bukan SELECT/UPDATE).
 */
export async function simgosCallEpisodeOfCare(
  refId: number,
  nopen: string,
): Promise<void> {
  if (!Number.isInteger(refId) || refId <= 0) {
    throw new Error("refId EpisodeOfCare tidak valid untuk CALL");
  }
  if (!/^\d{10}$/.test(nopen)) {
    throw new Error("nopen EpisodeOfCare tidak valid untuk CALL");
  }
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.query("CALL `kemkes-ihs`.`episodeOfCare`(?, ?)", [refId, nopen]);
  } finally {
    conn.release();
  }
}

/** Pola UUID (id Satu Sehat) — hanya order yang BENAR terkirim yang diproses. */
const IHS_UUID_REGEX =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

/**
 * Tulis TERSANKSI ke-4: bangun baris `specimen` untuk SATU order lab yang SUDAH
 * terkirim (`service_request.id` = UUID) namun belum punya specimen — kasus order
 * TANPA petugas (performer null). Trigger `service_request_before_update` memaksa
 * `send=0` pada order semacam ini di SETIAP update, sehingga penulisan id tak
 * pernah menghasilkan transisi send 1→0 dan trigger `service_request_after_update`
 * (pembangun specimen) TAK PERNAH menyala.
 *
 * Statement DIKUNCI (konstanta) & SELF-GATING: hanya menyisip bila SR-nya lab
 * (tindakan JENIS=8), sudah ber-id UUID, dan belum ada specimen (NOT EXISTS). Ini
 * MENYALIN persis INSERT milik trigger (`INSERT INTO specimen(refId,nopen)`);
 * trigger `specimen_before_insert` membangun sisa kolomnya (termasuk
 * `request=ServiceRequest/<id>` karena id sudah ada). Idempotent — `refId` di-bind.
 * Return jumlah baris tersisip (0/1). Tidak menyentuh trigger/procedure apa pun.
 */
export async function simgosInsertSpecimenForServiceRequest(
  refId: string,
): Promise<number> {
  if (!/^[A-Za-z0-9]{1,20}$/.test(refId)) {
    throw new Error("refId Specimen tidak valid untuk INSERT");
  }
  const sql =
    "INSERT INTO `kemkes-ihs`.`specimen` (`refId`, `nopen`) " +
    "SELECT sr.`refId`, sr.`nopen` " +
    "FROM `kemkes-ihs`.`service_request` sr " +
    "JOIN `layanan`.`tindakan_medis` tm ON tm.`ID` = sr.`refId` " +
    "JOIN `master`.`tindakan` t ON t.`ID` = tm.`TINDAKAN` " +
    "WHERE sr.`refId` = ? AND sr.`id` REGEXP ? AND t.`JENIS` = 8 " +
    "AND NOT EXISTS (SELECT 1 FROM `kemkes-ihs`.`specimen` sp " +
    "WHERE sp.`refId` = sr.`refId` AND sp.`nopen` = sr.`nopen`)";
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const res = await conn.query(sql, [refId, IHS_UUID_REGEX]);
    return Number((res as { affectedRows?: number }).affectedRows ?? 0);
  } finally {
    conn.release();
  }
}

/**
 * Tulis TERSANKSI ke-4 (varian RECONCILE): bangun `specimen` untuk SEMUA order
 * lab terkirim (id UUID, JENIS=8) yang belum punya specimen — menutup tunggakan
 * order performer-null yang tak pernah memicu trigger. `limit` (opsional) → mode
 * UJI N baris TERBARU (ORDER BY nopen DESC) sebelum batch penuh. Statement DIKUNCI,
 * self-gating & idempotent (NOT EXISTS). Return jumlah specimen tersisip.
 */
export async function simgosReconcileMissingLabSpecimens(
  limit?: number,
): Promise<number> {
  const base =
    "INSERT INTO `kemkes-ihs`.`specimen` (`refId`, `nopen`) " +
    "SELECT sr.`refId`, sr.`nopen` " +
    "FROM `kemkes-ihs`.`service_request` sr " +
    "JOIN `layanan`.`tindakan_medis` tm ON tm.`ID` = sr.`refId` " +
    "JOIN `master`.`tindakan` t ON t.`ID` = tm.`TINDAKAN` " +
    "WHERE sr.`id` REGEXP ? AND t.`JENIS` = 8 " +
    "AND NOT EXISTS (SELECT 1 FROM `kemkes-ihs`.`specimen` sp " +
    "WHERE sp.`refId` = sr.`refId` AND sp.`nopen` = sr.`nopen`)";
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const res =
      limit && limit > 0
        ? await conn.query(base + " ORDER BY sr.`nopen` DESC LIMIT ?", [
            IHS_UUID_REGEX,
            limit,
          ])
        : await conn.query(base, [IHS_UUID_REGEX]);
    return Number((res as { affectedRows?: number }).affectedRows ?? 0);
  } finally {
    conn.release();
  }
}
