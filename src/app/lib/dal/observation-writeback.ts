// lib/dal/observation-writeback.ts
// ─────────────────────────────────────────────────────────────
// PEMICU HILIR Observation (hasil lab/rad) → DiagnosticReport.
//
// Trigger SIMGOS `observation_after_update` menyala saat `observation.send`
// beralih 1→0 dengan id ada:
//     jenis=6 (lab) → CALL catatanHasilLabToDignosticReport(refId)
//     jenis=7 (rad) → CALL catatanHasilRadToDignosticReport(refId)
// → membangun DiagnosticReport. Dulu SIMGOS yang meng-set send=0 setelah kirim;
// sejak pengiriman pindah ke app ini, langkah itu HILANG → DiagnosticReport
// berhenti dibuat (sejak ~31 Jul 2026). Modul ini menutup langkah itu — pola
// sama dgn ServiceRequest/Specimen/Medication.
//
// HANYA jenis 6/7 (lab/rad) yang punya hilir DiagnosticReport; jenis lain
// (mis. TTV 1-5) tak disentuh agar tak menulis sia-sia. Trigger juga swa-gerbang.
//
// 🔒 Satu-satunya tulis = `simgosExecute` (UPDATE saja). Kolom KONSTAN (`send`),
//    nilai/pola di-bind, tabel dikunci. Idempotent (hanya send=1). id HARUS UUID.
// ─────────────────────────────────────────────────────────────

import { simgosExecute } from "@/app/lib/db/simgos";

const REFID_RE = /^[A-Za-z0-9]{1,20}$/;

const UUID_RE_SQL =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

/** Jenis Observation yang punya hilir DiagnosticReport (lab / radiologi). */
const DR_JENIS = new Set([6, 7]);

/**
 * FORWARD: setel `observation.send = 0` untuk satu baris Observation lab/rad
 * (refId + jenis, PK komposit) yang SUDAH terkirim (id UUID) & masih `send=1`
 * → trigger membangun DiagnosticReport. Hanya jenis 6/7.
 */
export async function markObservationSent(
  refId: string,
  jenis: number,
): Promise<number> {
  if (!REFID_RE.test(refId) || !DR_JENIS.has(jenis)) return 0;
  const sql =
    "UPDATE `kemkes-ihs`.`observation` SET `send` = 0 " +
    "WHERE `refId` = ? AND `jenis` = ? AND `send` = 1 AND `id` REGEXP ?";
  return simgosExecute(sql, [refId, jenis, UUID_RE_SQL]);
}

/**
 * Gerbang dari route POST /api/fhir setelah Observation SUKSES (2xx). Key
 * Observation = `<refId>_<jenis>` (PK komposit). Flip send=0 utk baris itu bila
 * jenis 6/7 → trigger membangun DiagnosticReport. DIPANGGIL SESUDAH write-back
 * id. Fire-and-forget: kegagalan hanya di-log.
 */
export async function maybeMarkObservationSent(params: {
  searchParams: URLSearchParams;
  resource: string;
  status: number;
}): Promise<void> {
  const { searchParams, resource, status } = params;
  if (status < 200 || status >= 300) return;
  if (resource !== "Observation") return;
  const key = searchParams.get("key");
  if (!key) return;
  const m = key.match(/^([A-Za-z0-9]{1,20})_(\d{1,2})$/);
  if (!m) return;
  const refId = m[1];
  const jenis = Number(m[2]);
  if (!DR_JENIS.has(jenis)) return; // hanya lab/rad yang membangun DiagnosticReport
  try {
    const n = await markObservationSent(refId, jenis);
    if (n > 0) {
      console.log(
        `[observation send-flag] refId=${refId} jenis=${jenis} send→0 (${n}) → memicu DiagnosticReport`,
      );
    }
  } catch (err) {
    console.error(
      `[observation send-flag] gagal set send=0 utk refId=${refId} jenis=${jenis}:`,
      err,
    );
  }
}

/**
 * RECONCILE (retroaktif): balik `send=0` untuk Observation lab/rad (jenis 6/7)
 * terkirim (id UUID) yang nyangkut `send=1` → trigger membangun DiagnosticReport
 * yang hilang. `limit` (opsional) → UJI N baris terbaru dulu. UPDATE satu-tabel
 * → boleh ORDER/LIMIT. Idempotent. Tanpa Satu Sehat. Return baris flip.
 */
export async function reconcileObservationSendFlags(
  limit?: number,
): Promise<number> {
  const base =
    "UPDATE `kemkes-ihs`.`observation` SET `send` = 0 " +
    "WHERE `id` REGEXP ? AND `send` = 1 AND `jenis` IN (6, 7)";
  if (limit && limit > 0) {
    return simgosExecute(base + " ORDER BY `nopen` DESC LIMIT ?", [
      UUID_RE_SQL,
      limit,
    ]);
  }
  return simgosExecute(base, [UUID_RE_SQL]);
}
