// lib/ihs/encounter-missing.dal.ts
// ─────────────────────────────────────────────────────────────
// Pendaftaran yang SEHARUSNYA punya Encounter tapi di-SKIP oleh ETL SIMGOS
// (`pendaftaranToEncounter`) — terutama rawat-inap yang masuk dari IGD
// (`tujuan_pasien.PENDAFTARAN_MASUK_NOMOR` terisi), sehingga jenis kunjungan
// EMER & IMP tidak masing-masing punya Encounter.
//
// Fungsi:
//   • listMissingEncounters — daftar pendaftaran tanpa Encounter (kelas
//     resolvable) untuk ditampilkan di panel (read-only).
//   • createMissingEncounter — INSERT `encounter(refId)` (tersanksi); trigger
//     SIMGOS membangun sisa kolom → Encounter IMP/EMER lengkap seperti native.
// ─────────────────────────────────────────────────────────────

import { simgosQuery, simgosInsertEncounterRefId } from "@/app/lib/db/simgos";

// jenis_kunjungan.CLASS → kode FHIR (v3-ActCode) untuk tampilan.
const CLASS_CODE: Record<number, string> = { 1: "AMB", 2: "EMER", 3: "IMP" };

export interface MissingEncounterRow {
  refId: string;
  classCode: string; // AMB / EMER / IMP (perkiraan; final ditentukan trigger)
  patientName: string | null;
  tanggal: string | null; // ISO
  originRefId: string | null; // PENDAFTARAN_MASUK_NOMOR (mis. NOPEN IGD asal)
}

export interface MissingEncounterList {
  rows: MissingEncounterRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
}

/** Klausa FROM/JOIN/WHERE bersama (pendaftaran tanpa encounter, kelas valid). */
const BASE_FROM = `
  FROM \`pendaftaran\`.\`pendaftaran\` p
  JOIN \`pendaftaran\`.\`tujuan_pasien\` tp ON tp.NOPEN = p.NOMOR
  JOIN \`pendaftaran\`.\`kunjungan\` k
    ON k.NOPEN = tp.NOPEN AND k.RUANGAN = tp.RUANGAN AND k.REF IS NULL
  JOIN \`master\`.\`ruangan\` r ON r.ID = tp.RUANGAN
  JOIN \`kemkes-ihs\`.\`jenis_kunjungan\` jk ON jk.ID = r.JENIS_KUNJUNGAN
  LEFT JOIN \`kemkes-ihs\`.\`encounter\` e ON e.refId = p.NOMOR
 WHERE jk.\`STATUS\` = 1 AND jk.CLASS <> 0
   AND p.\`STATUS\` <> 0
   AND e.refId IS NULL`;

function dateConds(from?: string, to?: string): { sql: string; params: string[] } {
  const conds: string[] = [];
  const params: string[] = [];
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    conds.push("p.TANGGAL >= ?");
    params.push(`${from} 00:00:00`);
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    conds.push("p.TANGGAL <= ?");
    params.push(`${to} 23:59:59`);
  }
  return { sql: conds.length ? " AND " + conds.join(" AND ") : "", params };
}

/** Pencarian by No. Pendaftaran (refId) — prefix match, ramah indeks. */
function keyCond(keyQuery?: string): { sql: string; params: string[] } {
  if (keyQuery && /^[0-9]{1,10}$/.test(keyQuery)) {
    return { sql: " AND p.NOMOR LIKE ?", params: [`${keyQuery}%`] };
  }
  return { sql: "", params: [] };
}

