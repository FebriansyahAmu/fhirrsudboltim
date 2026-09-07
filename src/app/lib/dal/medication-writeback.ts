// lib/dal/medication-writeback.ts
// ─────────────────────────────────────────────────────────────
// Write-back TERSANKSI: setelah Medication berhasil di-POST ke Satu Sehat,
// propagasikan IHS id-nya ke `medicationReference` pada HILIR yang merujuknya —
// `medication_request` DAN `medication_dispanse` (ejaan tabel apa adanya di DB)
// — untuk baris dengan composite key SAMA (refId, barang, group_racikan) [1:1].
//
// Kenapa perlu: SIMGOS memateralisasi `medicationReference` (referensi ke
// Medication) hanya SAAT baris resep/penyerahan dibuat, dari `medication.id`
// saat itu. Bila Medication-nya baru dikirim BELAKANGAN (lewat app ini),
// referensi hilir tetap menunjuk id lama/basi → POST MedicationRequest/Dispense
// ditolak. Fungsi ini menutup langkah yang hilang: begitu Medication terkirim,
// id-nya ditulis ke semua hilir yang merujuknya.
//
// 🔒 Satu-satunya tulis = `simgosExecute` (UPDATE saja). Nama tabel dari daftar
//    KONSTAN (bukan input), kolom KONSTAN, nilai di-bind, WHERE dikunci ke
//    composite key. Idempotent: hanya menyentuh baris yang referensinya BEDA.
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
