// lib/ihs/encounter-ref.ts
// ─────────────────────────────────────────────────────────────
// Resolusi referensi Encounter untuk data klinis yang `encounter.reference`-nya
// kosong (yatim) — MENUNJUK KE ENCOUNTER MILIK NOPEN-NYA SENDIRI.
//
// Konteks: data klinis rawat-inap (Condition/Observation/…) sering ter-stage
// dengan encounter-ref null karena Encounter ranap-nya belum ada/terkirim.
// Setelah Encounter ranap dibuat (lihat encounter-missing.dal) & terkirim
// (punya IHS id), referensi klinisnya bisa di-resolusi ke Encounter itu.
//
// CATATAN DESAIN: rawat-inap yang masuk dari IGD tetap punya Encounter IMP
// SENDIRI (dua Encounter: EMER + IMP) — jadi resolusi TIDAK "melipat" ke
// Encounter IGD. Bila Encounter ranap belum terkirim, baris tetap
// "Menunggu Encounter" (benar).
//
// 🔒 Hanya SELECT (read-only).
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";

const NOPEN_RE = /^\d{1,10}$/;
const IHS_ID_RE = /^[A-Za-z0-9.\-]{1,64}$/;

/**
 * Batch: nopen → "Encounter/<ihsId>" untuk nopen yang Encounter-nya SENDIRI
 * sudah terkirim (punya IHS id). Nopen tanpa Encounter terkirim = tak dipetakan.
 */
export async function resolveEncounterRefsByNopen(
  nopens: string[],
): Promise<Map<string, string>> {
  const clean = [...new Set(nopens.filter((n) => NOPEN_RE.test(n)))];
  const out = new Map<string, string>();
  if (clean.length === 0) return out;

  const ph = clean.map(() => "?").join(", ");
  const rows = await simgosQuery<{ refId: string; id: string }>(
    `SELECT refId, id FROM \`kemkes-ihs\`.\`encounter\`
      WHERE refId IN (${ph}) AND id IS NOT NULL AND id <> ''`,
    clean,
  );
  for (const r of rows) {
    const id = String(r.id ?? "").trim();
    if (IHS_ID_RE.test(id)) out.set(String(r.refId), `Encounter/${id}`);
  }
  return out;
}

/** Versi tunggal (dipakai saat merakit payload). */
export async function resolveEncounterRefByNopen(
  nopen: string,
): Promise<string | null> {
  const map = await resolveEncounterRefsByNopen([nopen]);
  return map.get(nopen) ?? null;
}
