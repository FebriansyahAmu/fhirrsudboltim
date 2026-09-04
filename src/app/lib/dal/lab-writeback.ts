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

import { simgosExecute } from "@/app/lib/db/simgos";
import {
  resolveLabRebuildByRefId,
  type LabRebuild,
} from "@/app/lib/ihs/lab-loinc";

export interface LabWriteBackResult {
  updated: number;
  rebuild: LabRebuild;
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

  // Kolom KONSTAN; nilai di-bind. code + interpretation = JSON; value polimorfik.
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

  const updated = await simgosExecute(sql, params);
  return { updated, rebuild: rb };
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
