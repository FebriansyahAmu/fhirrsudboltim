// lib/dal/coverage.dal.ts
// ─────────────────────────────────────────────────────────────
// Cakupan sinkronisasi per Resource: berapa record di SIMGOS, berapa yang
// SUDAH terkirim (punya id Satu Sehat) & berapa yang BELUM.
//
// 🔒 SIMGOS read-only (SELECT COUNT ringan per tabel — tanpa JSON_EXTRACT).
//    Dibatasi beban:
//      • hasil di-CACHE in-memory (TTL 5 menit) → scan SIMGOS jarang terjadi
//        berapa pun seringnya dashboard dibuka/di-refresh,
//      • kueri dijalankan ber-batch (maks 4) — pool SIMGOS hanya 3 koneksi,
//      • error per-modul diisolasi (tabel bermasalah dilewati, bukan gagal total).
//    Diagregasi per resourceType (mis. semua sub-modul Observation dijumlahkan).
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";
import { IHS_MODULES } from "@/app/lib/ihs/registry";

const SCHEMA = "kemkes-ihs";
const TTL_MS = 5 * 60 * 1000; // 5 menit
const BATCH = 4;

export interface CoverageItem {
  resourceType: string;
  total: number;
  sent: number;
  unsent: number;
  coveragePct: number; // 0..100
}

export interface CoverageData {
  items: CoverageItem[];
  totals: { total: number; sent: number; unsent: number; coveragePct: number };
  cachedAt: string; // ISO
}

function ident(s: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(s)) throw new Error(`Identifier tidak valid: ${s}`);
  return s;
}
function identPath(p: string): string {
  if (!/^\$[A-Za-z0-9_.[\]']*$/.test(p)) throw new Error(`JSON path tidak valid: ${p}`);
  return p;
}
function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Hitung total & terkirim untuk satu tabel modul (COUNT ringan). */
async function countModule(table: string, baseFilter?: {
  col: string;
  jsonPath?: string;
  equals: string;
}): Promise<{ total: number; sent: number }> {
  let where = "";
  const params: unknown[] = [];
  if (baseFilter) {
    const col = ident(baseFilter.col);
    const expr = baseFilter.jsonPath
      ? `JSON_UNQUOTE(JSON_EXTRACT(\`${col}\`, '${identPath(baseFilter.jsonPath)}'))`
      : `\`${col}\``;
    where = `WHERE ${expr} = ?`;
    params.push(baseFilter.equals);
  }
  const rows = await simgosQuery<{ total: unknown; sent: unknown }>(
    `SELECT CAST(COUNT(*) AS SIGNED) AS total,
            CAST(SUM(id IS NOT NULL) AS SIGNED) AS sent
       FROM \`${SCHEMA}\`.\`${ident(table)}\` ${where}`,
    params,
  );
  return { total: num(rows[0]?.total), sent: num(rows[0]?.sent) };
}

/** Jalankan fn ber-batch untuk membatasi koneksi bersamaan ke SIMGOS. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

let cache: { at: number; data: CoverageData } | null = null;

/**
 * Cakupan per Resource (diagregasi per resourceType). Memakai cache 5 menit
 * kecuali `force`. Aman dipanggil sesering apa pun — SIMGOS jarang tersentuh.
 */
export async function getResourceCoverage(force = false): Promise<CoverageData> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const specs = Object.values(IHS_MODULES);
  const perModule = await mapLimit(specs, BATCH, async (spec) => {
    try {
      const c = await countModule(spec.table, spec.baseFilter);
      return { resourceType: spec.resourceType, ...c };
    } catch (e) {
      console.warn(
        `[coverage] modul '${spec.module}' dilewati:`,
        e instanceof Error ? e.message : e,
      );
      return null;
    }
  });

  // Agregasi per resourceType (sub-modul dijumlahkan).
  const byType = new Map<string, { total: number; sent: number }>();
  for (const r of perModule) {
    if (!r) continue;
    const cur = byType.get(r.resourceType) ?? { total: 0, sent: 0 };
    cur.total += r.total;
    cur.sent += r.sent;
    byType.set(r.resourceType, cur);
  }

  const items: CoverageItem[] = [...byType.entries()]
    .map(([resourceType, v]) => ({
      resourceType,
      total: v.total,
      sent: v.sent,
      unsent: Math.max(0, v.total - v.sent),
      coveragePct: v.total > 0 ? (v.sent / v.total) * 100 : 0,
    }))
    .filter((i) => i.total > 0)
    .sort((a, b) => b.total - a.total);

  const tTotal = items.reduce((s, i) => s + i.total, 0);
  const tSent = items.reduce((s, i) => s + i.sent, 0);
  const data: CoverageData = {
    items,
    totals: {
      total: tTotal,
      sent: tSent,
      unsent: Math.max(0, tTotal - tSent),
      coveragePct: tTotal > 0 ? (tSent / tTotal) * 100 : 0,
    },
    cachedAt: new Date().toISOString(),
  };

  cache = { at: Date.now(), data };
  return data;
}
