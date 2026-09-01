// lib/dal/analytics.dal.ts
// ─────────────────────────────────────────────────────────────
// Agregasi analitik pengiriman FHIR → Satu Sehat.
//
// 🔒 SUMBER DATA: HANYA DB kita sendiri (`delivery_logs`, MySQL/MariaDB) —
//    TIDAK menyentuh SIMGOS sama sekali. Semua agregasi dilakukan lewat
//    GROUP BY di sisi DB (indeks: resource_type, status, sent_at), bukan
//    di aplikasi, agar ringan. Semua kueri di-scope per-user + rentang waktu.
// ─────────────────────────────────────────────────────────────

import { prisma } from "@/app/lib/db/prisma";

export interface AnalyticsPoint {
  date: string; // YYYY-MM-DD (lokal)
  total: number;
  success: number;
  error: number;
}

export interface ResourceStat {
  resourceType: string;
  total: number;
  success: number;
  error: number;
  avgMs: number | null;
  lastAt: string | null; // ISO
}

export interface MethodStat {
  method: string;
  count: number;
}

export interface AnalyticsData {
  rangeDays: number;
  generatedAt: string; // ISO
  totals: {
    total: number;
    success: number;
    error: number;
    successRate: number; // 0..100
    avgMs: number | null;
    windowTotal: number;
    prevWindowTotal: number;
    growthPct: number | null; // window vs previous window
    activeResources: number;
    lastActivityAt: string | null; // ISO
  };
  series: AnalyticsPoint[];
  resources: ResourceStat[];
  methods: MethodStat[];
}

/** Koersi nilai agregat (bigint/Decimal/string/number/null) → number. */
function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Awal hari (00:00 waktu lokal server) untuk sebuah Date. */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const ALLOWED_DAYS = [7, 30, 90] as const;
export function normalizeDays(v: unknown): number {
  const n = Number(v);
  return (ALLOWED_DAYS as readonly number[]).includes(n) ? n : 30;
}

// ── Ringkasan catatan tindak lanjut (ihs_row_notes, DB kita) ──────────────
export interface NotesSummary {
  total: number;
  byMark: { merah: number; kuning: number; hijau: number; biru: number; tanpa: number };
  byModule: { module: string; total: number }[]; // modul dgn catatan terbanyak
}

/** Ringkasan catatan (global, lintas modul) — sumber DB kita, ringan. */
export async function getNotesSummary(): Promise<NotesSummary> {
  const [byMarkRaw, byModuleRaw] = await Promise.all([
    prisma.ihs_row_notes.groupBy({ by: ["mark"], _count: { _all: true } }),
    prisma.ihs_row_notes.groupBy({
      by: ["module"],
      _count: { _all: true },
      orderBy: { _count: { module: "desc" } },
      take: 6,
    }),
  ]);

  const byMark = { merah: 0, kuning: 0, hijau: 0, biru: 0, tanpa: 0 };
  let total = 0;
  for (const g of byMarkRaw) {
    const n = g._count._all;
    total += n;
    const m = g.mark;
    if (m === "merah" || m === "kuning" || m === "hijau" || m === "biru") {
      byMark[m] += n;
    } else {
      byMark.tanpa += n;
    }
  }

  const byModule = byModuleRaw.map((g) => ({
    module: g.module,
    total: g._count._all,
  }));

  return { total, byMark, byModule };
}

/**
 * Ambil seluruh data analitik untuk satu user pada rentang `days` hari.
 * Menjalankan beberapa kueri agregat secara paralel (semua di DB kita).
 */
