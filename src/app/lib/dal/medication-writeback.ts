// lib/dal/medication-writeback.ts
// ─────────────────────────────────────────────────────────────
// Write-back TERSANKSI seputar Medication. Ada DUA mekanisme:
//
// (1) PEMICU HILIR (utama) — `markMedicationSent` / `reconcileMedicationSendFlags`.
//     SIMGOS membuat baris `medication_request` / `medication_dispanse` LEWAT
//     trigger `medication_after_update`, yang HANYA firing saat `medication.send`
//     berpindah 1→0 sementara `id` sudah terisi (lihat body trigger). Dulu bridge
//     SIMGOS yang meng-set send=0 setelah kirim; kini pengiriman lewat app ini
//     hanya menulis `id` (writeBackClinicalResource) TANPA menyentuh `send`, jadi
//     trigger tak pernah jalan → resep/penyerahan tak pernah dibuat (mis. semua
//     Medication September nyangkut send=1, MedicationRequest = 0). Fungsi di sini
//     menutup langkah itu: setelah Medication terkirim (id ada), set `send=0` →
//     trigger membangun resep/penyerahan lengkap (termasuk `medicationReference`
//     dari `medication.id` terkini).
//
// (2) PROPAGASI REFERENSI (pelengkap) — `writeBackMedicationRefs` /
//     `reconcileMedicationRefs`. Bila baris resep/penyerahan sudah ADA tapi
//     `medicationReference`-nya basi (trigger EXISTS-path hanya set send=1, tak
//     memperbarui referensi), salin `Medication/<id>` terkini ke hilir.
//
// 🔒 Satu-satunya tulis = `simgosExecute` (UPDATE saja). Nama tabel/kolom KONSTAN
//    (bukan input), nilai di-bind, WHERE dikunci (composite key / id UUID + send).
//    Idempotent: hanya menyentuh baris yang memang perlu berubah.
// ─────────────────────────────────────────────────────────────

import { simgosExecute } from "@/app/lib/db/simgos";

const REFID_RE = /^\d{1,21}$/;
const INT_RE = /^\d{1,10}$/;
const IHS_ID_RE = /^[A-Za-z0-9.\-]{1,64}$/;
/** id resource Satu Sehat selalu UUID — saring id kotor ("null"/refId/dll). */
const UUID_RE_SQL =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

