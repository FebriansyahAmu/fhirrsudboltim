// lib/dal/ttv-writeback.ts
// ─────────────────────────────────────────────────────────────
// WRITE-BACK `issued` AKTUAL ke staging `kemkes-ihs.observation` untuk TTV
// (jenis 1-5), dari sumbernya `medicalrecord.tanda_vital` — lihat
// `lib/ihs/ttv-actual.ts` (TTV_ISSUED_EXPR = MAX(jam periksa, jam input)).
//
// Kenapa perlu: ETL TTV SIMGOS tak pernah mengisi `issued`, padahal Satu Sehat
// kini mewajibkannya (Rule 10296). Read-side sudah mengisinya saat kirim; ini
// membuat STAGING ikut akurat & konsisten.
//
// AMAN terhadap trigger: `observation_before_update` menghitung ulang
// `encounter`/`subject` (dari getEncounter(nopen) & encounter.subject) dan bisa
// men-set send=0 bila hasilnya NULL. Maka HANYA baris yang hasil hitung ulangnya
// PASTI terisi yang disentuh (encounter ber-subject ada + getEncounter tak NULL)
// → nilai lain tetap sama seperti sinkron ulang ETL biasa. Hilir DiagnosticReport
// (after_update) hanya untuk jenis 6/7 → TTV tak memicu apa pun.
//
// 🔒 Tulis = `simgosExecute` (UPDATE saja). SQL konstan, nilai di-bind.
//    Idempotent: hanya `issued` yang masih kosong.
// ─────────────────────────────────────────────────────────────

import { simgosExecute } from "@/app/lib/db/simgos";
import { TTV_ISSUED_EXPR } from "@/app/lib/ihs/ttv-actual";

/** Pilot (≤ ini) diurutkan terbaru; batch besar tanpa ORDER BY agar LIMIT berhenti cepat. */
const PILOT_MAX = 50;
const BATCH_MAX = 5000;

/** YYYY-MM-DD → prefix YYMMDD (6 char); null bila format salah. */
function toYymmdd6(d: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? m[1].slice(2) + m[2] + m[3] : null;
}

const TV_OF_O = "tv.`ID` = CAST(o.`refId` AS UNSIGNED)";

/**
 * Isi `observation.issued` (TTV jenis 1-5) yang masih kosong dengan nilai
 * aktual dari `tanda_vital`. `limit` = ukuran batch (wajib, ≤ BATCH_MAX) —
 * pemanggil mengulang sampai hasil < limit. `from`/`to` (YYYY-MM-DD) → scope
 * rentang via No. Pendaftaran (YYMMDD). Return jumlah baris ter-update.
 */
export async function reconcileTtvIssued(opts: {
  limit: number;
  from?: string;
  to?: string;
}): Promise<number> {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit)), BATCH_MAX);
  const params: unknown[] = [];
  let rangeSql = "";
  if (opts.from) {
    const p = toYymmdd6(opts.from);
    if (p) {
      rangeSql += " AND o.`nopen` >= ?";
      params.push(p + "0000");
    }
  }
  if (opts.to) {
    const p = toYymmdd6(opts.to);
    if (p) {
      rangeSql += " AND o.`nopen` <= ?";
      params.push(p + "9999");
    }
  }

  const sql =
    "UPDATE `kemkes-ihs`.`observation` o " +
    "SET o.`issued` = (SELECT " +
    TTV_ISSUED_EXPR +
    " FROM `medicalrecord`.`tanda_vital` tv WHERE " +
    TV_OF_O +
    " LIMIT 1) " +
    "WHERE o.`jenis` BETWEEN 1 AND 5 " +
    "AND (o.`issued` IS NULL OR o.`issued` = '')" +
    rangeSql +
    // Sumber ada & jam periksa valid (sama dgn filter ETL).
    " AND EXISTS (SELECT 1 FROM `medicalrecord`.`tanda_vital` tv WHERE " +
    TV_OF_O +
    " AND tv.`WAKTU_PEMERIKSAAN` IS NOT NULL" +
    " AND tv.`WAKTU_PEMERIKSAAN` <> '0000-00-00 00:00:00')" +
    // Penjaga trigger: hitung ulang encounter/subject PASTI terisi.
    " AND EXISTS (SELECT 1 FROM `kemkes-ihs`.`encounter` e" +
    " WHERE e.`refId` = o.`nopen` AND e.`subject` IS NOT NULL)" +
    " AND `kemkes-ihs`.`getEncounter`(o.`nopen`) IS NOT NULL" +
    (limit <= PILOT_MAX
      ? " ORDER BY CAST(o.`refId` AS UNSIGNED) DESC, o.`jenis`"
      : "") +
    " LIMIT ?";
  params.push(limit);
  return simgosExecute(sql, params);
}
