// lib/ihs/module-sync.ts
// ─────────────────────────────────────────────────────────────
// DAL generik READ-ONLY untuk memantau status sinkronisasi modul
// IHS mana pun (didorong oleh registry). Pola: id IS NULL/NOT NULL.
//
// 🔒 Hanya SELECT (lewat simgosQuery). Tidak menulis ke SIMGOS.
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";
import type { IhsModuleSpec, SyncCellType } from "./registry";

const SCHEMA = "kemkes-ihs";

/** Validasi identifier (nama tabel/kolom) — pertahanan meski dari registry tepercaya. */
function ident(s: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(s)) {
    throw new Error(`Identifier tidak valid: ${s}`);
  }
  return s;
}

export type SyncFilter = "semua" | "terkirim" | "belum" | "siap";

export interface SyncSummary {
  total: number;
  terkirim: number;
  belum: number;
  siap: number;
}

export interface SyncCell {
  label: string;
  value: string | null;
  type: SyncCellType;
}

export interface SyncRow {
  key: string;
  sent: boolean;
  ready: boolean;
  satuSehatId: string | null;
  cells: SyncCell[];
}

// ── Helpers ────────────────────────────────────────────────

function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function parseName(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(arr) && arr[0]) {
      const n = arr[0] as { text?: string };
      return typeof n.text === "string" ? n.text : null;
    }
  } catch {
    /* abaikan */
  }
  return null;
}

function maskNik(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  if (raw.length < 6) return "••••";
  return `${raw.slice(0, 4)}${"•".repeat(raw.length - 6)}${raw.slice(-2)}`;
}

function fmtDate(raw: unknown): string | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw as string);
  if (isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function formatCell(raw: unknown, type: SyncCellType): string | null {
  switch (type) {
    case "json-name":
      return parseName(raw);
    case "nik":
      return maskNik(raw);
    case "date":
      return fmtDate(raw);
    case "code":
    case "text":
    default:
      return raw == null ? null : String(raw);
  }
}

function whereClause(spec: IhsModuleSpec, filter: SyncFilter): string {
  if (filter === "terkirim") return "WHERE id IS NOT NULL";
  if (filter === "belum") return "WHERE id IS NULL";
  if (filter === "siap" && spec.readyFlag) {
    return `WHERE id IS NULL AND \`${ident(spec.readyFlag)}\` = 1`;
  }
  return "";
}

// ── Queries ────────────────────────────────────────────────

export async function getModuleSyncSummary(
  spec: IhsModuleSpec,
): Promise<SyncSummary> {
  const table = ident(spec.table);
  const readySql = spec.readyFlag
    ? `SUM(id IS NULL AND \`${ident(spec.readyFlag)}\` = 1)`
    : "0";

  const rows = await simgosQuery<Record<string, unknown>>(
    `SELECT
       COUNT(*)            AS total,
       SUM(id IS NOT NULL) AS terkirim,
       SUM(id IS NULL)     AS belum,
       ${readySql}         AS siap
     FROM \`${SCHEMA}\`.\`${table}\``,
  );
  const r = rows[0] ?? {};
  return {
    total: toNum(r.total),
    terkirim: toNum(r.terkirim),
    belum: toNum(r.belum),
    siap: toNum(r.siap),
  };
}

export async function getModuleSyncRows(
  spec: IhsModuleSpec,
  filter: SyncFilter,
  page = 1,
  pageSize = 10,
): Promise<SyncRow[]> {
  const table = ident(spec.table);
  const keyCol = ident(spec.keyCol);
  const orderCol = ident(spec.orderCol);

  const select: string[] = [`\`${keyCol}\` AS _key`, "id AS _id"];
  if (spec.readyFlag) select.push(`\`${ident(spec.readyFlag)}\` AS _ready`);
  spec.columns.forEach((c, i) =>
    select.push(`\`${ident(c.col)}\` AS \`col_${i}\``),
  );

  const size = Math.min(Math.max(1, Math.trunc(pageSize)), 100);
  const offset = (Math.max(1, Math.trunc(page)) - 1) * size;

  const rows = await simgosQuery<Record<string, unknown>>(
    `SELECT ${select.join(", ")}
       FROM \`${SCHEMA}\`.\`${table}\`
       ${whereClause(spec, filter)}
       ORDER BY \`${orderCol}\` DESC
       LIMIT ${size} OFFSET ${offset}`,
  );

  return rows.map((r) => ({
    key: String(r._key ?? ""),
    sent: r._id != null,
    satuSehatId: r._id != null ? String(r._id) : null,
    ready: spec.readyFlag ? toNum(r._ready) === 1 : false,
    cells: spec.columns.map((c, i) => ({
      label: c.label,
      type: c.type,
      value: formatCell(r[`col_${i}`], c.type),
    })),
  }));
}

export function countForFilter(s: SyncSummary, f: SyncFilter): number {
  if (f === "terkirim") return s.terkirim;
  if (f === "belum") return s.belum;
  if (f === "siap") return s.siap;
  return s.total;
}
