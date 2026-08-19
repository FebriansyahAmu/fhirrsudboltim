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
      // Tanpa masking — tampilkan NIK apa adanya.
      return raw == null ? null : String(raw);
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

  const mapped: SyncRow[] = rows.map((r) => ({
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

  // Utamakan "Nama" dari master: staging bisa kosong (skeleton) atau termask (Satu Sehat).
  await enrichMasterName(spec, mapped);

  return mapped;
}

/**
 * Ganti nilai kolom bertipe `json-name` dengan nama dari tabel master
 * (mis. `master.pasien.NAMA`) yang selalu penuh — staging bisa kosong/termask.
 * Satu kueri batch untuk seluruh baris di halaman. Read-only.
 */
async function enrichMasterName(
  spec: IhsModuleSpec,
  rows: SyncRow[],
): Promise<void> {
  if (!spec.masterName) return;
  const nameIdx = spec.columns.findIndex((c) => c.type === "json-name");
  if (nameIdx < 0) return;

  const uniqueKeys = [
    ...new Set(rows.map((r) => r.key).filter((k) => /^[0-9]+$/.test(k))),
  ];
  if (uniqueKeys.length === 0) return;

  const schema = ident(spec.masterName.schema);
  const table = ident(spec.masterName.table);
  const keyCol = ident(spec.masterName.keyCol);
  const nameCol = ident(spec.masterName.nameCol);
  const placeholders = uniqueKeys.map(() => "?").join(", ");

  const nameRows = await simgosQuery<Record<string, unknown>>(
    `SELECT \`${keyCol}\` AS k, \`${nameCol}\` AS nm
       FROM \`${schema}\`.\`${table}\`
      WHERE \`${keyCol}\` IN (${placeholders})`,
    uniqueKeys.map((k) => Number(k)),
  );

  const nameByKey = new Map<string, string>();
  for (const nr of nameRows) {
    if (nr.k != null && nr.nm != null) nameByKey.set(String(nr.k), String(nr.nm));
  }

  for (const r of rows) {
    const nm = nameByKey.get(r.key);
    if (nm) r.cells[nameIdx] = { ...r.cells[nameIdx], value: nm };
  }
}

export function countForFilter(s: SyncSummary, f: SyncFilter): number {
  if (f === "terkirim") return s.terkirim;
  if (f === "belum") return s.belum;
  if (f === "siap") return s.siap;
  return s.total;
}

// ── Rakit payload FHIR (preview/autofill) ──────────────────
// Kolom bookkeeping yang TIDAK ikut ke payload FHIR.
const GLOBAL_BOOKKEEPING = new Set([
  "refId",
  "tableId",
  "nopen",
  "sendDate",
  "getDate",
  "send",
  "statusRequest",
  "httpRequest",
  "get",
  "jenis",
  "barang",
  "group_racikan",
  "status_racikan",
  "penjaminId",
  "nik",
  "id", // id resource tidak disertakan di body (dipakai di URL untuk PUT/PATCH)
]);

function fmtDateVal(d: Date): string {
  if (
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0
  ) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return d.toISOString();
}

/**
 * Rakit payload FHIR (draft) dari satu baris staging berdasarkan `key`.
 * Kolom JSON (identifier, name, address, …) sudah dibangun trigger SIMGOS.
 * 🔒 Read-only. Hasil untuk preview/autofill; operator meninjau sebelum kirim.
 */
export async function getModulePayload(
  spec: IhsModuleSpec,
  key: string,
): Promise<{ resourceType: string; payload: Record<string, unknown> } | null> {
  const table = ident(spec.table);
  const keyCol = ident(spec.keyCol);

  const rows = await simgosQuery<Record<string, unknown>>(
    `SELECT * FROM \`${SCHEMA}\`.\`${table}\` WHERE \`${keyCol}\` = ? LIMIT 1`,
    [key],
  );
  const row = rows[0];
  if (!row) return null;

  const exclude = new Set<string>([
    ...GLOBAL_BOOKKEEPING,
    ...(spec.payloadExclude ?? []),
  ]);
  const bools = new Set<string>(spec.boolCols ?? []);

  const payload: Record<string, unknown> = { resourceType: spec.resourceType };
  for (const [col, val] of Object.entries(row)) {
    if (exclude.has(col) || val == null) continue;
    if (bools.has(col)) payload[col] = Number(val) === 1;
    else if (val instanceof Date) payload[col] = fmtDateVal(val);
    else payload[col] = val;
  }

  return { resourceType: spec.resourceType, payload };
}
