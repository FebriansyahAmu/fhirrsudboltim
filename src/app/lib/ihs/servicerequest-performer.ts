// lib/ihs/servicerequest-performer.ts
// ─────────────────────────────────────────────────────────────
// Performer default untuk ServiceRequest LAB.
//
// Satu Sehat mewajibkan `ServiceRequest.performer` (RuleNumber 10377). Untuk lab,
// SIMGOS memateralisasi performer dari `layanan.petugas_tindakan_medis` (petugas
// yang mengerjakan tindakan) via trigger `service_request_before_update`. Bila
// order lab belum punya petugas → performer NULL → payload tak memuatnya → ditolak.
//
// Sebagai fallback yang DISETUJUI, kita sisipkan performer default (dokter PK
// penanggung jawab + analis) ke PAYLOAD saat kirim, HANYA untuk data tahun 2026+
// (2025 ke bawah dilewati). Ini murni read-side (payload): kolom `performer` di
// SIMGOS TIDAK bisa ditulis balik karena trigger `service_request_before_update`
// selalu menghitung ulang performer dari petugas pada setiap UPDATE (meng-clobber
// nilai apa pun yang kita set) — jadi enrichment ini di-terapkan ulang tiap kirim.
// ─────────────────────────────────────────────────────────────

/** Performer default lab (disetujui): dokter PK penanggung jawab + analis. */
export const DEFAULT_LAB_PERFORMER: ReadonlyArray<{
  display: string;
  reference: string;
}> = [
  { display: "dr. ISWANTO KOROMPOT, Sp.PK", reference: "Practitioner/10012124306" },
  { display: "HIDAYAT BUCHARI, A.Md.Ak", reference: "Practitioner/10039629610" },
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
 * Sisipkan performer default ke payload ServiceRequest LAB bila performer KOSONG
 * dan tahun data >= 2026. Payload dimutasi di tempat. Return true bila disisipkan.
 * Tidak menimpa performer yang sudah ada; tidak menyentuh DB.
 */
export function injectDefaultLabPerformer(
  payload: Record<string, unknown>,
  nopen: string | null | undefined,
): boolean {
  const cur = payload.performer;
  if (Array.isArray(cur) && cur.length > 0) return false; // sudah ada → jangan timpa
  if (!isYear2026OrLater(nopen)) return false; // hanya 2026+
  payload.performer = DEFAULT_LAB_PERFORMER.map((p) => ({ ...p }));
  return true;
}
