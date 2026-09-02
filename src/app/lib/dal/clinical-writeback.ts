// lib/dal/clinical-writeback.ts
// ─────────────────────────────────────────────────────────────
// Write-back hasil POST resource KLINIS (CarePlan/Condition/Observation/
// Procedure/ClinicalImpression/ServiceRequest/Specimen/AllergyIntolerance/
// MedicationRequest/MedicationDispense/DiagnosticReport/QuestionnaireResponse)
// yang SUKSES (2xx) ke tabel staging SIMGOS.
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
 * Write-back id + subject + encounter untuk satu baris staging klinis.
 * Return kolom yang di-set + jumlah baris terpengaruh, atau null bila tak ada
 * yang bisa ditulis. Idempotent: fill-only-empty → panggilan ulang jadi no-op.
 */
export async function writeBackClinicalResource(params: {
  spec: IhsModuleSpec;
  key: string;
  responseData: unknown;
}): Promise<{ cols: string[]; updated: number } | null> {
  const { spec, key, responseData } = params;
  if (!isRecord(responseData)) return null;

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
  // Guard "IF null": hanya sentuh baris bila minimal satu kolom target kosong.
  whereConds.push(`(${emptyConds.join(" OR ")})`);

  const sql =
    `UPDATE \`kemkes-ihs\`.\`${table}\` ` +
    `SET ${setParts.join(", ")} WHERE ${whereConds.join(" AND ")}`;
  const updated = await simgosExecute(sql, [...setParams, ...whereParams]);
  return { cols, updated };
}
