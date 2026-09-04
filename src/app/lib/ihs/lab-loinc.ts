// lib/ihs/lab-loinc.ts
// ─────────────────────────────────────────────────────────────
// RAKIT ULANG Observation LAB (jenis=6) memakai peta LOINC kita sendiri
// (`fhir_satusehat.lab_loinc_map`) — menggantikan andalan pada tabel SIMGOS
// `parameter_hasil_to_loinc` yang rusak (semua → placeholder 11477-7).
//
// Untuk parameter yang punya mapping AKTIF (kode terverifikasi) & nilainya
// valid, kita rakit ulang:
//   • code   ← kode LOINC benar dari katalog (override 11477-7 / isi bila null).
//   • value  ← dari HASIL: buang flag '*', koma→titik; angka → valueQuantity
//              (+ satuan UCUM); non-angka → valueString.
//   • interpretation ← dari flag '*' (+ rentang NILAI_NORMAL → H/L, else A).
//
// Alur kunci: observation.refId == layanan.hasil_lab.ID.
//
// 🔒 SIMGOS hanya DIBACA (SELECT). Peta ada di DB kita. Enrichment terjadi saat
//    rakit payload (dan tampilan panel) — tidak menulis balik ke SIMGOS, dan
//    tidak menyentuh data yang sudah terkirim (forward-only).
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";
import { prisma } from "@/app/lib/db/prisma";

const LOINC_SYS = "http://loinc.org";
const UCUM_SYS = "http://unitsofmeasure.org";
const INTERP_SYS =
  "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation";

type Coding = { system: string; code: string; display: string };

export interface LabRebuild {
  /** Objek Observation.code (LOINC benar). */
  code: { coding: Coding[] };
  /** Display kode (untuk tampilan panel). */
  codeDisplay: string;
  valueQuantity?: {
    value: number;
    unit?: string;
    system?: string;
    code?: string;
  };
  valueString?: string;
  interpretation?: { coding: Coding[] }[];
  /** Ringkas nilai untuk tampilan panel (mis. "7.22 10*3/uL"). */
  valueDisplay: string;
}

interface MapRow {
  parameter_id: number;
  loinc_code: string | null;
  loinc_display: string | null;
  ucum_unit: string | null;
  ucum_code: string | null;
}