export async function getAnalytics(
  userId: string,
  days: number,
): Promise<AnalyticsData> {
  const rangeDays = normalizeDays(days);
  const now = new Date();
  const windowStart = new Date(startOfDay(now));
  windowStart.setDate(windowStart.getDate() - (rangeDays - 1)); // termasuk hari ini
  const prevStart = new Date(windowStart);
  prevStart.setDate(prevStart.getDate() - rangeDays);

  // Tipe baris mentah dari $queryRaw.
  type SeriesRow = { d: string; total: unknown; success: unknown; error: unknown };
  type TotalsRow = { total: unknown; success: unknown; error: unknown; avgMs: unknown };
  type CountRow = { total: unknown };
  type ResRow = {
    resource_type: string;
    total: unknown;
    success: unknown;
    error: unknown;
    avgMs: unknown;
    lastAt: unknown;
  };
  type MethodRow = { method: string; count: unknown };
  type LastRow = { lastAt: unknown };

  const [seriesRaw, totalsRow, prevRow, resRaw, methodRaw, lastRow] =
    await Promise.all([
      prisma.$queryRaw<SeriesRow[]>`
        SELECT DATE_FORMAT(sent_at, '%Y-%m-%d') AS d,
               CAST(COUNT(*) AS SIGNED)                 AS total,
               CAST(SUM(status = 'success') AS SIGNED)  AS success,
               CAST(SUM(status = 'error') AS SIGNED)    AS error
          FROM delivery_logs
         WHERE user_id = ${userId} AND sent_at >= ${windowStart}
         GROUP BY d
         ORDER BY d`,
      prisma.$queryRaw<TotalsRow[]>`
        SELECT CAST(COUNT(*) AS SIGNED)                AS total,
               CAST(SUM(status = 'success') AS SIGNED) AS success,
               CAST(SUM(status = 'error') AS SIGNED)   AS error,
               CAST(ROUND(AVG(time_ms)) AS SIGNED)     AS avgMs
          FROM delivery_logs
         WHERE user_id = ${userId} AND sent_at >= ${windowStart}`,
      prisma.$queryRaw<CountRow[]>`
        SELECT CAST(COUNT(*) AS SIGNED) AS total
          FROM delivery_logs
         WHERE user_id = ${userId}
           AND sent_at >= ${prevStart} AND sent_at < ${windowStart}`,
      prisma.$queryRaw<ResRow[]>`
        SELECT resource_type,
               CAST(COUNT(*) AS SIGNED)                 AS total,
               CAST(SUM(status = 'success') AS SIGNED)  AS success,
               CAST(SUM(status = 'error') AS SIGNED)    AS error,
               CAST(ROUND(AVG(time_ms)) AS SIGNED)      AS avgMs,
               MAX(sent_at)                             AS lastAt
          FROM delivery_logs
         WHERE user_id = ${userId} AND sent_at >= ${windowStart}
         GROUP BY resource_type
         ORDER BY total DESC`,
      prisma.$queryRaw<MethodRow[]>`
        SELECT method, CAST(COUNT(*) AS SIGNED) AS count
          FROM delivery_logs
         WHERE user_id = ${userId} AND sent_at >= ${windowStart}
         GROUP BY method
         ORDER BY count DESC`,
      prisma.$queryRaw<LastRow[]>`
        SELECT MAX(sent_at) AS lastAt
          FROM delivery_logs
         WHERE user_id = ${userId}`,
    ]);

  // Zero-fill seri harian agar sumbu-x kontinu.
  const byDay = new Map<string, SeriesRow>();
  for (const r of seriesRaw) byDay.set(String(r.d), r);
  const series: AnalyticsPoint[] = [];
  for (let i = 0; i < rangeDays; i++) {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + i);
    const key = ymd(d);
    const row = byDay.get(key);
    series.push({
      date: key,
      total: num(row?.total),
      success: num(row?.success),
      error: num(row?.error),
    });
  }

  const t = totalsRow[0] ?? {};
  const total = num(t.total);
  const success = num(t.success);
  const error = num(t.error);
  const windowTotal = total;
  const prevWindowTotal = num(prevRow[0]?.total);
  const growthPct =
    prevWindowTotal > 0
      ? ((windowTotal - prevWindowTotal) / prevWindowTotal) * 100
      : null;

  const resources: ResourceStat[] = resRaw.map((r) => ({
    resourceType: String(r.resource_type),
    total: num(r.total),
    success: num(r.success),
    error: num(r.error),
    avgMs: r.avgMs == null ? null : num(r.avgMs),
    lastAt: toIso(r.lastAt),
  }));

  const methods: MethodStat[] = methodRaw.map((r) => ({
    method: String(r.method),
    count: num(r.count),
  }));

  return {
    rangeDays,
    generatedAt: now.toISOString(),
    totals: {
      total,
      success,
      error,
      successRate: total > 0 ? (success / total) * 100 : 0,
      avgMs: t.avgMs == null ? null : num(t.avgMs),
      windowTotal,
      prevWindowTotal,
      growthPct,
      activeResources: resources.length,
      lastActivityAt: toIso(lastRow[0]?.lastAt),
    },
    series,
    resources,
    methods,
  };
}
