// lib/ihs/encounter-subject.ts
// ─────────────────────────────────────────────────────────────
// Resolusi Encounter.subject (Pasien) dari SIMGOS untuk MELENGKAPI payload/
// tampilan Encounter yang kolom `subject`-nya BASI (null).
//
// LATAR: kolom `kemkes-ihs.encounter.subject` di-materialisasi oleh trigger
// SIMGOS HANYA saat baris dibuat — dan hanya bila pasien SUDAH punya IHS id
// saat itu. Bila Patient baru di-POST BELAKANGAN (write-back mengisi
// `patient.id`), kolom `encounter.subject` TIDAK ikut diperbarui → tetap null.
// Akibatnya nama pasien kosong di panel & payload Encounter tak punya
// `subject.reference` (gagal kirim). Kita resolusi ulang secara LIVE di sini.
//
// Rantai (read-only):
//   encounter.refId (= NOPEN / No. Pendaftaran)
//     → pendaftaran.pendaftaran.NOMOR → NORM
//     → kemkes-ihs.patient.refId = NORM → id (IHS Patient id)
//   (+ nama tampilan dari master.pasien.NAMA — sama seperti yang dipakai
//    trigger SIMGOS untuk subject.display)
//
// 🔒 Hanya SELECT (lewat simgosQuery). Tidak menulis apa pun ke SIMGOS.
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";

// IHS Patient id: alfanumerik + titik/strip (FHIR id), muat di char(36).
const IHS_ID_RE = /^[A-Za-z0-9.\-]{1,36}$/;
const NOPEN_RE = /^\d{1,10}$/;

export interface EncounterSubject {
  reference: string; // "Patient/<ihsId>"
  display?: string;
}

function toSubject(ihsId: unknown, nama: unknown): EncounterSubject | null {
  const id = String(ihsId ?? "").trim();
  if (!IHS_ID_RE.test(id)) return null;
  const display = String(nama ?? "").trim();
  return { reference: `Patient/${id}`, ...(display ? { display } : {}) };
}

/**
 * Cari subject (Pasien) sebuah Encounter berdasarkan No. Pendaftaran (NOPEN).
 * Return null bila pasien tak tertaut atau belum punya IHS id (baris tetap
 * tanpa subject → tetap "menunggu Patient"; tidak dipaksa).
 */
export async function resolveEncounterSubject(
  nopen: string,
): Promise<EncounterSubject | null> {
  if (!NOPEN_RE.test(nopen)) return null;
  const rows = await simgosQuery<{ ihsId: string; nama: string | null }>(
    `SELECT k.id AS ihsId, mp.NAMA AS nama
       FROM \`pendaftaran\`.\`pendaftaran\` p
       JOIN \`kemkes-ihs\`.\`patient\` k ON k.refId = p.NORM
       LEFT JOIN \`master\`.\`pasien\` mp ON mp.NORM = p.NORM
      WHERE p.NOMOR = ? AND k.id IS NOT NULL AND k.id <> ''
      LIMIT 1`,
    [nopen],
  );
  const row = rows[0];
  return row ? toSubject(row.ihsId, row.nama) : null;
}

/**
 * Versi batch: resolusi subject untuk banyak NOPEN sekaligus (satu kueri).
 * Dipakai panel agar tak N+1 saat memuat satu halaman baris. Key map = NOPEN.
 */
export async function resolveEncounterSubjectsByNopen(
  nopens: string[],
): Promise<Map<string, EncounterSubject>> {
  const clean = [...new Set(nopens.filter((n) => NOPEN_RE.test(n)))];
  const out = new Map<string, EncounterSubject>();
  if (clean.length === 0) return out;

  const placeholders = clean.map(() => "?").join(", ");
  const rows = await simgosQuery<{
    nopen: string;
    ihsId: string;
    nama: string | null;
  }>(
    `SELECT p.NOMOR AS nopen, k.id AS ihsId, mp.NAMA AS nama
       FROM \`pendaftaran\`.\`pendaftaran\` p
       JOIN \`kemkes-ihs\`.\`patient\` k
         ON k.refId = p.NORM AND k.id IS NOT NULL AND k.id <> ''
       LEFT JOIN \`master\`.\`pasien\` mp ON mp.NORM = p.NORM
      WHERE p.NOMOR IN (${placeholders})`,
    clean,
  );

  for (const r of rows) {
    const nopen = String(r.nopen ?? "");
    if (!nopen || out.has(nopen)) continue; // yang pertama menang
    const sub = toSubject(r.ihsId, r.nama);
    if (sub) out.set(nopen, sub);
  }
  return out;
}
