// lib/dal/servicerequest-writeback.ts
// ─────────────────────────────────────────────────────────────
// PEMICU HILIR ServiceRequest → Specimen / ImagingStudy.
//
// SIMGOS membangun baris `kemkes-ihs.specimen` (tindakan lab, JENIS=8) dan
// `kemkes-ihs.imaging_study` (radiologi, JENIS=7) lewat trigger
// `service_request_after_update`, yang menyala HANYA saat
// `service_request.send` beralih 1→0 DENGAN `id` sudah ada:
//     IF NEW.send=0 AND OLD.send!=NEW.send AND NEW.id IS NOT NULL → INSERT …
//
// Dulu SIMGOS sendiri yang meng-set send=0 setelah kirim. Sejak pengiriman
// ServiceRequest pindah ke app ini, langkah itu HILANG → sejak ~10 Agu 2026
// tak ada specimen/imaging_study baru meski ratusan SR terkirim (semua nyangkut
// send=1). Modul ini menutup langkah itu — pola sama dengan medication-writeback:
//   • FORWARD  : sesudah SR terkirim (2xx, id ada) → set send=0 → trigger jalan.
//   • RECONCILE: retroaktif, balik send=0 utk SR lab/rad terkirim yang nyangkut.
//
// 🔒 Satu-satunya tulis = `simgosExecute` (UPDATE saja). Kolom KONSTAN (`send`),
//    nilai/pola di-bind, tabel dikunci. Idempotent (hanya menyentuh send=1). id
//    HARUS UUID (sudah ditulis oleh handleClinicalPostResult) agar trigger's
//    `NEW.id IS NOT NULL` terpenuhi → specimen langsung merujuk SR yang benar.
// ─────────────────────────────────────────────────────────────

import {
  simgosExecute,
  simgosInsertSpecimenForServiceRequest,
  simgosReconcileMissingLabSpecimens,
} from "@/app/lib/db/simgos";

const REFID_RE = /^[A-Za-z0-9]{1,20}$/;

/** Pola UUID (id Satu Sehat) — menyaring id kotor sebelum memicu trigger. */
const UUID_RE_SQL =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

/**
 * FORWARD: setel `service_request.send = 0` untuk satu SR (refId) yang SUDAH
 * terkirim (id UUID) & masih `send=1`. Transisi 1→0 memicu trigger
 * `service_request_after_update` → INSERT specimen (lab) / imaging_study (rad),
 * yang otomatis merujuk SR ini karena id-nya sudah ada. Return baris ter-update
 * (0 bila SR tak ber-id UUID / sudah send=0). Trigger swa-gerbang berdasar
 * JENIS tindakan (7/8), jadi SR non-lab/rad hanya di-tandai sent, tanpa efek.
 */
export async function markServiceRequestSent(refId: string): Promise<number> {
  if (!REFID_RE.test(refId)) return 0;
  const sql =
    "UPDATE `kemkes-ihs`.`service_request` SET `send` = 0 " +
    "WHERE `refId` = ? AND `send` = 1 AND `id` REGEXP ?";
  return simgosExecute(sql, [refId, UUID_RE_SQL]);
}

/**
 * Gerbang dari route POST /api/fhir setelah ServiceRequest SUKSES (2xx).
 * Baca `?key=<refId>` lalu flip send=0 → trigger membangun specimen/imaging.
 * DIPANGGIL SESUDAH write-back id (handleClinicalPostResult) agar id sudah ada
 * saat trigger menyala. Fire-and-forget: kegagalan hanya di-log.
 */
export async function maybeMarkServiceRequestSent(params: {
  searchParams: URLSearchParams;
  resource: string;
  status: number;
}): Promise<void> {
  const { searchParams, resource, status } = params;
  if (status < 200 || status >= 300) return;
  if (resource !== "ServiceRequest") return;
  const refId = searchParams.get("key");
  if (!refId || !REFID_RE.test(refId)) return;
  try {
    const n = await markServiceRequestSent(refId);
    if (n > 0) {
      console.log(
        `[servicerequest send-flag] refId=${refId} send→0 (${n}) → memicu specimen/imaging`,
      );
    }
  } catch (err) {
    console.error(
      `[servicerequest send-flag] gagal set send=0 utk refId=${refId}:`,
      err,
    );
  }
}

