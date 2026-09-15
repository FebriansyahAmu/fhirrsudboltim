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
//      5. `simgosReconcileEncounterFinished` — UPDATE `encounter.status`→
//         'finished' (+ period.end via `getPeriode`) utk encounter yang benar-
//         benar selesai (kunjungan inti KELUAR & STATUS=2 + ada diagnosa);
//         sumber SIMGOS cuma punya flag Aktif/Batal, tak pernah 'finished'.
//      6. `simgosReconcileEncounterDiagnosis` — UPDATE `encounter.diagnosis`
//         dari Condition terkirim (SALINAN blok trigger `encounter_before_
//         update`), utk encounter yg diagnosis-nya NULL; tanpa menyentuh
//         `send` → tak mengklobber status. Cegah Rule 10457.
//      7. `simgosRevertEncounterInProgress` — UPDATE `encounter.status` dari
//         'finished' KEMBALI ke status asli (`getStatusPendaftaran`) utk
//         encounter yg ditandai finished TAPI tanpa Condition terkirim (tak
//         akan bisa dikirim finished). Tanpa `send`. Menegakkan finished ⟺
//         ada Condition terkirim.
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

/**
 * Ambang durasi kunjungan yang WAJAR per kelas, dalam JAM (ekspresi SQL;
 * encounter di-alias `e`). Dipakai memvalidasi MASUK→KELUAR baris kunjungan inti
 * sebelum menaikkan status → 'finished': rawat inap (IMP) ≤ 8 hari; gawat darurat
 * (EMER) & rawat jalan (AMB) ≤ 2 hari. Melebihi ambang = TIDAK WAJAR (indikasi
 * salah input tanggal) → TIDAK di-finished, disisihkan untuk ditinjau. Satu
 * sumber-kebenaran: dipakai oleh UPDATE reconcile & kueri daftar anomali.
 */
export const ENCOUNTER_SANE_MAX_HOURS_SQL =
  "24 * (CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(e.`class`, '$.code')) = 'IMP' " +
  "THEN 8 ELSE 2 END)";

/**
 * Tulis TERSANKSI ke-5: setel `encounter.status` = 'finished' (+ `period`
 * lengkap dgn end) untuk encounter yang BENAR-BENAR selesai — DAN durasi
 * kunjungan intinya WAJAR (lihat ENCOUNTER_SANE_MAX_HOURS_SQL).
 *
 * Kenapa perlu: `encounter.status` diisi fungsi SIMGOS `getStatusPendaftaran`
 * dari `pendaftaran.pendaftaran.STATUS`, yang HANYA flag Aktif(1)/Batal(0) —
 * tak punya state "selesai" (butuh final tagihan → STATUS=2 yang nyaris tak
 * pernah terjadi). Akibatnya ~99% encounter mandek `in-progress` walau pasien
 * sudah pulang. Kita BYPASS syarat tagihan itu & validasi selesai dari sumber
 * yang benar: baris kunjungan INTI (`REF IS NULL`) sudah `KELUAR` & `STATUS=2`,
 * DAN ada diagnosa (`medicalrecord.diagnosa`), DAN ada Condition yang SUDAH
 * TERKIRIM (punya id) untuk NOPEN tsb — sumber `Encounter.diagnosis` (Rule
 * 10457). Tanpa Condition terkirim, finished tak akan bisa dikirim → maka TIDAK
 * ditandai finished (menegakkan: status='finished' ⟺ ada Condition terkirim).
 *
 * AMAN terhadap trigger: statement TIDAK menyentuh kolom `send`, sehingga
 * gerbang `encounter_before_update` (`NEW.send=1 AND OLD.send!=NEW.send`) tak
 * aktif → status TIDAK ditimpa balik `getStatusPendaftaran`. `after_update`
 * hanya mem-`storeCoverage` (sudah jalan di tiap update, ber-handler sendiri)
 * & blok cascade-nya bergerbang `id` yang tak kita ubah. `period` dibangun
 * ulang oleh fungsi SIMGOS `getPeriode` agar format start/end IDENTIK dgn ETL.
 *
 * Statement DIKUNCI (konstanta) & idempotent (`status <> 'finished'`). `limit`
 * (opsional) → mode UJI N baris TERBARU (ORDER BY refId DESC) sebelum batch
 * penuh. Return jumlah baris ter-update.
 */
