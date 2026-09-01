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

// ── Petunjuk "calon pasien" untuk baris yang masih Menunggu Patient ─────────
// Baris ini pasiennya BELUM punya IHS id (belum di-POST), jadi kolom Pasien
// tetap "—". Untuk membantu operator tahu INI pasien siapa (nama + NIK), kita
// resolusi dari MASTER SIMGOS (bukan dari kemkes-ihs). Hanya untuk tooltip —
// nama TIDAK ditaruh di kolom Pasien.
//   NOPEN → pendaftaran.pendaftaran.NORM
//         → master.pasien.NAMA (+ gelar)
//         → master.kartu_identitas_pasien.NOMOR (NIK, JENIS = 1)

export interface EncounterPatientHint {
  name?: string;
  nik?: string;
}

/** Susun nama tampilan pasien: "<gelar depan> <NAMA>, <gelar belakang>". */
function buildPatientName(
  nama: unknown,
  gd: unknown,
  gb: unknown,
): string | undefined {
  const n = String(nama ?? "").trim();
  if (!n) return undefined;
  const front = String(gd ?? "").trim();
  const back = String(gb ?? "").trim();
  let s = front ? `${front} ${n}` : n;
  if (back) s = `${s}, ${back}`;
  return s;
}

/**
 * Batch: resolusi petunjuk (nama + NIK) untuk banyak NOPEN. Key map = NOPEN.
 * Hanya baris yang punya minimal nama ATAU NIK yang dimasukkan.
 */
export async function resolveEncounterPatientHintsByNopen(
  nopens: string[],
): Promise<Map<string, EncounterPatientHint>> {
  const clean = [...new Set(nopens.filter((n) => NOPEN_RE.test(n)))];
  const out = new Map<string, EncounterPatientHint>();
  if (clean.length === 0) return out;

  const placeholders = clean.map(() => "?").join(", ");
  const rows = await simgosQuery<{
    nopen: string;
    nama: string | null;
    gd: string | null;
    gb: string | null;
    nik: string | null;
  }>(
    `SELECT p.NOMOR AS nopen, mp.NAMA AS nama, mp.GELAR_DEPAN AS gd,
            mp.GELAR_BELAKANG AS gb, ki.NOMOR AS nik
       FROM \`pendaftaran\`.\`pendaftaran\` p
       JOIN \`master\`.\`pasien\` mp ON mp.NORM = p.NORM
       LEFT JOIN \`master\`.\`kartu_identitas_pasien\` ki
         ON ki.NORM = p.NORM AND ki.JENIS = 1
      WHERE p.NOMOR IN (${placeholders})`,
    clean,
  );

  for (const r of rows) {
    const nopen = String(r.nopen ?? "");
    if (!nopen || out.has(nopen)) continue; // yang pertama menang
    const name = buildPatientName(r.nama, r.gd, r.gb);
    const nikRaw = String(r.nik ?? "").trim();
    const nik = nikRaw || undefined;
    if (name || nik) {
      out.set(nopen, { ...(name ? { name } : {}), ...(nik ? { nik } : {}) });
    }
  }
  return out;
}