/** Tabel hilir yang merujuk Medication via `medicationReference` (KONSTAN). */
const DOWNSTREAM = ["medication_request", "medication_dispanse"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ihsIdFromResponse(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const id = typeof data.id === "string" ? data.id.trim() : "";
  return IHS_ID_RE.test(id) ? id : null;
}

/**
 * Tulis `Medication/<ihsId>` ke `medicationReference.reference` pada resep &
 * penyerahan dengan composite key (refId, barang, group_racikan) sama.
 * Return total baris ter-update di kedua tabel. `JSON_SET` menjaga `display`.
 */
export async function writeBackMedicationRefs(
  refId: string,
  barang: string,
  groupRacikan: string,
  medIhsId: string,
): Promise<number> {
  if (
    !REFID_RE.test(refId) ||
    !INT_RE.test(barang) ||
    !INT_RE.test(groupRacikan) ||
    !IHS_ID_RE.test(medIhsId)
  ) {
    return 0;
  }
  const ref = `Medication/${medIhsId}`;
  let total = 0;
  for (const tbl of DOWNSTREAM) {
    const sql =
      "UPDATE `kemkes-ihs`.`" +
      tbl +
      "` SET `medicationReference` = JSON_SET(`medicationReference`, '$.reference', ?) " +
      "WHERE `refId` = ? AND `barang` = ? AND `group_racikan` = ? " +
      "AND `medicationReference` IS NOT NULL " +
      "AND NOT (JSON_UNQUOTE(JSON_EXTRACT(`medicationReference`, '$.reference')) <=> ?)";
    total += await simgosExecute(sql, [ref, refId, barang, groupRacikan, ref]);
  }
  return total;
}

/**
 * RECONCILE MASSAL (retroaktif): untuk Medication yang SUDAH terkirim (punya
 * IHS id valid), salin id-nya ke `medicationReference` semua resep/penyerahan
 * yang merujuknya (join by composite key). DB-only (tanpa Satu Sehat). Hanya
 * menyalin id ber-format UUID; idempotent. Return total baris ter-update.
 */
export async function reconcileMedicationRefs(): Promise<number> {
  let total = 0;
  for (const tbl of DOWNSTREAM) {
    const sql =
      "UPDATE `kemkes-ihs`.`" +
      tbl +
      "` d JOIN `kemkes-ihs`.`medication` md " +
      "ON md.`refId` = d.`refId` AND md.`barang` = d.`barang` AND md.`group_racikan` = d.`group_racikan` " +
      "SET d.`medicationReference` = JSON_SET(d.`medicationReference`, '$.reference', CONCAT('Medication/', md.`id`)) " +
      "WHERE md.`id` REGEXP ? " +
      "AND d.`medicationReference` IS NOT NULL " +
      "AND NOT (JSON_UNQUOTE(JSON_EXTRACT(d.`medicationReference`, '$.reference')) <=> CONCAT('Medication/', md.`id`))";
    total += await simgosExecute(sql, [UUID_RE_SQL]);
  }
  return total;
}

/**
 * PEMICU HILIR (maju): setel `medication.send = 0` untuk satu Medication yang
 * SUDAH terkirim (id UUID valid) & masih `send=1`. Transisi 1→0 inilah yang
 * memicu trigger `medication_after_update` membuat baris `medication_request`
 * (jenis=1) / `medication_dispanse` (jenis=2) — trigger yang menentukan routing
 * jenis, jadi cukup satu UPDATE di sini. Idempotent (guard `send=1`). Return
 * jumlah baris terpengaruh (0 atau 1).
 */
export async function markMedicationSent(
  refId: string,
  barang: string,
  groupRacikan: string,
): Promise<number> {
  if (
    !REFID_RE.test(refId) ||
    !INT_RE.test(barang) ||
    !INT_RE.test(groupRacikan)
  ) {
    return 0;
  }
  const sql =
    "UPDATE `kemkes-ihs`.`medication` SET `send` = 0 " +
    "WHERE `refId` = ? AND `barang` = ? AND `group_racikan` = ? " +
    "AND `id` REGEXP ? AND `send` = 1";
  return simgosExecute(sql, [refId, barang, groupRacikan, UUID_RE_SQL]);
}

/**
 * RECONCILE MASSAL (retroaktif): flip `send=0` untuk SEMUA Medication yang sudah
 * terkirim (id UUID) tapi nyangkut `send=1` (jenis 1/2), memicu trigger membuat
 * resep/penyerahan yang hilang. `limit` opsional → mode UJI (pilot) memproses
 * hanya sekian baris TERBARU (ORDER BY nopen DESC) untuk verifikasi sebelum
 * batch penuh. DB-only; idempotent (baris yang sudah send=0 tak kena lagi).
 * Return jumlah Medication yang di-flip (≈ jumlah baris hilir yang akan dibuat).
 */
export async function reconcileMedicationSendFlags(
  limit?: number,
): Promise<number> {
  const lim = Number.isInteger(limit) && (limit as number) > 0 ? (limit as number) : 0;
  let sql =
    "UPDATE `kemkes-ihs`.`medication` SET `send` = 0 " +
    "WHERE `id` REGEXP ? AND `send` = 1 AND `jenis` IN (1, 2)";
  const paramsArr: unknown[] = [UUID_RE_SQL];
  if (lim > 0) {
    sql += " ORDER BY `nopen` DESC LIMIT ?";
    paramsArr.push(lim);
  }
  return simgosExecute(sql, paramsArr);
}

/**
 * Gerbang PEMICU HILIR: dipanggil dari route POST /api/fhir setelah Medication
 * SUKSES (2xx), SESUDAH write-back `id`. Baca `?module=medication&key=<refId>_
 * <barang>_<group_racikan>` lalu set `send=0` → trigger membuat resep/penyerahan.
 * Fire-and-forget (kegagalan tak memutus response).
 */
export async function maybeMarkMedicationSent(params: {
  searchParams: URLSearchParams;
  resource: string;
  status: number;
}): Promise<void> {
  const { searchParams, resource, status } = params;
  if (status < 200 || status >= 300) return;
  if (resource !== "Medication") return;
  if (searchParams.get("module") !== "medication") return;
  const key = searchParams.get("key");
  const m = key ? /^(\d{1,21})_(\d{1,10})_(\d{1,10})$/.exec(key) : null;
  if (!m) return;
  try {
    const n = await markMedicationSent(m[1], m[2], m[3]);
    if (n > 0) {
      console.log(
        `[medication send-flag] ${key} → send=0 (memicu pembuatan resep/penyerahan)`,
      );
    }
  } catch (err) {
    console.error(
      `[medication send-flag] gagal set send=0 utk ${key}:`,
      err,
    );
  }
}

/**
 * Gerbang: dipanggil dari route POST /api/fhir setelah Medication SUKSES (2xx).
 * Baca `?module=medication&key=<refId>_<barang>_<group_racikan>` + id dari
 * response, lalu propagasikan ke resep & penyerahan. Fire-and-forget.
 */
export async function maybeWriteBackMedicationRefs(params: {
  searchParams: URLSearchParams;
  resource: string;
  status: number;
  responseData: unknown;
}): Promise<void> {
  const { searchParams, resource, status, responseData } = params;
  if (status < 200 || status >= 300) return;
  if (resource !== "Medication") return;
  if (searchParams.get("module") !== "medication") return;
  const key = searchParams.get("key");
  const m = key ? /^(\d{1,21})_(\d{1,10})_(\d{1,10})$/.exec(key) : null;
  if (!m) return;
  const ihsId = ihsIdFromResponse(responseData);
  if (!ihsId) return;
  try {
    const n = await writeBackMedicationRefs(m[1], m[2], m[3], ihsId);
    if (n > 0) {
      console.log(
        `[medication writeback] ${key} → Medication/${ihsId} pada ${n} baris resep/penyerahan`,
      );
    }
  } catch (err) {
    console.error(
      `[medication writeback] gagal update medicationReference utk ${key}:`,
      err,
    );
  }
}