export async function simgosReconcileEncounterFinished(
  opts: { limit?: number; refIdFrom?: string; refIdTo?: string } = {},
): Promise<number> {
  const { limit, refIdFrom, refIdTo } = opts;
  // Batas rentang pada refId (= YYMMDDNNNN) — mem-scope reconcile ke jendela
  // tanggal (mis. proses per-hari). Tetap bound param → statement terkunci.
  const params: unknown[] = [];
  let dateSql = "";
  if (refIdFrom != null) {
    if (!/^\d{10}$/.test(refIdFrom))
      throw new Error("refIdFrom Encounter tidak valid");
    dateSql += " AND e.`refId` >= ?";
    params.push(refIdFrom);
  }
  if (refIdTo != null) {
    if (!/^\d{10}$/.test(refIdTo))
      throw new Error("refIdTo Encounter tidak valid");
    dateSql += " AND e.`refId` <= ?";
    params.push(refIdTo);
  }
  const base =
    "UPDATE `kemkes-ihs`.`encounter` e " +
    "SET e.`status` = 'finished', " +
    "    e.`period` = COALESCE(`kemkes-ihs`.`getPeriode`(e.`refId`), e.`period`) " +
    "WHERE e.`status` <> 'finished'" +
    dateSql +
    " AND EXISTS (SELECT 1 FROM `pendaftaran`.`kunjungan` k " +
    "  WHERE k.`NOPEN` = e.`refId` AND k.`REF` IS NULL " +
    "  AND k.`KELUAR` IS NOT NULL AND k.`STATUS` = 2 " +
    "  AND k.`KELUAR` >= k.`MASUK` " +
    "  AND TIMESTAMPDIFF(HOUR, k.`MASUK`, k.`KELUAR`) <= " +
    ENCOUNTER_SANE_MAX_HOURS_SQL +
    ") " +
    "AND EXISTS (SELECT 1 FROM `medicalrecord`.`diagnosa` d " +
    "  WHERE d.`NOPEN` = e.`refId`) " +
    // SYARAT KRITIS: hanya finish bila ADA Condition yang SUDAH TERKIRIM (punya
    // id) — sumber `diagnosis` (Rule 10457). Tanpa ini, encounter ditandai
    // finished padahal diagnosis tak akan bisa dibangun → POST/PUT ditolak. Ini
    // menegakkan aturan: status='finished' ⟺ ada Condition terkirim.
    "AND EXISTS (SELECT 1 FROM `kemkes-ihs`.`condition` co " +
    "  WHERE co.`nopen` = e.`refId` AND co.`id` IS NOT NULL)";
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    let sql = base;
    if (limit && limit > 0) {
      sql += " ORDER BY e.`refId` DESC LIMIT ?";
      params.push(limit);
    }
    const res = await conn.query(sql, params);
    return Number((res as { affectedRows?: number }).affectedRows ?? 0);
  } finally {
    conn.release();
  }
}

