// lib/dal/practitioner-writeback.ts
// ─────────────────────────────────────────────────────────────
// Write-back data IHS Practitioner (nakes) ke SIMGOS setelah RESOLUSI dari
// Satu Sehat (GET /Practitioner?identifier=nik|<NIK>).
//
// Practitioner adalah resource MASTER nasional — TIDAK dibuat (POST) dari sini,
// melainkan di-resolusi berdasarkan NIK. Response GET adalah Bundle searchset;
// dari resource Practitioner-nya kita isi kolom `kemkes-ihs.practitioner` yang
// MASIH KOSONG: id, identifier, meta, name, telecom, address, qualification,
// gender, birthDate — ditautkan via **refId = NIK** (PK).
//
// 🔒 KEBIJAKAN (disepakati, sama pola dengan patient-writeback):
//   • Isi HANYA kolom yang MASIH KOSONG (NULL / '') — tidak pernah menimpa
//     (per-kolom via COALESCE). Write-back berulang hanya menambal yang kurang.
//   • Satu-satunya jalur tulis: `simgosExecute` (UPDATE saja). Tabel/kolom dari
//     whitelist tetap; nilai di-bind.
// ─────────────────────────────────────────────────────────────

import { simgosExecute } from "@/app/lib/db/simgos";
import { nikFromIdentifierParam } from "@/app/lib/dal/patient-writeback";

const NIK_RE = /^\d{16}$/;
// IHS nakes id: alfanumerik + titik/strip (FHIR id), muat di char.
const IHS_ID_RE = /^[A-Za-z0-9.\-]{1,64}$/;
// Nilai skalar aman untuk gender (kode FHIR) — huruf/strip kecil.
const GENDER_RE = /^[a-z-]{1,16}$/;
// birthDate FHIR: YYYY-MM-DD (partial date diterima apa adanya bila valid).
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Kolom write-back + tipe (menentukan ekspresi SET & syarat "kosong"). */
const WRITE_COLS = [
  { col: "id", kind: "str" },
  { col: "name", kind: "json" },
  { col: "identifier", kind: "json" },
  { col: "meta", kind: "json" },
  { col: "telecom", kind: "json" },
  { col: "address", kind: "json" },
  { col: "qualification", kind: "json" },
  { col: "gender", kind: "str" },
  { col: "birthDate", kind: "str" },
] as const;
type WriteCol = (typeof WRITE_COLS)[number]["col"];
export type PractitionerWriteFields = Partial<Record<WriteCol, string>>;

/**
 * Ambil resource Practitioner dari response Satu Sehat: Bundle searchset
 * (entry ber-resourceType Practitioner, utamakan yang punya `id`) atau resource
 * Practitioner langsung.
 */
export function extractPractitionerResource(
  data: unknown,
): Record<string, unknown> | null {
  if (!isRecord(data)) return null;
  if (data.resourceType === "Practitioner") return data;
  if (data.resourceType === "Bundle" && Array.isArray(data.entry)) {
    let fallback: Record<string, unknown> | null = null;
    for (const e of data.entry) {
      if (!isRecord(e)) continue;
      const res = e.resource;
      if (!isRecord(res) || res.resourceType !== "Practitioner") continue;
      if (typeof res.id === "string" && res.id.trim()) return res; // ber-id menang
      if (!fallback) fallback = res;
    }
    return fallback;
  }
  return null;
}

/** Ambil NIK dari resource Practitioner (identifier system diakhiri "/nik"). */
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

/**
 * Rakit nilai kolom write-back dari resource Practitioner. Kolom JSON di-
 * stringify (hanya bila bentuknya valid & tak kosong); skalar divalidasi.
 */
export function buildPractitionerFields(
  resource: Record<string, unknown>,
): PractitionerWriteFields {
  const out: PractitionerWriteFields = {};

  const id = typeof resource.id === "string" ? resource.id.trim() : "";
  if (id && IHS_ID_RE.test(id)) out.id = id;

  for (const jsonCol of ["name", "identifier", "telecom", "address", "qualification"] as const) {
    const v = resource[jsonCol];
    if (Array.isArray(v) && v.length > 0) out[jsonCol] = JSON.stringify(v);
  }
  const meta = resource.meta;
  if (isRecord(meta) && Object.keys(meta).length > 0) {
    out.meta = JSON.stringify(meta);
  }

  const gender = typeof resource.gender === "string" ? resource.gender.trim().toLowerCase() : "";
  if (gender && GENDER_RE.test(gender)) out.gender = gender;

  const bd = typeof resource.birthDate === "string" ? resource.birthDate.trim() : "";
  if (bd && DATE_RE.test(bd)) out.birthDate = bd;

  return out;
}

