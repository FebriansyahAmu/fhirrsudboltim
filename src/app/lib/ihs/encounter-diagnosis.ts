// lib/ihs/encounter-diagnosis.ts
// ─────────────────────────────────────────────────────────────
// Resolusi Encounter.diagnosis dari SIMGOS untuk MELENGKAPI payload Encounter
// yang kolom `diagnosis`-nya kosong sebelum dikirim ke Satu Sehat (profil Kemkes
// mewajibkan diagnosis pada Encounter selesai — RuleNumber 10457).
//
// Kenapa kosong: `encounter.diagnosis` HANYA dibangun trigger `encounter_before_
// update` saat `encounter.send` transisi 0→1 (kick dari `condition_after_update`
// ketika `condition.send` di-flip 1→0). Aplikasi tak pernah flip itu, jadi
// encounter yang Condition-nya SUDAH terkirim tetap `diagnosis` NULL. Di sini
// kita bangun ulang read-side dari Condition terkirim, memakai SELECT yang
// IDENTIK dengan blok di trigger (ENCOUNTER_DIAGNOSIS_BUILD_SQL) → hasil sama
// persis dengan yang seharusnya dimaterialisasi SIMGOS. Untuk konsistensi
// permanen di staging, gunakan writeback `simgosReconcileEncounterDiagnosis`.
//
// 🔒 Hanya SELECT (lewat simgosQuery). Tidak menulis apa pun ke SIMGOS.
// ─────────────────────────────────────────────────────────────

import { simgosQuery, ENCOUNTER_DIAGNOSIS_BUILD_SQL } from "@/app/lib/db/simgos";

export interface EncounterDiagnosis {
  condition: { reference: string; display?: string };
  use?: { coding: { system: string; code: string; display: string }[] };
  rank?: number;
}

/**
 * Bangun Encounter.diagnosis[] sebuah Encounter dari Condition TERKIRIM
 * (`id IS NOT NULL`) untuk No. Pendaftaran (NOPEN). Return null bila tidak ada
 * Condition terkirim (baris tetap tanpa diagnosis → tetap gagal & tercatat;
 * tidak dipaksa).
 */
export async function resolveEncounterDiagnosis(
  nopen: string,
): Promise<EncounterDiagnosis[] | null> {
  if (!/^\d{1,10}$/.test(nopen)) return null;

  const rows = await simgosQuery<{ diagnosis: unknown }>(
    ENCOUNTER_DIAGNOSIS_BUILD_SQL,
    [nopen],
  );
  const raw = rows[0]?.diagnosis;
  if (raw == null) return null;

  // JSON_ARRAYAGG bisa kembali sebagai string (ekspresi terkomputasi) atau
  // sudah ter-parse (bergantung driver). Normalkan ke array.
  let arr: unknown;
  try {
    arr = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr as EncounterDiagnosis[];
}
