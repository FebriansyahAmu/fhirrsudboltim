// lib/ihs/patient.source.ts
// ─────────────────────────────────────────────────────────────
// Rakit payload FHIR Patient (Create by NIK) langsung dari SUMBER
// `master.pasien` (bukan dari staging `kemkes-ihs`.patient yang bisa
// kosong utk baris belum-terkirim).
//
// Dipakai untuk kasus "POST manual": pasien yang belum pernah dapat
// nomor IHS (mis. NIK belum ter-resolve) → operator menyalin payload
// lengkap ke form lalu meninjau & mengirim sendiri.
//
// Bentuk sub-struktur (address/telecom/communication/maritalStatus)
// diambil dari FUNCTION SIMGOS yang sama dengan trigger `patient`,
// sehingga formatnya identik dengan yang biasa dikirim SIMGOS.
//
// 🔒 READ-ONLY: hanya SELECT + pemanggilan function deterministik.
//    Tidak ada INSERT/UPDATE/DELETE. Tidak melakukan POST ke Satu Sehat.
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";

const PROFILE = "https://fhir.kemkes.go.id/r4/StructureDefinition/Patient";
const NIK_SYSTEM = "https://fhir.kemkes.go.id/id/nik";

// JENIS_KELAMIN SIMGOS → gender FHIR (1=laki, 2=perempuan).
function mapGender(jk: unknown): "male" | "female" | "unknown" {
  const v = String(jk);
  if (v === "1") return "male";
  if (v === "2") return "female";
  return "unknown";
}

/** Parse nilai kolom JSON (driver bisa mengembalikan string atau objek). */
function jparse(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** Hilangkan alamat duplikat (getPatientAddress UNION KTP + domisili). */
function dedupeAddresses(addr: unknown): unknown[] | null {
  if (!Array.isArray(addr)) return null;
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const a of addr) {
    const k = JSON.stringify(a);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(a);
    }
  }
  return out.length ? out : null;
}

export interface PatientSourceResult {
  resourceType: "Patient";
  payload: Record<string, unknown>;
  /** Field wajib yang kosong di sumber — untuk peringatan di UI. */
  missing: string[];
}

/**
 * Rakit payload Patient dari `master.pasien` untuk satu NORM (refId).
 * Mengembalikan `null` bila NORM tidak ditemukan.
 */
export async function getPatientCreatePayload(
  norm: string,
): Promise<PatientSourceResult | null> {
  const rows = await simgosQuery<Record<string, unknown>>(
    `SELECT
        kip.NOMOR                                       AS nik,
        p.NAMA                                          AS nama,
        p.STATUS                                        AS status,
        DATE_FORMAT(p.TANGGAL_LAHIR, '%Y-%m-%d')        AS birthDate,
        p.JENIS_KELAMIN                                 AS jk,
        \`kemkes-ihs\`.getPatientAddress(p.NORM)          AS address,
        \`kemkes-ihs\`.getPatientTelecom(p.NORM)          AS telecom,
        \`kemkes-ihs\`.getPatientCommunication(p.NORM)    AS communication,
        IF(\`kemkes-ihs\`.getObjectMappingReferensi(5, p.STATUS_PERKAWINAN) IS NOT NULL,
           JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObjectMappingReferensi(5, p.STATUS_PERKAWINAN))),
           NULL)                                        AS maritalStatus
      FROM \`master\`.pasien p
      LEFT JOIN \`master\`.kartu_identitas_pasien kip
        ON kip.NORM = p.NORM AND kip.JENIS = 1
      WHERE p.NORM = ?
      LIMIT 1`,
    [norm],
  );

  const r = rows[0];
  if (!r) return null;

  const nik = r.nik == null ? "" : String(r.nik);
  const nama = r.nama == null ? "" : String(r.nama);
  const birthDate = r.birthDate == null ? "" : String(r.birthDate);
  const gender = mapGender(r.jk);
  const address = dedupeAddresses(jparse(r.address));

  // ── Wajib (Create by NIK): NIK, nama, gender, tgl lahir, alamat ──
  const missing: string[] = [];
  if (!nik) missing.push("NIK");
  if (!nama) missing.push("nama");
  if (!birthDate) missing.push("tanggal lahir");
  if (gender === "unknown") missing.push("jenis kelamin");
  if (!address) missing.push("alamat");

  const payload: Record<string, unknown> = {
    resourceType: "Patient",
    meta: { profile: [PROFILE] },
    identifier: [{ use: "official", system: NIK_SYSTEM, value: nik }],
    active: Number(r.status) === 1,
    name: [{ use: "official", text: nama }],
    gender,
    birthDate,
    deceasedBoolean: false,
    multipleBirthInteger: 0,
  };

  // ── Opsional: hanya disertakan bila ada di sumber ──
  if (address) payload.address = address;
  const telecom = jparse(r.telecom);
  if (telecom) payload.telecom = telecom;
  const maritalStatus = jparse(r.maritalStatus);
  if (maritalStatus) payload.maritalStatus = maritalStatus;
  const communication = jparse(r.communication);
  if (communication) payload.communication = communication;

  return { resourceType: "Patient", payload, missing };
}
