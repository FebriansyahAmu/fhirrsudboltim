// lib/dal/clinical-writeback.ts
// ─────────────────────────────────────────────────────────────
// Write-back hasil POST/GET resource KLINIS (CarePlan/Condition/Observation/
// Procedure/ClinicalImpression/ServiceRequest/Specimen/AllergyIntolerance/
// MedicationRequest/MedicationDispense/DiagnosticReport/QuestionnaireResponse)
// yang SUKSES (2xx) ke tabel staging SIMGOS. GET (by-id / search Bundle) dipakai
// untuk MEMPERBAIKI baris yang "terlanjur" terkirim sebelum ada write-back.
//
// Menulis (isi HANYA kolom yang masih kosong — tidak menimpa):
//   • `id`        ← id resource IHS dari response (char).
//   • subject/patient ← objek subject dari response (json) — supaya kolom yang
//     tadinya BASI (null, lalu di-enrich live saat kirim) jadi persisten.
//   • encounter/context ← objek encounter dari response (json) — idem, untuk
//     data ranap yang encounter-ref-nya sebelumnya yatim.
//
// Baris di-identifikasi via (module, key) yang DIKIRIM CLIENT — resource klinis
// tak punya identifier yang bisa ditautkan balik dari response (identifier: []).
//
// 🔒 Satu-satunya jalur tulis = `simgosExecute` (UPDATE saja). Nama tabel/kolom
//    berasal dari registry TEPERCAYA dan divalidasi `ident()`; nilai di-bind
//    sebagai parameter (prepared statement). Statement selalu UPDATE.
// ─────────────────────────────────────────────────────────────

import { simgosExecute } from "@/app/lib/db/simgos";
import {
  getModuleSpec,
  subjectRefOf,
  encounterDepOf,
  type IhsModuleSpec,
} from "@/app/lib/ihs/registry";

const IHS_ID_RE = /^[A-Za-z0-9.\-]{1,64}$/;

/** Validasi identifier (nama tabel/kolom) — registry tepercaya, tetap dijaga. */
function ident(s: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(s)) {
    throw new Error(`Identifier tidak valid: ${s}`);
  }
  return s;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Nilai referensi (objek/array) yang layak ditulis-balik ke kolom JSON. */
function refValue(v: unknown): unknown | null {
  if (isRecord(v) || Array.isArray(v)) return v;
  return null;
}

/**
 * Normalisasi response Satu Sehat ke SATU resource `resourceType`:
 *   • resource langsung (POST/GET-by-id) → dipakai apa adanya.
 *   • Bundle searchset (GET search) → ambil entry yang cocok, HANYA bila tepat
 *     satu (ambigu → null, jangan menebak baris mana yang dimaksud).
 * Return null bila tak ada yang cocok/valid.
 */
function extractResource(
  data: unknown,
  resourceType: string,
): Record<string, unknown> | null {
  if (!isRecord(data)) return null;
  if (data.resourceType === resourceType) return data;
  if (data.resourceType === "Bundle" && Array.isArray(data.entry)) {
    const matches: Record<string, unknown>[] = [];
    for (const e of data.entry) {
      if (!isRecord(e)) continue;
      const r = e.resource;
      if (isRecord(r) && r.resourceType === resourceType) matches.push(r);
    }
    return matches.length === 1 ? matches[0] : null;
  }
  return null;
}

/**
 * Write-back id + subject + encounter untuk satu baris staging klinis.
 * Return kolom yang di-set + jumlah baris terpengaruh, atau null bila tak ada
 * yang bisa ditulis. Idempotent: fill-only-empty → panggilan ulang jadi no-op.
 */
