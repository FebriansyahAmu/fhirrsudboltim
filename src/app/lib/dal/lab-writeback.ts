// lib/dal/lab-writeback.ts
// ─────────────────────────────────────────────────────────────
// Write-back TERSANKSI ke `kemkes-ihs.observation` untuk Observation LAB
// (jenis=6): tulis ulang `code` (LOINC benar), `valueQuantity`/`valueString`,
// dan `interpretation` hasil RAKIT ULANG (lihat lab-loinc.ts) ke baris staging
// SIMGOS berdasarkan `refId`. Supaya kolom staging ikut benar & FHIR bisa
// dikirim lewat alur normal.
//
// 🔒 Satu-satunya jalur tulis = `simgosExecute` (UPDATE saja). Statement diawali
//    UPDATE, nama tabel/kolom KONSTAN (bukan dari input), nilai di-bind sebagai
//    parameter (prepared statement). WHERE dikunci ke `refId = ? AND jenis = 6`.
//
// ⚠️ Catatan: procedure SIMGOS `hasilLabToObservation` dapat MENIMPA kembali
//    kolom ini (ke 11477-7) bila hasil lab-nya diedit/di-finalisasi ulang (ETL
//    jalan per TINDAKAN_MEDIS). Write-back ini karenanya tidak dijamin permanen
//    untuk data yang masih bisa berubah — bisa dijalankan ulang bila perlu.
// ─────────────────────────────────────────────────────────────

import { simgosExecute, simgosQuery } from "@/app/lib/db/simgos";
import {
  resolveLabRebuildByRefId,
  resolveLabRebuildByRefIds,
  type LabRebuild,
} from "@/app/lib/ihs/lab-loinc";

export interface LabWriteBackResult {
  updated: number;
  rebuild: LabRebuild;
}

/**
 * Susun statement UPDATE tersanksi (kolom KONSTAN, nilai di-bind) untuk menulis
 * hasil rakit-ulang `rb` ke baris `observation` SIMGOS (jenis=6) berdasarkan
 * refId. code + interpretation = JSON; value polimorfik (Quantity/String).
 */
function buildLabWriteBackUpdate(
  refId: string,
  rb: LabRebuild,
): { sql: string; params: unknown[] } {
  const setParts: string[] = ["`code` = CAST(? AS JSON)"];
  const params: unknown[] = [JSON.stringify(rb.code)];

  if (rb.valueQuantity) {
    setParts.push("`valueQuantity` = CAST(? AS JSON)", "`valueString` = NULL");
    params.push(JSON.stringify(rb.valueQuantity));
  } else {
    setParts.push("`valueQuantity` = NULL", "`valueString` = ?");
    params.push(rb.valueString ?? "");
  }

  if (rb.interpretation) {
    setParts.push("`interpretation` = CAST(? AS JSON)");
    params.push(JSON.stringify(rb.interpretation));
  } else {
    setParts.push("`interpretation` = NULL");
  }

  const sql =
    "UPDATE `kemkes-ihs`.`observation` SET " +
    setParts.join(", ") +
    " WHERE `refId` = ? AND `jenis` = 6";
  params.push(refId);
  return { sql, params };
}

/**
 * Terapkan hasil rakit-ulang ke baris `observation` SIMGOS (jenis=6) via UPDATE.
 * Return null bila refId tak valid atau tak ada pemetaan aktif/nilai valid
 * (tak ada yang layak ditulis). `updated`=0 berarti baris tak ditemukan.
 */
export async function writeBackLabObservation(
  refId: string,
): Promise<LabWriteBackResult | null> {
  if (!/^\d{1,20}$/.test(refId)) return null;

  const rb = await resolveLabRebuildByRefId(refId);
  if (!rb) return null;

  const { sql, params } = buildLabWriteBackUpdate(refId, rb);
  const updated = await simgosExecute(sql, params);
  return { updated, rebuild: rb };
}

export interface LabReconcileBatch {
  /** Baris LAB (masih 11477-7) yang dipindai pada batch ini. */
  scanned: number;
  /** Baris yang punya pemetaan aktif + nilai valid (layak ditulis). */
  matched: number;
  /** Baris `observation` yang benar-benar ter-update. */
  updated: number;
  /** refId numerik terakhir yang dipindai — dipakai sebagai cursor berikutnya. */
  nextCursor: number;
  /** true bila batch < batchSize → tidak ada lagi baris setelah ini. */
  done: boolean;
}