/** Angka dari HASIL: buang flag '*', desimal koma→titik. null bila non-numerik. */
function parseNumeric(raw: unknown): number | null {
  let s = String(raw ?? "").trim();
  s = s.replace(/\*/g, "").trim(); // flag abnormal bisa di depan/belakang
  s = s.replace(",", "."); // desimal Indonesia
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rentang normal → {low, high}. Mendukung "20 - 50", "4.00 - 12.00",
 * ambang "<180"/"≤180" (high saja) dan ">10"/"≥10" (low saja). null bila gagal.
 */
function parseRange(raw: unknown): { low: number; high: number } | null {
  const s = String(raw ?? "");
  const num = (x: string) => Number(x.replace(",", "."));
  const band = /(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/.exec(s);
  if (band) {
    const low = num(band[1]);
    const high = num(band[2]);
    if (Number.isFinite(low) && Number.isFinite(high)) return { low, high };
  }
  const lt = /[<≤]\s*=?\s*(-?\d+(?:[.,]\d+)?)/.exec(s);
  if (lt) return { low: -Infinity, high: num(lt[1]) };
  const gt = /[>≥]\s*=?\s*(-?\d+(?:[.,]\d+)?)/.exec(s);
  if (gt) return { low: num(gt[1]), high: Infinity };
  return null;
}

/** interpretation dari flag '*': H/L bila rentang diketahui, selain itu A. */
function buildInterpretation(
  rawHasil: unknown,
  numeric: number | null,
  nilaiNormal: unknown,
): { coding: Coding[] }[] | undefined {
  if (!/\*/.test(String(rawHasil ?? ""))) return undefined;
  let code = "A";
  let display = "Abnormal";
  const range = parseRange(nilaiNormal);
  if (numeric != null && range) {
    if (numeric > range.high) {
      code = "H";
      display = "High";
    } else if (numeric < range.low) {
      code = "L";
      display = "Low";
    }
  }
  return [{ coding: [{ system: INTERP_SYS, code, display }] }];
}

/**
 * Rakit LabRebuild dari satu baris hasil + mapping. null bila:
 *   • tidak ada kode LOINC di mapping, atau
 *   • nilai tidak valid (kosong/junk) → jangan buat observasi kode-saja.
 * (Pure — mudah diuji.)
 */
export function buildLabRebuild(
  hasil: unknown,
  nilaiNormal: unknown,
  map: MapRow,
): LabRebuild | null {
  if (!map.loinc_code) return null;

  const numeric = parseNumeric(hasil);
  const strClean = String(hasil ?? "")
    .replace(/\*/g, "")
    .trim();
  const junk = ["", "-", ".", ",", "--", ".-", "_", "()"];
  const hasRealValue = numeric != null || !junk.includes(strClean);
  if (!hasRealValue) return null; // tanpa nilai valid → lewati

  const code = {
    coding: [
      {
        system: LOINC_SYS,
        code: map.loinc_code,
        display: map.loinc_display ?? "",
      },
    ],
  };
  const out: LabRebuild = {
    code,
    codeDisplay: map.loinc_display ?? "",
    valueDisplay: "",
  };

  if (numeric != null && map.ucum_code) {
    out.valueQuantity = {
      value: numeric,
      unit: map.ucum_unit ?? undefined,
      system: UCUM_SYS,
      code: map.ucum_code,
    };
    out.valueDisplay = `${numeric}${map.ucum_unit ? " " + map.ucum_unit : ""}`;
  } else if (numeric != null) {
    out.valueQuantity = { value: numeric };
    out.valueDisplay = String(numeric);
  } else {
    out.valueString = strClean;
    out.valueDisplay = strClean;
  }

  const interpretation = buildInterpretation(hasil, numeric, nilaiNormal);
  if (interpretation) out.interpretation = interpretation;
  return out;
}

/**
 * Batch: refId Observation LAB → LabRebuild. Hanya parameter dgn mapping
 * AKTIF & berkode, dan hasil yang bernilai valid. refId lain tak muncul.
 */
export async function resolveLabRebuildByRefIds(
  refIds: string[],
): Promise<Map<string, LabRebuild>> {
  const out = new Map<string, LabRebuild>();
  const ids = [...new Set(refIds.filter((r) => /^\d{1,20}$/.test(r)))];
  if (ids.length === 0) return out;

  // 1) refId → parameter + HASIL + NILAI_NORMAL (SIMGOS, read-only).
  const ph = ids.map(() => "?").join(", ");
  const hl = await simgosQuery<{
    ID: string;
    PARAMETER_TINDAKAN: number;
    HASIL: string | null;
    NILAI_NORMAL: string | null;
  }>(
    `SELECT ID, PARAMETER_TINDAKAN, HASIL, NILAI_NORMAL
       FROM \`layanan\`.\`hasil_lab\` WHERE ID IN (${ph})`,
    ids,
  );
  if (hl.length === 0) return out;

  const params = [
    ...new Set(hl.map((r) => Number(r.PARAMETER_TINDAKAN)).filter(Number.isFinite)),
  ];
  if (params.length === 0) return out;

  // 2) parameter → mapping aktif & berkode (DB kita).
  const maps = await prisma.lab_loinc_map.findMany({
    where: { parameter_id: { in: params }, active: true, NOT: { loinc_code: null } },
    select: {
      parameter_id: true,
      loinc_code: true,
      loinc_display: true,
      ucum_unit: true,
      ucum_code: true,
    },
  });
  if (maps.length === 0) return out;
  const byParam = new Map<number, MapRow>(maps.map((m) => [m.parameter_id, m]));

  // 3) rakit per baris.
  for (const r of hl) {
    const m = byParam.get(Number(r.PARAMETER_TINDAKAN));
    if (!m) continue;
    const rb = buildLabRebuild(r.HASIL, r.NILAI_NORMAL, m);
    if (rb) out.set(String(r.ID), rb);
  }
  return out;
}

/** Versi tunggal: LabRebuild untuk satu refId LAB, atau null. */
export async function resolveLabRebuildByRefId(
  refId: string,
): Promise<LabRebuild | null> {
  return (await resolveLabRebuildByRefIds([refId])).get(refId) ?? null;
}
