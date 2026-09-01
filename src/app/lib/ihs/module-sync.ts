// lib/ihs/module-sync.ts
// ─────────────────────────────────────────────────────────────
// DAL generik READ-ONLY untuk memantau status sinkronisasi modul
// IHS mana pun (didorong oleh registry). Pola: id IS NULL/NOT NULL.
//
// 🔒 Hanya SELECT (lewat simgosQuery). Tidak menulis ke SIMGOS.
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";
import { getAttemptedIdentifiers } from "./notes.dal";
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
  /** Belum terkirim karena referensi dependensi belum ada (mis. Patient). */
  menunggu: number;
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
  /** Pernah di-POST (delivery_logs) tapi belum punya id Satu Sehat. */
  attempted: boolean;
  /** Belum terkirim karena referensi dependensi belum ada (mis. Patient). */
  waitingRef: boolean;
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

function fmtDateTime(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (isNaN(d.getTime())) return String(raw);
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
    case "datetime":
      return fmtDateTime(raw);
    case "code":
    case "text":
    default:
      return raw == null ? null : String(raw);
  }
}

/** Rentang tanggal (YYYY-MM-DD). */
export interface DateRange {
  from?: string;
  to?: string;
}

/** YYYY-MM-DD → prefix YYMMDD; null bila format salah. */
function toYymmdd(d: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? m[1].slice(2) + m[2] + m[3] : null;
}

/** Kondisi range pada keyCol berdasarkan encoding tanggal (yymmdd-prefix). */
function keyDateConds(
  spec: IhsModuleSpec,
  range: DateRange | undefined,
): { conds: string[]; params: string[] } {
  const out = { conds: [] as string[], params: [] as string[] };
  if (!spec.dateKey || spec.dateKey.kind !== "yymmdd-prefix" || !range) {
    return out;
  }
  // Kolom yang di-filter: default keyCol, atau override (mis. "nopen").
  const keyCol = ident(spec.dateKey.col ?? spec.keyCol);
  const pad = Math.max(0, spec.dateKey.keyLength - 6);
  if (range.from) {
    const p = toYymmdd(range.from);
    if (p) {
      out.conds.push(`\`${keyCol}\` >= ?`);
      out.params.push(p + "0".repeat(pad));
    }
  }
  if (range.to) {
    const p = toYymmdd(range.to);
    if (p) {
      out.conds.push(`\`${keyCol}\` <= ?`);
      out.params.push(p + "9".repeat(pad));
    }
  }
  return out;
}