/**
 * FORWARD (pelengkap): pastikan Specimen ADA untuk order lab yang baru terkirim.
 * Untuk order TANPA petugas (performer null), trigger `service_request_before_
 * update` memaksa `send=0`, jadi flip send di atas TAK menghasilkan transisi →
 * trigger pembangun Specimen tak menyala. INSERT langsung (menyalin statement
 * trigger, self-gating + NOT EXISTS) menutup celah ini. No-op bila trigger sudah
 * membuat specimen-nya atau SR bukan lab. Return baris tersisip (0/1).
 */
export async function ensureSpecimenForServiceRequest(refId: string): Promise<number> {
  if (!REFID_RE.test(refId)) return 0;
  return simgosInsertSpecimenForServiceRequest(refId);
}

/**
 * Gerbang dari route POST /api/fhir setelah ServiceRequest SUKSES (2xx),
 * DIPANGGIL SESUDAH `maybeMarkServiceRequestSent` (id sudah ada, flip send sudah
 * dicoba). Menutup kasus order performer-null yang tak memicu trigger Specimen.
 * Fire-and-forget: kegagalan hanya di-log.
 */
export async function maybeEnsureSpecimenForServiceRequest(params: {
  searchParams: URLSearchParams;
  resource: string;
  status: number;
}): Promise<void> {
  const { searchParams, resource, status } = params;
  if (status < 200 || status >= 300) return;
  if (resource !== "ServiceRequest") return;
  const refId = searchParams.get("key");
  if (!refId || !REFID_RE.test(refId)) return;
  try {
    const n = await ensureSpecimenForServiceRequest(refId);
    if (n > 0) {
      console.log(
        `[servicerequest specimen] refId=${refId} → INSERT specimen (${n}) (order tanpa petugas)`,
      );
    }
  } catch (err) {
    console.error(
      `[servicerequest specimen] gagal INSERT specimen utk refId=${refId}:`,
      err,
    );
  }
}

/**
 * RECONCILE (retroaktif) Specimen order performer-null: bangun `specimen` untuk
 * SEMUA order lab terkirim (id UUID, JENIS=8) yang belum punya specimen — order
 * yang tak pernah memicu trigger karena performer kosong. `limit` → pilot. INSERT
 * langsung (menyalin statement trigger, idempotent). Return jumlah specimen tersisip.
 */
export async function reconcileMissingLabSpecimens(limit?: number): Promise<number> {
  return simgosReconcileMissingLabSpecimens(limit);
}

/**
 * RECONCILE (retroaktif): balik `send=0` untuk SR lab (JENIS=8) & radiologi
 * (JENIS=7) yang SUDAH terkirim (id UUID) tapi nyangkut `send=1` → trigger
 * membangun specimen/imaging_study yang hilang (tunggakan sejak ~10 Agu).
 * `limit` (opsional) → mode UJI: proses N baris TERBARU dulu (ORDER BY nopen
 * DESC), verifikasi, lalu jalankan semua sisanya (tanpa limit). UPDATE
 * satu-tabel (subquery hanya membaca tindakan) → boleh ORDER BY + LIMIT.
 * Idempotent (hanya send=1). Tidak menyentuh Satu Sehat. Return baris flip.
 */
export async function reconcileServiceRequestSendFlags(
  limit?: number,
): Promise<number> {
  const base =
    "UPDATE `kemkes-ihs`.`service_request` sr SET sr.`send` = 0 " +
    "WHERE sr.`id` REGEXP ? AND sr.`send` = 1 " +
    "AND sr.`refId` IN (" +
    "SELECT tm.`ID` FROM `layanan`.`tindakan_medis` tm " +
    "JOIN `master`.`tindakan` t ON t.`ID` = tm.`TINDAKAN` " +
    "WHERE t.`JENIS` IN (7, 8))";
  if (limit && limit > 0) {
    return simgosExecute(base + " ORDER BY sr.`nopen` DESC LIMIT ?", [
      UUID_RE_SQL,
      limit,
    ]);
  }
  return simgosExecute(base, [UUID_RE_SQL]);
}