/**
 * Update baris SIMGOS `practitioner` untuk NIK (refId) tertentu — isi kolom yang
 * kosong saja (per-kolom, tidak menimpa). WHERE dijaga agar hanya menyentuh
 * baris dgn minimal satu kolom target kosong. Mengembalikan affectedRows.
 */
export async function updatePractitionerRecord(
  nik: string,
  fields: PractitionerWriteFields,
): Promise<number> {
  if (!NIK_RE.test(nik)) throw new Error("NIK tidak valid untuk write-back");
  if (fields.id && !IHS_ID_RE.test(fields.id)) {
    throw new Error("IHS id tidak valid untuk write-back");
  }

  const present = WRITE_COLS.filter((c) => fields[c.col] != null);
  if (present.length === 0) return 0;

  // Kolom dari whitelist tetap → aman di-backtick. JSON via CAST(? AS JSON);
  // skalar via NULLIF(col,'') agar "" juga dianggap kosong.
  const sets = present.map((c) =>
    c.kind === "json"
      ? `\`${c.col}\` = COALESCE(\`${c.col}\`, CAST(? AS JSON))`
      : `\`${c.col}\` = COALESCE(NULLIF(\`${c.col}\`, ''), ?)`,
  );
  const emptyConds = present.map((c) =>
    c.kind === "json"
      ? `\`${c.col}\` IS NULL`
      : `\`${c.col}\` IS NULL OR \`${c.col}\` = ''`,
  );
  const params: unknown[] = [...present.map((c) => fields[c.col]), nik];

  const sql =
    `UPDATE \`kemkes-ihs\`.\`practitioner\` SET ${sets.join(", ")} ` +
    `WHERE \`refId\` = ? AND (${emptyConds.join(" OR ")})`;

  return simgosExecute(sql, params);
}

/**
 * Write-back data Practitioner dari response GET Satu Sehat. NIK diprioritaskan
 * dari resource (identifier /nik) → `knownNik` (NIK yang dicari). Return null
 * bila resource/NIK tak bisa diambil atau tak ada kolom yang bisa diisi.
 */
export async function writeBackPractitionerRecord(
  responseData: unknown,
  opts: { knownNik?: string } = {},
): Promise<{
  nik: string;
  ihsId: string | null;
  cols: WriteCol[];
  updated: number;
} | null> {
  const resource = extractPractitionerResource(responseData);
  if (!resource) return null;

  const fields = buildPractitionerFields(resource);
  const cols = WRITE_COLS.map((c) => c.col).filter((c) => fields[c] != null);
  if (cols.length === 0) return null;

  const knownNik =
    opts.knownNik && NIK_RE.test(opts.knownNik) ? opts.knownNik : null;
  const nik = extractNik(resource) ?? knownNik;
  if (!nik) return null;

  const updated = await updatePractitionerRecord(nik, fields);
  return { nik, ihsId: fields.id ?? null, cols, updated };
}

/**
 * Gerbang dari route GET /api/fhir/Practitioner: bila sukses (2xx) & query
 * `identifier` memuat NIK, write-back id + data ke SIMGOS. Fire-and-forget:
 * kegagalan hanya di-log, tak membatalkan response.
 */
export async function maybePractitionerGetWriteBack(params: {
  searchParams: URLSearchParams;
  resource: string;
  status: number;
  responseData: unknown;
}): Promise<void> {
  const { searchParams, resource, status, responseData } = params;
  if (resource !== "Practitioner") return;
  if (status < 200 || status >= 300) return;
  const knownNik = nikFromIdentifierParam(searchParams.get("identifier") ?? undefined);
  if (!knownNik) return;
  try {
    const wb = await writeBackPractitionerRecord(responseData, { knownNik });
    if (wb) {
      console.log(
        `[practitioner GET writeback] nik=${wb.nik} id=${wb.ihsId ?? "-"} cols=${wb.cols.join("+")} rows=${wb.updated}`,
      );
    }
  } catch (err) {
    console.error("[practitioner GET writeback] gagal update SIMGOS practitioner:", err);
  }
}
