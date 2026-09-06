// lib/dal/specimen-writeback.ts
// ─────────────────────────────────────────────────────────────
// Write-back TERSANKSI: setelah ServiceRequest (LAB) berhasil di-POST ke Satu
// Sehat, propagasikan IHS id-nya ke `specimen.request` untuk spesimen dengan
// refId SAMA (specimen.refId = service_request.refId, 1:1 — terverifikasi).
//
// Kenapa perlu: SIMGOS memateralisasi `specimen.request` (referensi ke
// ServiceRequest) hanya SAAT spesimen dibuat. Bila ServiceRequest-nya baru
// dikirim BELAKANGAN (lewat app ini), specimen tetap menunjuk id lama/basi → POST
// Specimen ditolak ("ServiceRequest tidak ditemukan"). Alur normal: kirim SR →
// SR punya IHS id → specimen bisa merujuknya → kirim Specimen. Fungsi ini
// menutup langkah yang hilang: menulis id SR ke specimen begitu SR terkirim.
//
// 🔒 Satu-satunya tulis = `simgosExecute` (UPDATE saja). Kolom KONSTAN
//    (`request`), nilai di-bind (prepared statement), WHERE dikunci ke
//    `refId = ?`. Idempotent: hanya menyentuh baris yang referensinya BERBEDA.
// ─────────────────────────────────────────────────────────────

import { simgosExecute } from "@/app/lib/db/simgos";

const REFID_RE = /^[A-Za-z0-9]{1,20}$/;
const IHS_ID_RE = /^[A-Za-z0-9.\-]{1,64}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** id resource dari response Satu Sehat (POST ServiceRequest). null bila absen. */
function ihsIdFromResponse(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const id = typeof data.id === "string" ? data.id.trim() : "";
  return IHS_ID_RE.test(id) ? id : null;
}

/**
 * Tulis referensi `ServiceRequest/<ihsId>` ke `specimen.request[0].reference`
 * untuk spesimen ber-refId `srRefId`. Return jumlah baris ter-update (0 bila SR
 * ini tak punya spesimen, atau referensinya sudah sama). `JSON_SET` menjaga
 * field lain (mis. display) bila ada.
 */
export async function writeBackSpecimenServiceRequestRef(
  srRefId: string,
  srIhsId: string,
): Promise<number> {
  if (!REFID_RE.test(srRefId) || !IHS_ID_RE.test(srIhsId)) return 0;
  const ref = `ServiceRequest/${srIhsId}`;
  const sql =
    "UPDATE `kemkes-ihs`.`specimen` " +
    "SET `request` = JSON_SET(`request`, '$[0].reference', ?) " +
    "WHERE `refId` = ? " +
    "AND JSON_LENGTH(`request`) > 0 " +
    // idempotent: lewati bila referensinya sudah sama (<=> = null-safe equal).
    "AND NOT (JSON_UNQUOTE(JSON_EXTRACT(`request`, '$[0].reference')) <=> ?)";
  return simgosExecute(sql, [ref, srRefId, ref]);
}

/** Pola UUID (id resource Satu Sehat selalu UUID) — untuk menyaring id kotor. */
const UUID_RE_SQL =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

/**
 * RECONCILE MASSAL (retroaktif): untuk ServiceRequest yang SUDAH terkirim
 * (punya IHS id valid di `service_request.id`) tapi spesimennya masih menunjuk
 * referensi lama/basi, salin id SR itu ke `specimen.request` (join by refId).
 * DB-only (tanpa Satu Sehat) — id-nya sudah tercatat di SIMGOS saat SR dikirim.
 *
 * Hanya menyalin id ber-format UUID (id Satu Sehat asli) → id kotor seperti
 * "null" atau refId tidak ikut. Idempotent: hanya menyentuh baris yang
 * referensinya BERBEDA (guard null-safe-equal). Return jumlah baris ter-update.
 *
 * 🔒 Satu UPDATE tersanksi (join-update, diawali UPDATE); kolom/tabel KONSTAN,
 *    pola UUID di-bind. Tidak menyentuh Satu Sehat.
 */
export async function reconcileSpecimenRequestRefs(): Promise<number> {
  const sql =
    "UPDATE `kemkes-ihs`.`specimen` sp " +
    "JOIN `kemkes-ihs`.`service_request` sr ON sr.`refId` = sp.`refId` " +
    "SET sp.`request` = JSON_SET(sp.`request`, '$[0].reference', CONCAT('ServiceRequest/', sr.`id`)) " +
    "WHERE sr.`id` REGEXP ? " +
    "AND JSON_LENGTH(sp.`request`) > 0 " +
    "AND NOT (JSON_UNQUOTE(JSON_EXTRACT(sp.`request`, '$[0].reference')) <=> CONCAT('ServiceRequest/', sr.`id`))";
  return simgosExecute(sql, [UUID_RE_SQL]);
}

/**
 * Gerbang: dipanggil dari route POST /api/fhir setelah ServiceRequest LAB
 * SUKSES (2xx). Baca `?module=servicerequest-lab&key=<refId>` + id dari response,
 * lalu propagasikan ke specimen. No-op utk SR non-LAB (tak punya spesimen) atau
 * bila data tak lengkap. Fire-and-forget: kegagalan hanya di-log.
 */
export async function maybeWriteBackSpecimenForServiceRequest(params: {
  searchParams: URLSearchParams;
  resource: string;
  status: number;
  responseData: unknown;
}): Promise<void> {
  const { searchParams, resource, status, responseData } = params;
  if (status < 200 || status >= 300) return;
  if (resource !== "ServiceRequest") return;
  // Hanya LAB yang punya spesimen; refId-nya sejajar dgn specimen.refId.
  if (searchParams.get("module") !== "servicerequest-lab") return;
  const refId = searchParams.get("key");
  if (!refId || !REFID_RE.test(refId)) return;
  const ihsId = ihsIdFromResponse(responseData);
  if (!ihsId) return;
  try {
    const n = await writeBackSpecimenServiceRequestRef(refId, ihsId);
    if (n > 0) {
      console.log(
        `[specimen writeback] SR refId=${refId} → ServiceRequest/${ihsId} pada ${n} spesimen`,
      );
    }
  } catch (err) {
    console.error(
      `[specimen writeback] gagal update specimen.request utk SR refId=${refId}:`,
      err,
    );
  }
}