/**
 * Tulis TERSANKSI ke-7: KEMBALIKAN `encounter.status` dari 'finished' ke status
 * asli SIMGOS (`getStatusPendaftaran` → 'in-progress') untuk encounter yang
 * DITANDAI finished TAPI TAK punya Condition terkirim — sehingga tak akan pernah
 * bisa dikirim sebagai finished (butuh `diagnosis`, Rule 10457). Ini MEMPERBAIKI
 * data yang terlanjur salah ditandai reconcile lama (yang belum mensyaratkan
 * Condition terkirim).
 *
 * AMAN: hanya menyentuh `status` (bukan `send`) → gerbang `encounter_before_
 * update` tak aktif, tak ada rebuild/klobber. `period` DIBIARKAN (data KELUAR
 * nyata); payload in-progress otomatis membuang `period.end` di sisi baca.
 * Idempotent (`status='finished'` + NOT EXISTS Condition terkirim). `limit`
 * (opsional) → UJI N baris terbaru dulu. Return jumlah baris ter-update.
 */
export async function simgosRevertEncounterInProgress(
  opts: { limit?: number; refIdFrom?: string; refIdTo?: string } = {},
): Promise<number> {
  const { limit, refIdFrom, refIdTo } = opts;
  const params: unknown[] = [];
  let dateSql = "";
  if (refIdFrom != null) {
    if (!/^\d{10}$/.test(refIdFrom))
      throw new Error("refIdFrom Encounter tidak valid");
    dateSql += " AND e.`refId` >= ?";
    params.push(refIdFrom);
  }
  if (refIdTo != null) {
    if (!/^\d{10}$/.test(refIdTo))
      throw new Error("refIdTo Encounter tidak valid");
    dateSql += " AND e.`refId` <= ?";
    params.push(refIdTo);
  }
  const base =
    "UPDATE `kemkes-ihs`.`encounter` e " +
    "SET e.`status` = `kemkes-ihs`.`getStatusPendaftaran`(e.`refId`) " +
    "WHERE e.`status` = 'finished'" +
    dateSql +
    " AND NOT EXISTS (SELECT 1 FROM `kemkes-ihs`.`condition` co " +
    "  WHERE co.`nopen` = e.`refId` AND co.`id` IS NOT NULL)";
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    let sql = base;
    if (limit && limit > 0) {
      sql += " ORDER BY e.`refId` DESC LIMIT ?";
      params.push(limit);
    }
    const res = await conn.query(sql, params);
    return Number((res as { affectedRows?: number }).affectedRows ?? 0);
  } finally {
    conn.release();
  }
}

/**
 * SELECT (konstanta) yang MEMBANGUN `encounter.diagnosis` dari Condition yang
 * SUDAH terkirim (`id IS NOT NULL`) untuk sebuah NOPEN — SALINAN PERSIS dari
 * blok di dalam trigger `encounter_before_update`, agar hasilnya identik dgn
 * yang seharusnya dimaterialisasi SIMGOS. `use` = DD (Discharge diagnosis) via
 * `getObJectReference(4,1)`; `rank` = `medicalrecord.diagnosa.UTAMA` (1=utama,
 * 2=sekunder …). Dipakai bersama oleh writeback (di bawah) & enrichment read-
 * side. Placeholder `?` = NOPEN (refId Encounter).
 */
export const ENCOUNTER_DIAGNOSIS_BUILD_SQL =
  "SELECT JSON_ARRAYAGG(JSON_OBJECT(" +
  "  'condition', JSON_OBJECT(" +
  "    'reference', CONCAT('Condition/', co.`id`)," +
  "    'display', JSON_UNQUOTE(JSON_EXTRACT(co.`code`, '$.coding[0].display'))" +
  "  )," +
  "  'use', JSON_OBJECT('coding', JSON_ARRAY(`kemkes-ihs`.`getObJectReference`(4, 1)))," +
  "  'rank', diag.`UTAMA`" +
  ")) AS diagnosis " +
  "FROM `kemkes-ihs`.`condition` co " +
  "LEFT JOIN `medicalrecord`.`diagnosa` diag ON diag.`ID` = co.`refId` " +
  "WHERE co.`nopen` = ? AND co.`id` IS NOT NULL";

