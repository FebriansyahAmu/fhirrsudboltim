// lib/dal/episode-of-care-writeback.ts
// ─────────────────────────────────────────────────────────────
// PEMBANGUN EpisodeOfCare (`eof`) dari Condition (diagnosis).
//
// SIMGOS membuat baris `eof` HANYA lewat proc `episodeOfCare(PID, PNOPEN)`,
// yang seharusnya dipicu trigger `condition_after_update` saat sebuah Condition
// (diagnosis UTAMA yang KODE-nya ada di `diagnosa_to_eof`) berubah id. TAPI
// guard trigger itu null-unsafe (`NEW.id != OLD.id`; pada kirim pertama id
// `NULL→uuid` → `uuid != NULL` = NULL = false), jadi proc tak pernah jalan &
// `eof` kosong total. Modul ini memanggil proc secara langsung (jalur tulis
// tersanksi `simgosCallEpisodeOfCare`) untuk Condition yang layak & sudah
// terkirim — pola sama dgn pipeline lain (Specimen/Observation/DiagnosticReport).
//
// KELAYAKAN (meniru EXISTS di trigger): diagnosa `d.ID = condition.refId` dgn
// `d.UTAMA = 1 AND d.STATUS = 1` DAN `d.KODE` ada di `diagnosa_to_eof`. Gerbang
// ini WAJIB — proc sendiri tak mengecek UTAMA/pemetaan, jadi memanggilnya untuk
// diagnosis non-EOC akan menyisipkan baris `eof` sampah.
//
// 🔒 Tulis = HANYA `simgosCallEpisodeOfCare` (CALL proc terkunci; refId int,
//    nopen 10-digit, di-bind). Selain itu murni BACA (`simgosQuery`). Idempotent
//    (proc ber-`IF NOT EXISTS`; reconcile juga menyaring yang sudah punya `eof`).
// ─────────────────────────────────────────────────────────────

import { simgosQuery, simgosCallEpisodeOfCare } from "@/app/lib/db/simgos";

type EligibleRow = { refId: number; nopen: string };

/**
 * Satu Condition layak EOC? Return {refId, nopen} bila diagnosanya UTAMA=1,
 * STATUS=1, KODE ter-map di `diagnosa_to_eof`, dan Condition-nya SUDAH terkirim
 * (`condition.id` ada). null bila tidak. `nopen` diambil dari baris Condition
 * (yang dipakai proc sebagai PNOPEN), divalidasi 10 digit.
 */
async function findEligibleCondition(
  refId: number,
): Promise<EligibleRow | null> {
  const rows = await simgosQuery<EligibleRow>(
    "SELECT c.`refId` AS refId, c.`nopen` AS nopen " +
      "FROM `kemkes-ihs`.`condition` c " +
      "JOIN `medicalrecord`.`diagnosa` d ON d.`ID` = c.`refId` " +
      "JOIN `kemkes-ihs`.`diagnosa_to_eof` dte ON dte.`KODE_DIAGNOSA` = d.`KODE` " +
      "WHERE c.`refId` = ? AND d.`UTAMA` = 1 AND d.`STATUS` = 1 " +
      "AND c.`id` IS NOT NULL AND c.`nopen` REGEXP '^[0-9]{10}$' LIMIT 1",
    [refId],
  );
  return rows[0] ?? null;
}

/**
 * FORWARD: dipanggil dari POST /api/fhir setelah Condition SUKSES (2xx) & id
 * ditulis handleClinicalPostResult. Bila Condition itu layak EOC → CALL
 * `episodeOfCare` → bangun baris `eof` (send=1, id=null → siap dikirim).
 * Fire-and-forget: kegagalan hanya di-log, tak memutus response.
 */
export async function maybeBuildEpisodeOfCareForCondition(params: {
  searchParams: URLSearchParams;
  resource: string;
  status: number;
}): Promise<void> {
  const { searchParams, resource, status } = params;
  if (status < 200 || status >= 300) return;
  if (resource !== "Condition") return;
  const key = searchParams.get("key");
  if (!key || !/^\d{1,10}$/.test(key)) return;
  const refId = Number(key);
  try {
    const elig = await findEligibleCondition(refId);
    if (!elig) return; // bukan dx utama EOC / kode tak ter-map → lewati
    await simgosCallEpisodeOfCare(elig.refId, elig.nopen);
    console.log(
      `[eof build] Condition refId=${refId} layak → CALL episodeOfCare(${elig.refId}, ${elig.nopen})`,
    );
  } catch (err) {
    console.error(
      `[eof build] gagal bangun EpisodeOfCare utk Condition refId=${refId}:`,
      err,
    );
  }
}

/**
 * RECONCILE (retroaktif): bangun `eof` untuk SEMUA Condition layak yang sudah
 * terkirim tapi belum punya baris `eof`. `limit` (opsional) → UJI N (refId
 * terbaru) dulu sebelum batch penuh. Idempotent. Return {eligible, built}.
 */
export async function reconcileEpisodeOfCareBacklog(
  limit?: number,
): Promise<{ eligible: number; built: number }> {
  const base =
    "SELECT c.`refId` AS refId, MIN(c.`nopen`) AS nopen " +
    "FROM `kemkes-ihs`.`condition` c " +
    "JOIN `medicalrecord`.`diagnosa` d ON d.`ID` = c.`refId` " +
    "JOIN `kemkes-ihs`.`diagnosa_to_eof` dte ON dte.`KODE_DIAGNOSA` = d.`KODE` " +
    "LEFT JOIN `kemkes-ihs`.`eof` e ON e.`refId` = c.`refId` " +
    "WHERE d.`UTAMA` = 1 AND d.`STATUS` = 1 AND c.`id` IS NOT NULL " +
    "AND c.`nopen` REGEXP '^[0-9]{10}$' AND e.`refId` IS NULL " +
    "GROUP BY c.`refId`";
  const sql =
    limit && limit > 0 ? base + " ORDER BY c.`refId` DESC LIMIT ?" : base;
  const rows = await simgosQuery<EligibleRow>(
    sql,
    limit && limit > 0 ? [limit] : [],
  );
  let built = 0;
  for (const r of rows) {
    try {
      await simgosCallEpisodeOfCare(r.refId, r.nopen);
      built++;
    } catch (err) {
      console.error(
        `[eof reconcile] gagal CALL episodeOfCare(${r.refId}, ${r.nopen}):`,
        err,
      );
    }
  }
  return { eligible: rows.length, built };
}
