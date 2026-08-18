// lib/ihs/patient.sync.ts
// ─────────────────────────────────────────────────────────────
// DAL READ-ONLY untuk memantau status sinkronisasi modul PATIENT
// dari SIMGOS `kemkes-ihs`.patient ke Satu Sehat.
//
// Pola deteksi (lihat docs/workflows/28-modules-integration.md):
//   id IS NOT NULL  → sudah terkirim (id = UUID resource Satu Sehat)
//   id IS NULL       → belum terkirim
//   statusRequest=1  → siap kirim (data lengkap, lolos gating trigger)
//
// 🔒 Hanya SELECT. Tidak menulis apa pun ke SIMGOS.
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";

export type PatientSyncFilter = "semua" | "terkirim" | "belum" | "siap";

export interface PatientSyncSummary {
  total: number;
  terkirim: number;
  belum: number;
  siap: number;
}

export interface PatientSyncRow {
  refId: string; // NORM (kunci sumber SIMGOS)
  nama: string | null;
  nik: string | null;
  satuSehatId: string | null; // id — null jika belum terkirim
  terkirim: boolean;
  siap: boolean; // statusRequest = 1
  httpRequest: string | null; // 'GET' | 'POST'
  updatedAt: string | null; // ISO
}

// ── Helpers ────────────────────────────────────────────────

function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

/** Ambil nama dari kolom JSON `name` = [{ use, text }]. */
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

function toIso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Queries ────────────────────────────────────────────────

export async function getPatientSyncSummary(): Promise<PatientSyncSummary> {
  const rows = await simgosQuery<Record<string, unknown>>(
    `SELECT
       COUNT(*)                                   AS total,
       SUM(id IS NOT NULL)                        AS terkirim,
       SUM(id IS NULL)                            AS belum,
       SUM(id IS NULL AND statusRequest = 1)      AS siap
     FROM \`kemkes-ihs\`.patient`,
  );
  const r = rows[0] ?? {};
  return {
    total: toNum(r.total),
    terkirim: toNum(r.terkirim),
    belum: toNum(r.belum),
    siap: toNum(r.siap),
  };
}

export async function getPatientSyncRows(
  filter: PatientSyncFilter = "semua",
  page = 1,
  pageSize = 20,
): Promise<PatientSyncRow[]> {
  const where =
    filter === "terkirim"
      ? "WHERE id IS NOT NULL"
      : filter === "belum"
        ? "WHERE id IS NULL"
        : filter === "siap"
          ? "WHERE id IS NULL AND statusRequest = 1"
          : "";

  // page & pageSize di-clamp ke integer aman (bukan dari input mentah)
  const safeSize = Math.min(Math.max(1, Math.trunc(pageSize)), 100);
  const safePage = Math.max(1, Math.trunc(page));
  const offset = (safePage - 1) * safeSize;

  const rows = await simgosQuery<Record<string, unknown>>(
    `SELECT refId, nik, id, statusRequest, httpRequest, name, getDate
       FROM \`kemkes-ihs\`.patient
       ${where}
       ORDER BY getDate DESC
       LIMIT ${safeSize} OFFSET ${offset}`,
  );

  return rows.map((r) => ({
    refId: String(r.refId ?? ""),
    nama: parseName(r.name),
    nik: r.nik ? String(r.nik) : null,
    satuSehatId: r.id ? String(r.id) : null,
    terkirim: r.id != null,
    siap: toNum(r.statusRequest) === 1,
    httpRequest: r.httpRequest ? String(r.httpRequest) : null,
    updatedAt: toIso(r.getDate),
  }));
}