/**
 * RECONCILE MASSAL: sesuaikan baris `observation` LAB (jenis=6) yang MASIH
 * berkode salah `11477-7` dengan katalog LOINC kita, lalu tulis code/value/
 * interpretation yang benar ke SIMGOS — agar staging KONSISTEN sebelum di-PUT.
 *
 * Paging via cursor refId (numerik, menaik) → PASTI berhenti; hanya memindai
 * baris yang masih salah (yang sudah benar otomatis terlewati) → idempotent,
 * aman dijalankan ulang / dilanjut. Baris worklist (belum dipetakan) dipindai
 * tapi dilewati (tak ada rebuild) — cursor tetap maju melewatinya.
 *
 * 🔒 Hanya BACA (SELECT) SIMGOS untuk memindai + UPDATE tersanksi per baris
 *    (kolom konstan, nilai di-bind). Tidak menyentuh Satu Sehat.
 */
export async function reconcileLabObservationsBatch(
  cursor: number,
  batchSize: number,
): Promise<LabReconcileBatch> {
  const size = Math.min(Math.max(batchSize | 0, 1), 2000);
  const from = Number.isFinite(cursor) && cursor > 0 ? Math.floor(cursor) : 0;

  // Pindai baris LAB yang MASIH salah (11477-7), setelah cursor, urut refId.
  const rows = await simgosQuery<{ refId: string; ref_num: number }>(
    "SELECT `refId`, CAST(`refId` AS UNSIGNED) AS ref_num " +
      "FROM `kemkes-ihs`.`observation` " +
      "WHERE `jenis` = 6 AND CAST(`refId` AS UNSIGNED) > ? " +
      "AND JSON_UNQUOTE(JSON_EXTRACT(`code`, '$.coding[0].code')) = '11477-7' " +
      "ORDER BY CAST(`refId` AS UNSIGNED) ASC LIMIT ?",
    [from, size],
  );

  if (rows.length === 0) {
    return { scanned: 0, matched: 0, updated: 0, nextCursor: from, done: true };
  }

  const refIds = rows.map((r) => String(r.refId));
  const nextCursor = Number(rows[rows.length - 1].ref_num);

  // Resolusi rebuild sekali untuk seluruh batch (hanya aktif + bernilai valid).
  const map = await resolveLabRebuildByRefIds(refIds);

  let updated = 0;
  for (const [refId, rb] of map) {
    const { sql, params } = buildLabWriteBackUpdate(refId, rb);
    updated += await simgosExecute(sql, params);
  }

  return {
    scanned: rows.length,
    matched: map.size,
    updated,
    nextCursor,
    done: rows.length < size,
  };
}

/**
 * Gerbang write-back LAB SAAT KIRIM — dipanggil dari route POST/PUT /api/fhir
 * setelah pengiriman Observation SUKSES (2xx). Membaca `?module=observation&
 * key=refId_6` (identitas baris yang dikirim client) dan, bila resource memang
 * `Observation` untuk baris LAB (jenis=6), menulis-ulang code/value/
 * interpretation ke SIMGOS agar baris staging KONSISTEN dgn yang diterima Satu
 * Sehat (bukan lagi placeholder 11477-7).
 *
 * No-op bila: bukan Observation, bukan modul observation, jenis≠6, key tak
 * berbentuk refId_jenis, atau parameter tak punya pemetaan aktif/nilai valid
 * (writeBackLabObservation → null). Fire-and-forget: kegagalan hanya di-log,
 * tidak memutus response ke client.
 *
 * ⚠️ Overwrite (bukan IF-null) — memang untuk MENGGANTI kode salah. ETL SIMGOS
 *    `hasilLabToObservation` dapat menimpanya kembali bila hasil lab difinalisasi
 *    ulang; write-back ini otomatis terjadi lagi pada pengiriman berikutnya.
 */
export async function maybeLabObservationWriteBack(params: {
  searchParams: URLSearchParams;
  resource: string;
  status: number;
}): Promise<void> {
  const { searchParams, resource, status } = params;
  if (status < 200 || status >= 300) return;
  if (resource !== "Observation") return;
  if (searchParams.get("module") !== "observation") return;
  const key = searchParams.get("key");
  const m = key ? /^(\d{1,20})_(\d+)$/.exec(key) : null;
  if (!m || m[2] !== "6") return; // hanya baris LAB (jenis=6)
  const refId = m[1];
  try {
    const wb = await writeBackLabObservation(refId);
    if (wb) {
      console.log(
        `[lab writeback] refId=${refId} code=${wb.rebuild.code.coding[0]?.code ?? "-"} (${wb.rebuild.codeDisplay}) rows=${wb.updated}`,
      );
    }
  } catch (err) {
    console.error(
      `[lab writeback] gagal update SIMGOS observation refId=${refId}:`,
      err,
    );
  }
}