/** Bangun WHERE (filter status kirim + range tanggal) beserta paramnya. */
function buildWhere(
  spec: IhsModuleSpec,
  filter: SyncFilter,
  range?: DateRange,
): { sql: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];

  // Batasan dasar tabel tercampur (mis. hanya LAB dari service_request).
  if (spec.baseFilter) {
    const bf = spec.baseFilter;
    const col = ident(bf.col);
    const expr = bf.jsonPath
      ? `JSON_UNQUOTE(JSON_EXTRACT(\`${col}\`, '${identPath(bf.jsonPath)}'))`
      : `\`${col}\``;
    conds.push(`${expr} = ?`);
    params.push(bf.equals);
  }

  if (filter === "terkirim") conds.push("id IS NOT NULL");
  else if (filter === "belum") conds.push("id IS NULL");
  else if (filter === "siap" && spec.readyFlag) {
    conds.push("id IS NULL");
    conds.push(`\`${ident(spec.readyFlag)}\` = 1`);
  }

  const dk = keyDateConds(spec, range);
  conds.push(...dk.conds);
  params.push(...dk.params);

  return { sql: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

// ── Queries ────────────────────────────────────────────────

export async function getModuleSyncSummary(
  spec: IhsModuleSpec,
  range?: DateRange,
): Promise<SyncSummary> {
  const table = ident(spec.table);
  const readySql = spec.readyFlag
    ? `SUM(id IS NULL AND \`${ident(spec.readyFlag)}\` = 1)`
    : "0";
  const menungguSql = spec.dependsOn
    ? `SUM(id IS NULL AND (\`${ident(spec.dependsOn.refCol)}\` IS NULL OR JSON_EXTRACT(\`${ident(spec.dependsOn.refCol)}\`, '${identPath(spec.dependsOn.refPath)}') IS NULL))`
    : "0";

  // Summary hanya di-scope oleh range tanggal (bukan filter status kirim).
  const { sql, params } = buildWhere(spec, "semua", range);

  const rows = await simgosQuery<Record<string, unknown>>(
    `SELECT
       COUNT(*)            AS total,
       SUM(id IS NOT NULL) AS terkirim,
       SUM(id IS NULL)     AS belum,
       ${readySql}         AS siap,
       ${menungguSql}      AS menunggu
     FROM \`${SCHEMA}\`.\`${table}\`
     ${sql}`,
    params,
  );
  const r = rows[0] ?? {};
  return {
    total: toNum(r.total),
    terkirim: toNum(r.terkirim),
    belum: toNum(r.belum),
    siap: toNum(r.siap),
    menunggu: toNum(r.menunggu),
  };
}

/** Validasi JSON path (registry tepercaya, tapi tetap dijaga). */
function identPath(p: string): string {
  if (!/^\$[A-Za-z0-9_.[\]']*$/.test(p)) {
    throw new Error(`JSON path tidak valid: ${p}`);
  }
  return p;
}

/** Ekspresi SELECT untuk satu sumber (kolom mentah atau ekstraksi JSON skalar). */
function colExpr(col: string, jsonPath?: string): string {
  return jsonPath
    ? `JSON_UNQUOTE(JSON_EXTRACT(\`${ident(col)}\`, '${identPath(jsonPath)}'))`
    : `\`${ident(col)}\``;
}

/** Key baris (unik). Komposit `${keyCol}_${keyCol2}` bila PK bukan kolom tunggal. */
function rowKey(spec: IhsModuleSpec, r: Record<string, unknown>): string {
  const k1 = String(r._key ?? "");
  return spec.keyCol2 ? `${k1}_${String(r._key2 ?? "")}` : k1;
}

/** Pecah key komposit "989_5" → ["989", "5"] (split pada "_" pertama). */
function splitKey(key: string): [string, string] {
  const i = key.indexOf("_");
  return i < 0 ? [key, ""] : [key.slice(0, i), key.slice(i + 1)];
}

/** Daftar kolom SELECT (aliased) untuk satu spec. */
function buildSelect(spec: IhsModuleSpec): string {
  const select: string[] = [`\`${ident(spec.keyCol)}\` AS _key`, "id AS _id"];
  if (spec.keyCol2) select.push(`\`${ident(spec.keyCol2)}\` AS _key2`);
  if (spec.readyFlag) select.push(`\`${ident(spec.readyFlag)}\` AS _ready`);
  if (spec.attemptMatch)
    select.push(`\`${ident(spec.attemptMatch.nikCol)}\` AS _nik`);
  if (spec.dependsOn)
    select.push(
      `JSON_UNQUOTE(JSON_EXTRACT(\`${ident(spec.dependsOn.refCol)}\`, '${identPath(spec.dependsOn.refPath)}')) AS _depref`,
    );
  spec.columns.forEach((c, i) => {
    // Ekstrak skalar dari kolom JSON server-side → transfer ringan.
    select.push(`${colExpr(c.col, c.jsonPath)} AS \`col_${i}\``);
    // Sumber cadangan (mis. Observation.value[x]) — dikomposisi di JS.
    (c.alt ?? []).forEach((a, j) => {
      select.push(`${colExpr(a.col, a.jsonPath)} AS \`col_${i}_alt_${j}\``);
    });
  });
  return select.join(", ");
}

/** Peta baris mentah → SyncRow + set flag attempted + isi nama master. */
async function finalizeRows(
  spec: IhsModuleSpec,
  raw: Record<string, unknown>[],
): Promise<SyncRow[]> {
  let attempted: Set<string> | null = null;
  if (spec.attemptMatch) {
    attempted = await getAttemptedIdentifiers(spec.attemptMatch.logResourceType);
  }

  const rows: SyncRow[] = raw.map((r) => ({
    key: rowKey(spec, r),
    sent: r._id != null,
    satuSehatId: r._id != null ? String(r._id) : null,
    ready: spec.readyFlag ? toNum(r._ready) === 1 : false,
    attempted:
      attempted != null &&
      r._id == null &&
      r._nik != null &&
      attempted.has(String(r._nik)),
    waitingRef:
      spec.dependsOn != null &&
      r._id == null &&
      (r._depref == null || r._depref === ""),
    cells: spec.columns.map((c, i) => {
      // Ambil nilai pertama yang tak-null: primer → cadangan (alt).
      let raw = r[`col_${i}`];
      if ((raw == null || raw === "") && c.alt) {
        for (let j = 0; j < c.alt.length; j++) {
          const av = r[`col_${i}_alt_${j}`];
          if (av != null && av !== "") {
            raw = av;
            break;
          }
        }
      }
      return { label: c.label, type: c.type, value: formatCell(raw, c.type) };
    }),
  }));

  // Utamakan "Nama" dari master: staging bisa kosong (skeleton) atau termask.
  await enrichMasterName(spec, rows);
  return rows;
}

export async function getModuleSyncRows(
  spec: IhsModuleSpec,
  filter: SyncFilter,
  page = 1,
  pageSize = 10,
  range?: DateRange,
): Promise<SyncRow[]> {
  const table = ident(spec.table);
  const orderCol = ident(spec.orderCol);

  const size = Math.min(Math.max(1, Math.trunc(pageSize)), 100);
  const offset = (Math.max(1, Math.trunc(page)) - 1) * size;

  const { sql, params } = buildWhere(spec, filter, range);

  const raw = await simgosQuery<Record<string, unknown>>(
    `SELECT ${buildSelect(spec)}
       FROM \`${SCHEMA}\`.\`${table}\`
       ${sql}
       ORDER BY \`${orderCol}\` DESC
       LIMIT ${size} OFFSET ${offset}`,
    params,
  );

  return finalizeRows(spec, raw);
}

/**
 * Ambil baris SIMGOS untuk sekumpulan key (dipakai saat filter "bercatatan").
 * Urutan hasil mengikuti urutan `keys` (mis. terbaru dulu dari tabel notes).
 */
export async function getNotedSyncRows(
  spec: IhsModuleSpec,
  keys: string[],
): Promise<SyncRow[]> {
  if (keys.length === 0) return [];
  const table = ident(spec.table);
  const keyCol = ident(spec.keyCol);

  // PK komposit → cocokkan pasangan (keyCol, keyCol2); selain itu IN biasa.
  let where: string;
  let params: unknown[];
  if (spec.keyCol2) {
    const kc2 = ident(spec.keyCol2);
    where = keys.map(() => `(\`${keyCol}\` = ? AND \`${kc2}\` = ?)`).join(" OR ");
    params = keys.flatMap((k) => splitKey(k));
  } else {
    where = `\`${keyCol}\` IN (${keys.map(() => "?").join(", ")})`;
    params = keys;
  }

  const raw = await simgosQuery<Record<string, unknown>>(
    `SELECT ${buildSelect(spec)}
       FROM \`${SCHEMA}\`.\`${table}\`
      WHERE ${where}`,
    params,
  );

  const rows = await finalizeRows(spec, raw);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return keys
    .map((k) => byKey.get(k))
    .filter((r): r is SyncRow => r !== undefined);
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
  "kunjungan", // id kunjungan internal SIMGOS — bukan field FHIR
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

  // PK komposit → WHERE keyCol=? AND keyCol2=? (key = "keyCol_keyCol2").
  let where = `\`${keyCol}\` = ?`;
  let params: unknown[] = [key];
  if (spec.keyCol2) {
    const [k1, k2] = splitKey(key);
    where = `\`${keyCol}\` = ? AND \`${ident(spec.keyCol2)}\` = ?`;
    params = [k1, k2];
  }

  const rows = await simgosQuery<Record<string, unknown>>(
    `SELECT * FROM \`${SCHEMA}\`.\`${table}\` WHERE ${where} LIMIT 1`,
    params,
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