/**
 * Tulis TERSANKSI ke-6: isi `encounter.diagnosis` dari Condition yang sudah
 * terkirim, untuk encounter yang `diagnosis`-nya masih NULL.
 *
 * Kenapa perlu: `encounter.diagnosis` HANYA dibangun trigger `encounter_before_
 * update` saat `encounter.send` transisi 0→1 — kick yang datang dari
 * `condition_after_update` HANYA bila `condition.send` di-flip 1→0. Aplikasi tak
 * pernah flip itu, jadi encounter yang Condition-nya sudah terkirim tetap
 * `diagnosis` NULL → Satu Sehat menolak Encounter finished (Rule 10457
 * "Element not found: Encounter.diagnosis"). Flip send BUKAN opsi: trigger yg
 * sama akan meng-overwrite `status` balik ke `getStatusPendaftaran` (in-progress)
 * → mengklobber hasil reconcile 'finished'.
 *
 * AMAN terhadap trigger: statement TIDAK menyentuh `send` (hanya `diagnosis`),
 * jadi gerbang `encounter_before_update` (`NEW.send=1 AND OLD.send!=NEW.send`)
 * tak aktif → tak ada rebuild/klobber status maupun cascade. Idempotent
 * (`diagnosis IS NULL`), hasil IDENTIK trigger (subquery = ENCOUNTER_DIAGNOSIS_
 * BUILD_SQL). `limit` (opsional) → UJI N baris TERBARU dulu. Return jumlah baris
 * ter-update.
 */
export async function simgosReconcileEncounterDiagnosis(
  opts: { limit?: number; refIdFrom?: string; refIdTo?: string } = {},
): Promise<number> {
  const { limit, refIdFrom, refIdTo } = opts;
  const params: unknown[] = [];
  let dateSql = "";
  if (refIdFrom != null) {
    if (!/^\d{10}$/.test(refIdFrom))
      throw new Error("refIdFrom Encounter tidak valid");
    dateSql += " AND e.`refId` >= ?";
    params.push(refIdFrom);
  }
  if (refIdTo != null) {
    if (!/^\d{10}$/.test(refIdTo))
      throw new Error("refIdTo Encounter tidak valid");
    dateSql += " AND e.`refId` <= ?";
    params.push(refIdTo);
  }
  // Subquery pembangun = SALINAN trigger, dikorelasikan ke e.refId. Hanya
  // menyentuh baris yg PUNYA Condition terkirim (EXISTS) & diagnosis masih NULL.
  const base =
    "UPDATE `kemkes-ihs`.`encounter` e " +
    "SET e.`diagnosis` = (" +
    "  SELECT JSON_ARRAYAGG(JSON_OBJECT(" +
    "    'condition', JSON_OBJECT(" +
    "      'reference', CONCAT('Condition/', co.`id`)," +
    "      'display', JSON_UNQUOTE(JSON_EXTRACT(co.`code`, '$.coding[0].display'))" +
    "    )," +
    "    'use', JSON_OBJECT('coding', JSON_ARRAY(`kemkes-ihs`.`getObJectReference`(4, 1)))," +
    "    'rank', diag.`UTAMA`" +
    "  )) " +
    "  FROM `kemkes-ihs`.`condition` co " +
    "  LEFT JOIN `medicalrecord`.`diagnosa` diag ON diag.`ID` = co.`refId` " +
    "  WHERE co.`nopen` = e.`refId` AND co.`id` IS NOT NULL" +
    ") " +
    "WHERE e.`diagnosis` IS NULL" +
    dateSql +
    " AND EXISTS (SELECT 1 FROM `kemkes-ihs`.`condition` co " +
    "  WHERE co.`nopen` = e.`refId` AND co.`id` IS NOT NULL)";
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    let sql = base;
    if (limit && limit > 0) {
      sql += " ORDER BY e.`refId` DESC LIMIT ?";
      params.push(limit);
    }
    const res = await conn.query(sql, params);
    return Number((res as { affectedRows?: number }).affectedRows ?? 0);
  } finally {
    conn.release();
  }
}