export async function writeBackClinicalResource(params: {
  spec: IhsModuleSpec;
  key: string;
  responseData: unknown;
}): Promise<{ cols: string[]; updated: number } | null> {
  const { spec, key } = params;
  // Normalisasi: resource langsung, atau entry tunggal dari Bundle (GET search).
  const responseData = extractResource(params.responseData, spec.resourceType);
  if (!responseData) return null;

  const setParts: string[] = [];
  const setParams: unknown[] = [];
  const cols: string[] = [];
  // Kondisi "kolom masih kosong" — dipakai di WHERE agar baris HANYA disentuh
  // bila ada minimal satu kolom target yang null (tulis IF null; tak menimpa).
  const emptyConds: string[] = [];

  // id (char) — isi bila kosong.
  const ihsId =
    typeof responseData.id === "string" ? responseData.id.trim() : "";
  if (IHS_ID_RE.test(ihsId)) {
    setParts.push("`id` = COALESCE(NULLIF(`id`, ''), ?)");
    setParams.push(ihsId);
    emptyConds.push("(`id` IS NULL OR `id` = '')");
    cols.push("id");
  }

  // subject/patient (json) — dari response[refCol]. Isi HANYA bila kolom null.
  const subj = subjectRefOf(spec);
  if (subj) {
    const col = ident(subj.refCol);
    const val = refValue(responseData[subj.refCol]);
    if (val != null) {
      setParts.push(`\`${col}\` = COALESCE(\`${col}\`, CAST(? AS JSON))`);
      setParams.push(JSON.stringify(val));
      emptyConds.push(`\`${col}\` IS NULL`);
      cols.push(col);
    }
  }

  // encounter/context (json) — dari response[refCol]. Isi HANYA bila kolom null.
  const enc = encounterDepOf(spec);
  if (enc) {
    const col = ident(enc.refCol);
    const val = refValue(responseData[enc.refCol]);
    if (val != null) {
      setParts.push(`\`${col}\` = COALESCE(\`${col}\`, CAST(? AS JSON))`);
      setParams.push(JSON.stringify(val));
      emptyConds.push(`\`${col}\` IS NULL`);
      cols.push(col);
    }
  }

  if (setParts.length === 0) return null;

  // WHERE key — PK tunggal (keyCol) atau komposit (keyCol + keyCols, dipisah "_").
  const table = ident(spec.table);
  const keyCol = ident(spec.keyCol);
  const parts = key.split("_");
  const whereConds = [`\`${keyCol}\` = ?`];
  const whereParams: unknown[] = [parts[0]];
  (spec.keyCols ?? []).forEach((c, i) => {
    whereConds.push(`\`${ident(c)}\` = ?`);
    whereParams.push(parts[i + 1]);
  });
  // Guard keamanan id: baris hanya boleh disentuh bila `id`-nya masih kosong
  // ATAU sudah sama dengan id resource ini. Mencegah baris yang sudah tertaut
  // resource LAIN ikut ter-update (penting untuk jalur GET, di mana response
  // bisa saja resource yang berbeda dari baris staging).
  if (cols.includes("id")) {
    whereConds.push("(`id` IS NULL OR `id` = '' OR `id` = ?)");
    whereParams.push(ihsId);
  }
  // Guard "IF null": hanya sentuh baris bila minimal satu kolom target kosong.
  whereConds.push(`(${emptyConds.join(" OR ")})`);

  const sql =
    `UPDATE \`kemkes-ihs\`.\`${table}\` ` +
    `SET ${setParts.join(", ")} WHERE ${whereConds.join(" AND ")}`;
  const updated = await simgosExecute(sql, [...setParams, ...whereParams]);
  return { cols, updated };
}

/**
 * Gerbang bersama untuk write-back klinis dari route FHIR (POST & GET). Baca
 * `?module=&key=` (identitas baris staging yang dikirim client), validasi, lalu
 * jalankan write-back bila sukses (2xx). Fire-and-forget: kegagalan hanya
 * di-log, tak pernah membatalkan response ke client. Patient & Encounter punya
 * jalur write-back sendiri → dilewati di sini.
 */
export async function maybeClinicalWriteBack(params: {
  searchParams: URLSearchParams;
  resource: string;
  status: number;
  responseData: unknown;
}): Promise<void> {
  const { searchParams, resource, status, responseData } = params;
  if (status < 200 || status >= 300) return;

  const module = searchParams.get("module");
  const key = searchParams.get("key");
  if (!module || !key) return;
  if (module === "patient" || module === "encounter") return;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) return;

  const spec = getModuleSpec(module);
  if (!spec || spec.resourceType !== resource) return;

  try {
    const wb = await writeBackClinicalResource({ spec, key, responseData });
    if (wb) {
      console.log(
        `[clinical writeback] module=${module} key=${key} cols=${wb.cols.join("+")} rows=${wb.updated}`,
      );
    }
  } catch (err) {
    console.error(`[clinical writeback] gagal update SIMGOS ${module}:`, err);
  }
}