export async function listMissingEncounters(opts: {
  from?: string;
  to?: string;
  keyQuery?: string;
  page?: number;
  pageSize?: number;
}): Promise<MissingEncounterList> {
  const pageSize = Math.min(Math.max(1, Math.trunc(opts.pageSize ?? 10)), 50);
  const page = Math.max(1, Math.trunc(opts.page ?? 1));
  const offset = (page - 1) * pageSize;
  const dc = dateConds(opts.from, opts.to);
  const kc = keyCond(opts.keyQuery);
  const whereExtra = `${dc.sql}${kc.sql}`;
  const whereParams = [...dc.params, ...kc.params];

  const countRows = await simgosQuery<{ n: number }>(
    `SELECT COUNT(DISTINCT p.NOMOR) AS n ${BASE_FROM}${whereExtra}`,
    whereParams,
  );
  const total = Number(countRows[0]?.n ?? 0) || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows = await simgosQuery<{
    refId: string;
    classId: number;
    norm: number;
    tanggal: unknown;
    originRefId: string | null;
  }>(
    `SELECT p.NOMOR AS refId, MAX(jk.CLASS) AS classId, p.NORM AS norm,
            p.TANGGAL AS tanggal, MAX(tp.PENDAFTARAN_MASUK_NOMOR) AS originRefId
       ${BASE_FROM}${whereExtra}
      GROUP BY p.NOMOR, p.NORM, p.TANGGAL
      ORDER BY p.TANGGAL DESC
      LIMIT ${pageSize} OFFSET ${offset}`,
    whereParams,
  );

  // Nama pasien (batch) dari master.pasien.
  const norms = [...new Set(rows.map((r) => Number(r.norm)).filter(Boolean))];
  const nameByNorm = new Map<string, string>();
  if (norms.length) {
    const ph = norms.map(() => "?").join(", ");
    const nameRows = await simgosQuery<{ NORM: number; NAMA: string }>(
      `SELECT NORM, NAMA FROM \`master\`.\`pasien\` WHERE NORM IN (${ph})`,
      norms,
    );
    for (const n of nameRows) {
      if (n.NAMA != null) nameByNorm.set(String(n.NORM), String(n.NAMA));
    }
  }

  return {
    rows: rows.map((r) => {
      const origin = (r.originRefId ?? "").trim();
      const t =
        r.tanggal instanceof Date
          ? r.tanggal
          : r.tanggal
            ? new Date(String(r.tanggal))
            : null;
      return {
        refId: String(r.refId),
        classCode: CLASS_CODE[Number(r.classId)] ?? "—",
        patientName: nameByNorm.get(String(r.norm)) ?? null,
        tanggal: t && !isNaN(t.getTime()) ? t.toISOString() : null,
        originRefId: origin || null,
      };
    }),
    total,
    page: Math.min(page, totalPages),
    totalPages,
    pageSize,
  };
}

/**
 * Buat Encounter untuk sebuah pendaftaran (INSERT refId → trigger membangun
 * sisanya). Divalidasi: pendaftaran valid & kelas resolvable & belum ada
 * Encounter. Return status.
 */
export async function createMissingEncounter(
  refId: string,
): Promise<{ created: boolean; alreadyExists: boolean }> {
  if (!/^\d{10}$/.test(refId)) {
    throw new Error("refId tidak valid");
  }

  const check = await simgosQuery<{ encExists: number; eligible: number }>(
    `SELECT
       (SELECT COUNT(*) FROM \`kemkes-ihs\`.\`encounter\` WHERE refId = ?) AS encExists,
       (SELECT COUNT(*)
          FROM \`pendaftaran\`.\`pendaftaran\` p
          JOIN \`pendaftaran\`.\`tujuan_pasien\` tp ON tp.NOPEN = p.NOMOR
          JOIN \`pendaftaran\`.\`kunjungan\` k
            ON k.NOPEN = tp.NOPEN AND k.RUANGAN = tp.RUANGAN AND k.REF IS NULL
          JOIN \`master\`.\`ruangan\` r ON r.ID = tp.RUANGAN
          JOIN \`kemkes-ihs\`.\`jenis_kunjungan\` jk ON jk.ID = r.JENIS_KUNJUNGAN
         WHERE p.NOMOR = ? AND p.\`STATUS\` <> 0
           AND jk.\`STATUS\` = 1 AND jk.CLASS <> 0) AS eligible`,
    [refId, refId],
  );
  const encExists = Number(check[0]?.encExists ?? 0) > 0;
  const eligible = Number(check[0]?.eligible ?? 0) > 0;

  if (encExists) return { created: false, alreadyExists: true };
  if (!eligible) {
    throw new Error("Pendaftaran tidak memenuhi syarat untuk dibuatkan Encounter");
  }

  try {
    const n = await simgosInsertEncounterRefId(refId);
    return { created: n > 0, alreadyExists: false };
  } catch (e) {
    // Race: baris keburu ada (duplicate PK) → anggap sudah ada.
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate|ER_DUP_ENTRY/i.test(msg)) {
      return { created: false, alreadyExists: true };
    }
    throw e;
  }
}
