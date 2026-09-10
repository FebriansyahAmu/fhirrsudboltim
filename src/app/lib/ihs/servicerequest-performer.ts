// lib/ihs/servicerequest-performer.ts
// ─────────────────────────────────────────────────────────────
// Performer default untuk ServiceRequest LAB.
//
// Satu Sehat mewajibkan `ServiceRequest.performer` (RuleNumber 10377). Untuk lab,
// SIMGOS memateralisasi performer dari `layanan.petugas_tindakan_medis` via trigger
// `service_request_before_update`. Bila order lab belum punya petugas → performer
// NULL → payload tak memuatnya → ditolak.
//
// Fallback yang DISETUJUI (read-side / payload saja — kolom DB tak bisa ditulis
// balik, trigger selalu menghitung ulang), HANYA untuk data tahun 2026+:
//
//   performer[0]  = LEAD  → dr. ISWANTO KOROMPOT, Sp.PK  (STATIS, tak diganggu).
//   performer[1]  = ANALIS → DINAMIS: petugas yang benar-benar mengerjakan tindakan
//                    lab ini. Bila lookup gagal → analis default (HIDAYAT BUCHARI).
//
// Resolusi analis (dinamis) — dioptimasi jadi SATU query indeks:
//   `service_request.refId` == `layanan.tindakan_medis.ID` (invarian terverifikasi
//   810/810 pada order lab 2026 performer-null), jadi tak perlu menelusuri
//   nopen → kunjungan(102010101) → NOMOR. Langsung:
//     tindakan_medis(ID=refId).OLEH → aplikasi.pengguna(ID).NIP,NIK
//       → master.pegawai(NIP) [nama + gelar]  (display)
//       → kemkes-ihs.practitioner(refId=NIK).id  (reference)
//   Semua join lewat PK / kolom ter-index → cepat & ringan.
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";

/** Satu entri performer FHIR. */
export interface PerformerRef {
  display: string;
  reference: string;
}

/** Ruangan Laboratorium Sentral (referensi; lihat catatan resolusi di atas). */
export const RUANGAN_LAB_SENTRAL = "102010101";

/** Performer LEAD (dokter PK penanggung jawab) — SELALU statis, tak diganggu. */
export const DEFAULT_PERFORMER_LEAD: PerformerRef = {
  display: "dr. ISWANTO KOROMPOT, Sp.PK",
  reference: "Practitioner/10012124306",
};

/** Analis default — fallback bila resolusi dinamis gagal (jarang). */
export const DEFAULT_PERFORMER_ANALYST: PerformerRef = {
  display: "HIDAYAT BUCHARI, A.Md.Ak",
  reference: "Practitioner/10039629610",
};

/** Performer default lab lengkap (lead + analis default). Fallback statis. */
export const DEFAULT_LAB_PERFORMER: ReadonlyArray<PerformerRef> = [
  DEFAULT_PERFORMER_LEAD,
  DEFAULT_PERFORMER_ANALYST,
];

/**
 * Tahun data (dari `nopen` berformat YYMMDD…) >= 2026?
 * 2025 ke bawah → false (fallback tak berlaku).
 */
export function isYear2026OrLater(nopen: string | null | undefined): boolean {
  if (!nopen || nopen.length < 2) return false;
  const yy = nopen.slice(0, 2);
  return /^\d\d$/.test(yy) && yy >= "26";
}

/**
 * Resolusi DINAMIS performer analis untuk satu order lab, via `refId`
 * (== `tindakan_medis.ID`). Satu query indeks (read-only). Mengembalikan
 * `{display, reference}` bila petugas tindakan terpetakan ke Practitioner IHS,
 * atau `null` bila tak ada tindakan / petugas / practitioner (→ pakai fallback).
 *
 * `display` = NAMA pegawai (huruf besar) + ", " + Gelar Belakang — mis.
 * "HIDAYAT BUCHARI, A.Md.Ak". `reference` = `Practitioner/<id>` (id diperoleh
 * dari `practitioner.refId = pengguna.NIK`). Nama pegawai dipakai (bukan
 * `practitioner.name`) karena nama IHS sebagian tersamar privasi (mis. "FA** …").
 */
export async function resolveLabAnalystPerformer(
  refId: string,
): Promise<PerformerRef | null> {
  // refId order lab = tindakan_medis.ID (numerik). Early-out bila bukan.
  if (!/^\d{1,20}$/.test(refId)) return null;

  const rows = await simgosQuery<{
    practitionerId: string | null;
    pegawaiNama: string | null;
    gelar: string | null;
    penggunaNama: string | null;
  }>(
    `SELECT pr.id                AS practitionerId,
            peg.NAMA             AS pegawaiNama,
            peg.GELAR_BELAKANG   AS gelar,
            pgn.NAMA             AS penggunaNama
       FROM layanan.tindakan_medis tm
       JOIN aplikasi.pengguna pgn        ON pgn.ID    = tm.OLEH
       JOIN \`kemkes-ihs\`.practitioner pr ON pr.refId = pgn.NIK
  LEFT JOIN master.pegawai peg           ON peg.NIP   = pgn.NIP
      WHERE tm.ID = ?
      LIMIT 1`,
    [refId],
  );

  const r = rows[0];
  if (!r || !r.practitionerId) return null;

  const nama = (r.pegawaiNama || r.penggunaNama || "").trim();
  if (!nama) return null;
  const gelar = (r.gelar || "").trim();
  const display = gelar ? `${nama.toUpperCase()}, ${gelar}` : nama.toUpperCase();

  return { display, reference: `Practitioner/${r.practitionerId}` };
}

/**
 * Sisipkan performer default ke payload ServiceRequest LAB bila performer KOSONG
 * dan tahun data >= 2026. Payload dimutasi di tempat. Return true bila disisipkan.
 *
 * performer[0] = LEAD statis (dr. Sp.PK). performer[1] = `analyst` (dinamis) bila
 * diberikan, selain itu analis default. Bila analis == lead (kasus petugas = dr.
 * PK sendiri) → cukup satu entri (dedupe). Tidak menimpa performer yang sudah ada;
 * tidak menyentuh DB.
 */
export function injectDefaultLabPerformer(
  payload: Record<string, unknown>,
  nopen: string | null | undefined,
  analyst?: PerformerRef | null,
): boolean {
  const cur = payload.performer;
  if (Array.isArray(cur) && cur.length > 0) return false; // sudah ada → jangan timpa
  if (!isYear2026OrLater(nopen)) return false; // hanya 2026+

  const second = analyst ?? DEFAULT_PERFORMER_ANALYST;
  const performers: PerformerRef[] = [{ ...DEFAULT_PERFORMER_LEAD }];
  if (second.reference !== DEFAULT_PERFORMER_LEAD.reference) {
    performers.push({ ...second }); // dedupe bila analis = lead
  }
  payload.performer = performers;
  return true;
}

/**
 * Orkestrasi read-side untuk enrichment performer lab (dipakai route GET):
 * gating (performer kosong & 2026+) → resolusi analis DINAMIS via `refId` →
 * sisip performer. Return true bila payload dimodifikasi.
 */
export async function enrichLabPerformer(
  payload: Record<string, unknown>,
  nopen: string | null | undefined,
  refId: string,
): Promise<boolean> {
  const cur = payload.performer;
  if (Array.isArray(cur) && cur.length > 0) return false;
  if (!isYear2026OrLater(nopen)) return false;
  const analyst = await resolveLabAnalystPerformer(refId);
  return injectDefaultLabPerformer(payload, nopen, analyst);
}
