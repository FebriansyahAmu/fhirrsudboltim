// lib/ihs/ttv-actual.ts
// ─────────────────────────────────────────────────────────────
// Data AKTUAL TTV (Observation jenis 1-5) langsung dari sumbernya
// `medicalrecord.tanda_vital`, untuk dua koreksi:
//
//  1. `issued` — staging tak pernah mengisinya untuk TTV (ETL
//     `sp_sync_ttv_to_observation` hanya menulis effectiveDateTime), padahal
//     Satu Sehat kini mewajibkannya (Rule 10296). Nilai aktual = saat hasil
//     tersedia di sistem = MAX(jam periksa, jam input) — `tv.TANGGAL` adalah
//     timestamp input; diambil MAX agar tak pernah lebih awal dari jam periksa
//     (perawat kadang mengisi jam periksa bulat SETELAH jam input). Dikonversi
//     lewat `dateFormatUTC` yang sama dengan effectiveDateTime (konsisten).
//
//  2. `encounter` — fungsi SIMGOS `getEncounter()` sengaja MELIPAT pendaftaran
//     yang masuk dari pendaftaran lain (`tujuan_pasien.PENDAFTARAN_MASUK_NOMOR`,
//     mis. ranap dari IGD) ke Encounter ASAL. Akibatnya TTV ruang rawat inap
//     menempel ke Encounter IGD. Di sini Encounter diambil dari kunjungan TTV
//     itu SENDIRI (`tanda_vital.KUNJUNGAN` → `kunjungan.NOPEN`), langsung dari
//     tabel encounter (TIDAK lewat getEncounter) — EMER/IMP/AMB sesuai tempatnya.
//     Writeback ke staging TIDAK mungkin: trigger `observation_before_update`
//     menghitung ulang `encounter` dari getEncounter() di setiap UPDATE.
//
// 🔒 Hanya SELECT (lewat simgosQuery). Tidak menulis apa pun.
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";

/**
 * Ekspresi SQL `issued` aktual TTV (alias tabel sumber WAJIB `tv` =
 * `medicalrecord.tanda_vital`). Satu sumber kebenaran untuk read-side &
 * writeback (`lib/dal/ttv-writeback.ts`).
 */
export const TTV_ISSUED_EXPR =
  "`kemkes-ihs`.`dateFormatUTC`(GREATEST(tv.`WAKTU_PEMERIKSAAN`, " +
  "COALESCE(tv.`TANGGAL`, tv.`WAKTU_PEMERIKSAAN`)), 1)";

/** Jenis Observation yang bersumber dari `tanda_vital` (nadi..suhu). */
export function isTtvJenis(jenis: number): boolean {
  return Number.isInteger(jenis) && jenis >= 1 && jenis <= 5;
}

export interface TtvActual {
  /** issued aktual (format UTC SIMGOS) atau null bila jam periksa kosong. */
  issued: string | null;
  /** No. Pendaftaran milik kunjungan tempat TTV diukur. */
  ownNopen: string | null;
  /** Encounter milik `ownNopen` bila SUDAH terkirim (punya id); null bila belum. */
  encounter: { reference: string; display?: string } | null;
}

/**
 * Resolusi data aktual TTV berdasar `refId` Observation (= `tanda_vital.ID`).
 * Null bila sumber tak ditemukan / jam periksa kosong.
 */
export async function resolveTtvActual(refId: string): Promise<TtvActual | null> {
  if (!/^\d{1,20}$/.test(refId)) return null;
  const rows = await simgosQuery<{
    issued: string | null;
    ownNopen: string | null;
    encId: string | null;
    encDisplay: string | null;
  }>(
    "SELECT " +
      TTV_ISSUED_EXPR +
      " AS issued, k.`NOPEN` AS ownNopen, en.`id` AS encId, " +
      // Format display = persis getEncounter(): "Kunjungan <pasien> pada tanggal <tgl daftar>".
      "CONCAT('Kunjungan ', JSON_UNQUOTE(JSON_EXTRACT(`kemkes-ihs`.`getPatient`(pen.`NORM`), '$.display')), " +
      "' pada tanggal ', pen.`TANGGAL`) AS encDisplay " +
      "FROM `medicalrecord`.`tanda_vital` tv " +
      "LEFT JOIN `pendaftaran`.`kunjungan` k ON k.`NOMOR` = tv.`KUNJUNGAN` " +
      "LEFT JOIN `kemkes-ihs`.`encounter` en ON en.`refId` = k.`NOPEN` AND en.`id` IS NOT NULL " +
      "LEFT JOIN `pendaftaran`.`pendaftaran` pen ON pen.`NOMOR` = k.`NOPEN` " +
      "WHERE tv.`ID` = ? AND tv.`WAKTU_PEMERIKSAAN` IS NOT NULL LIMIT 1",
    [Number(refId)],
  );
  const r = rows[0];
  if (!r) return null;
  const encId = r.encId?.trim();
  return {
    issued: r.issued?.trim() || null,
    ownNopen: r.ownNopen?.trim() || null,
    encounter: encId
      ? {
          reference: `Encounter/${encId}`,
          ...(r.encDisplay ? { display: r.encDisplay } : {}),
        }
      : null,
  };
}
