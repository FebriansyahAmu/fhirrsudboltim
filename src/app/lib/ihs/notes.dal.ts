// lib/ihs/notes.dal.ts
// ─────────────────────────────────────────────────────────────
// Anotasi operator (catatan + penanda warna) per baris data SIMGOS.
// Disimpan di DB kita sendiri `fhir_satusehat` (tabel ihs_row_notes) —
// BUKAN SIMGOS, jadi boleh di-write.
//
// Guna utama: menandai pasien yang sudah dikirim tapi tetap tanpa id
// Satu Sehat (mis. NIK salah / duplicate) + catatan tindak lanjut.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { prisma } from "@/app/lib/db/prisma";

/** Penanda warna yang diizinkan. */
export const MARK_VALUES = ["merah", "kuning", "hijau", "biru"] as const;
export type MarkValue = (typeof MARK_VALUES)[number];

export const NOTE_MAX = 2000;

export function isValidMark(v: unknown): v is MarkValue {
  return typeof v === "string" && (MARK_VALUES as readonly string[]).includes(v);
}

export interface RowNote {
  mark: string | null;
  note: string | null;
  nik: string | null;
  updatedAt: string; // ISO
}

/** Ambil anotasi untuk sekumpulan key (batch), dipetakan per ref_key. */
export async function getNotesForKeys(
  module: string,
  keys: string[],
): Promise<Record<string, RowNote>> {
  if (keys.length === 0) return {};
  const rows = await prisma.ihs_row_notes.findMany({
    where: { module, ref_key: { in: keys } },
    select: { ref_key: true, mark: true, note: true, nik: true, updated_at: true },
  });
  const out: Record<string, RowNote> = {};
  for (const r of rows) {
    out[r.ref_key] = {
      mark: r.mark,
      note: r.note,
      nik: r.nik,
      updatedAt: r.updated_at.toISOString(),
    };
  }
  return out;
}

/** Upsert satu anotasi (per module + ref_key). */
export async function upsertNote(params: {
  module: string;
  refKey: string;
  nik?: string | null;
  mark?: string | null;
  note?: string | null;
  userId: string;
}): Promise<RowNote> {
  const { module, refKey, nik = null, mark = null, note = null, userId } = params;
  const r = await prisma.ihs_row_notes.upsert({
    where: { module_ref_key: { module, ref_key: refKey } },
    create: {
      id: randomUUID(),
      module,
      ref_key: refKey,
      nik,
      mark,
      note,
      created_by: userId,
    },
    update: { nik, mark, note, created_by: userId },
    select: { ref_key: true, mark: true, note: true, nik: true, updated_at: true },
  });
  return {
    mark: r.mark,
    note: r.note,
    nik: r.nik,
    updatedAt: r.updated_at.toISOString(),
  };
}

/** Hapus anotasi. */
export async function deleteNote(module: string, refKey: string): Promise<void> {
  await prisma.ihs_row_notes.deleteMany({ where: { module, ref_key: refKey } });
}

export interface NoteCounts {
  total: number;
  merah: number;
  kuning: number;
  hijau: number;
  biru: number;
}

/** Hitung jumlah anotasi per warna untuk satu modul. */
export async function getNoteCounts(module: string): Promise<NoteCounts> {
  const grouped = await prisma.ihs_row_notes.groupBy({
    by: ["mark"],
    where: { module },
    _count: { _all: true },
  });
  const counts: NoteCounts = { total: 0, merah: 0, kuning: 0, hijau: 0, biru: 0 };
  for (const g of grouped) {
    const n = g._count._all;
    counts.total += n;
    if (isValidMark(g.mark)) counts[g.mark] += n;
  }
  return counts;
}

export type NoteFilter = "ada" | MarkValue;

/** Daftar baris bercatatan (paginated) — key + peta note. Diurut terbaru dulu. */
export async function listNotedKeys(
  module: string,
  filter: NoteFilter,
  page: number,
  pageSize: number,
): Promise<{ keys: string[]; notes: Record<string, RowNote>; total: number }> {
  const where =
    filter === "ada" ? { module } : { module, mark: filter as string };
  const size = Math.min(Math.max(1, Math.trunc(pageSize)), 100);
  const skip = (Math.max(1, Math.trunc(page)) - 1) * size;

  const [total, rows] = await Promise.all([
    prisma.ihs_row_notes.count({ where }),
    prisma.ihs_row_notes.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip,
      take: size,
      select: {
        ref_key: true,
        mark: true,
        note: true,
        nik: true,
        updated_at: true,
      },
    }),
  ]);

  const keys: string[] = [];
  const notes: Record<string, RowNote> = {};
  for (const r of rows) {
    keys.push(r.ref_key);
    notes[r.ref_key] = {
      mark: r.mark,
      note: r.note,
      nik: r.nik,
      updatedAt: r.updated_at.toISOString(),
    };
  }
  return { keys, notes, total };
}

/**
 * Identifier (NIK) yang PERNAH kita POST untuk suatu resource — dari delivery_logs.
 * Dipakai menandai baris "sudah dikirim tapi tetap tanpa id Satu Sehat".
 */
export async function getAttemptedIdentifiers(
  resourceType: string,
): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ nik: string | null }[]>`
    SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.identifier[0].value')) AS nik
      FROM delivery_logs
     WHERE resource_type = ${resourceType} AND method = 'POST'
  `;
  const set = new Set<string>();
  for (const r of rows) if (r.nik) set.add(String(r.nik));
  return set;
}
