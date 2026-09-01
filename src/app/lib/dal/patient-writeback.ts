// lib/dal/patient-writeback.ts
// ─────────────────────────────────────────────────────────────
// Write-back data IHS Patient ke SIMGOS setelah interaksi Satu Sehat.
//
// Kolom yang diisi: `id`, `identifier`, `meta`, `name` — semuanya diambil
// dari resource Patient yang di-echo Satu Sehat. Dua sumber response:
//   • POST /Patient (2xx)      → resource Patient langsung.
//   • GET /Patient?identifier= → Bundle searchset (entry[].resource).
//
// 🔒 KEBIJAKAN (disepakati):
//   • Isi HANYA kolom yang MASIH KOSONG (NULL / '') — tidak pernah menimpa
//     (per-kolom, via COALESCE(NULLIF(col,''), ?)). Jadi write-back berulang
//     hanya menambal yang kurang, tak mengubah data yang sudah benar.
//   • Ditautkan via NIK. NIK tidak unik (ada NIK ganda) tapi IHS id/identitas
//     bersifat per-orang, jadi mengisi semua baris kosong ber-NIK sama tetap
//     konsisten.
//   • Satu-satunya jalur tulis: `simgosExecute` (UPDATE saja).
// ─────────────────────────────────────────────────────────────

import { simgosExecute } from "@/app/lib/db/simgos";

const NIK_RE = /^\d{16}$/;
// IHS Patient id: alfanumerik + titik/strip (FHIR id), muat di char(36).
const IHS_ID_RE = /^[A-Za-z0-9.\-]{1,36}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Kolom yang boleh di-write-back (whitelist tetap → aman untuk di-backtick). */
const WRITE_COLS = ["id", "identifier", "meta", "name"] as const;
type WriteCol = (typeof WRITE_COLS)[number];
export type PatientWriteFields = Partial<Record<WriteCol, string>>;

/**
 * Ambil resource Patient dari response Satu Sehat. Mendukung dua bentuk:
 *   • Patient langsung (POST create) — `resourceType: "Patient"`.
 *   • Bundle searchset (GET by NIK) — ambil entry pertama ber-resourceType
 *     Patient (utamakan yang punya `id`).
 */
export function extractPatientResource(
  data: unknown,
): Record<string, unknown> | null {
  if (!isRecord(data)) return null;
  if (data.resourceType === "Patient") return data;
  if (data.resourceType === "Bundle" && Array.isArray(data.entry)) {
    let fallback: Record<string, unknown> | null = null;
    for (const e of data.entry) {
      if (!isRecord(e)) continue;
      const res = e.resource;
      if (!isRecord(res) || res.resourceType !== "Patient") continue;
      if (typeof res.id === "string" && res.id.trim()) return res; // yang ber-id menang
      if (!fallback) fallback = res;
    }
    return fallback;
  }
  return null;
}

/** Ambil NIK dari resource Patient (identifier dgn system diakhiri "/nik"). */
export function extractNik(resource: unknown): string | null {
  if (!isRecord(resource)) return null;
  const ids = resource.identifier;
  if (!Array.isArray(ids)) return null;
  for (const idf of ids) {
    if (
      isRecord(idf) &&
      typeof idf.system === "string" &&
      typeof idf.value === "string" &&
      idf.system.endsWith("/nik")
    ) {
      const v = idf.value.trim();
      if (NIK_RE.test(v)) return v;
    }
  }
  return null;
}

/** Ambil id resource (IHS Patient id) dari resource Patient. */
export function extractResourceId(resource: unknown): string | null {
  if (!isRecord(resource)) return null;
  const id = resource.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** Ambil NIK dari nilai query `identifier` (format FHIR `system|value`). */
export function nikFromIdentifierParam(v: string | undefined): string | null {
  if (!v) return null;
  const val = v.includes("|") ? v.slice(v.lastIndexOf("|") + 1) : v;
  const t = val.trim();
  return NIK_RE.test(t) ? t : null;
}

/**
 * Rakit nilai kolom write-back dari resource Patient. Kolom JSON
 * (identifier/meta/name) di-stringify; hanya disertakan bila bentuknya valid
 * & tidak kosong. `id` disertakan bila lolos IHS_ID_RE.
 */
export function buildPatientFields(
  resource: Record<string, unknown>,
): PatientWriteFields {
  const out: PatientWriteFields = {};

  const id = extractResourceId(resource);
  if (id && IHS_ID_RE.test(id)) out.id = id;

  const identifier = resource.identifier;
  if (Array.isArray(identifier) && identifier.length > 0) {
    out.identifier = JSON.stringify(identifier);
  }

  const meta = resource.meta;
  if (isRecord(meta) && Object.keys(meta).length > 0) {
    out.meta = JSON.stringify(meta);
  }

  const name = resource.name;
  if (Array.isArray(name) && name.length > 0) {
    out.name = JSON.stringify(name);
  }

  return out;
}

/**
 * Update baris SIMGOS `patient` untuk NIK tertentu — isi kolom yang kosong
 * saja (per-kolom, tidak menimpa). WHERE dijaga agar hanya menyentuh baris
 * yang punya minimal satu kolom target kosong. Mengembalikan affectedRows.
 */
export async function updatePatientRecord(
  nik: string,
  fields: PatientWriteFields,
): Promise<number> {
  if (!NIK_RE.test(nik)) throw new Error("NIK tidak valid untuk write-back");
  if (fields.id && !IHS_ID_RE.test(fields.id)) {
    throw new Error("IHS id tidak valid untuk write-back");
  }

  const cols = WRITE_COLS.filter((c) => fields[c] != null);
  if (cols.length === 0) return 0;

  // Nama kolom dari whitelist tetap (WRITE_COLS) → aman di-backtick.
  const sets = cols.map((c) => `\`${c}\` = COALESCE(NULLIF(\`${c}\`, ''), ?)`);
  const emptyConds = cols.map((c) => `\`${c}\` IS NULL OR \`${c}\` = ''`);
  const params: unknown[] = [...cols.map((c) => fields[c]), nik];

  const sql =
    `UPDATE \`kemkes-ihs\`.\`patient\` SET ${sets.join(", ")} ` +
    `WHERE \`nik\` = ? AND (${emptyConds.join(" OR ")})`;

  return simgosExecute(sql, params);
}

/**
 * Write-back data Patient dari response Satu Sehat (POST create ATAU GET by
 * NIK). NIK diprioritaskan: dari resource → `knownNik` (mis. NIK yang dicari
 * di GET) → payload request. Return null bila resource/NIK tak bisa diambil.
 */
export async function writeBackPatientRecord(
  responseData: unknown,
  opts: { requestPayload?: unknown; knownNik?: string } = {},
): Promise<{
  nik: string;
  ihsId: string | null;
  cols: WriteCol[];
  updated: number;
} | null> {
  const resource = extractPatientResource(responseData);
  if (!resource) return null;

  const fields = buildPatientFields(resource);
  const cols = WRITE_COLS.filter((c) => fields[c] != null);
  if (cols.length === 0) return null;

  const knownNik =
    opts.knownNik && NIK_RE.test(opts.knownNik) ? opts.knownNik : null;
  const nik =
    extractNik(resource) ?? knownNik ?? extractNik(opts.requestPayload);
  if (!nik) return null;

  const updated = await updatePatientRecord(nik, fields);
  return { nik, ihsId: fields.id ?? null, cols, updated };
}
