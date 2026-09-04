// app/api/ihs/[module]/route.ts
// GET status sinkronisasi modul IHS (read-only) untuk panel di halaman modul.
// 🔒 Hanya membaca SIMGOS (SELECT). Terautentikasi + rate-limited.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { getModuleSpec } from "@/app/lib/ihs/registry";
import {
  getModuleSyncSummary,
  getModuleSyncRows,
  getNotedSyncRows,
  countForFilter,
  dependsLabels,
  type SyncFilter,
  type DateRange,
  type JenisFilter,
} from "@/app/lib/ihs/module-sync";
import {
  getNotesForKeys,
  getNoteCounts,
  listNotedKeys,
  type NoteFilter,
} from "@/app/lib/ihs/notes.dal";

const PAGE_SIZE = 10;

function normFilter(v: string | null): SyncFilter {
  return v === "terkirim" || v === "belum" || v === "siap" ? v : "semua";
}

function normNoteFilter(v: string | null): NoteFilter | "" {
  if (v === "ada") return "ada";
  if (v === "merah" || v === "kuning" || v === "hijau" || v === "biru") return v;
  return "";
}

/** Sub-filter jenis (khusus modul observation): lab (jenis=6) / ttv (≠6). */
function normJenis(v: string | null): JenisFilter | undefined {
  return v === "lab" || v === "ttv" ? v : undefined;
}

/** Validasi kata kunci pencarian key (mis. No. Pendaftaran) — alfanumerik saja. */
function normKey(v: string | null): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  return /^[A-Za-z0-9]{1,32}$/.test(s) ? s : undefined;
}

/** Validasi tanggal YYYY-MM-DD (dan kewajaran nilainya). */
function normDate(v: string | null): string | undefined {
  if (!v) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return undefined;
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return undefined;
  return v;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ module: string }> },
) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "ihs");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const { module } = await params;
  const spec = getModuleSpec(module);
  if (!spec) {
    return NextResponse.json(
      { error: `Modul IHS '${module}' belum terdaftar` },
      { status: 404 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const filter = normFilter(sp.get("filter"));
  const noteFilter = normNoteFilter(sp.get("note"));
  const keyQuery = normKey(sp.get("key"));
  const jenisFilter = normJenis(sp.get("jenis"));
  const requestedPage = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);

  // Rentang tanggal hanya berlaku bila modul mendukung (spec.dateKey).
  const supportsDate = !!spec.dateKey;
  const range: DateRange | undefined = supportsDate
    ? { from: normDate(sp.get("from")), to: normDate(sp.get("to")) }
    : undefined;

  try {
    const [summary, noteCounts] = await Promise.all([
      getModuleSyncSummary(spec, range, keyQuery, jenisFilter),
      getNoteCounts(spec.module),
    ]);

    const base = {
      module: spec.module,
      resourceType: spec.resourceType,
      keyLabel: spec.keyLabel,
      searchLabel: spec.searchLabel ?? spec.keyLabel,
      columns: spec.columns.map((c) => ({ label: c.label, type: c.type })),
      createFromMaster: spec.createFromMaster ?? false,
      dependsOnLabel: dependsLabels(spec)[0] ?? null,
      dependsOnLabels: dependsLabels(spec),
      detailBase: spec.detailBase ?? null,
      supportsDate,
      dateFrom: range?.from ?? null,
      dateTo: range?.to ?? null,
      summary,
      noteCounts,
      filter,
      noteFilter,
      pageSize: PAGE_SIZE,
    };

    // ── Mode "bercatatan": listing didorong tabel notes (DB kita) ──
    // Pencarian key (keyQuery) diprioritaskan → lewati mode bercatatan.
    if (noteFilter && !keyQuery) {
      const totalRows =
        noteFilter === "ada" ? noteCounts.total : noteCounts[noteFilter];
      const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
      const page = Math.min(requestedPage, totalPages);
      const { keys, notes } = await listNotedKeys(
        spec.module,
        noteFilter,
        page,
        PAGE_SIZE,
      );
      const rows = await getNotedSyncRows(spec, keys);
      return NextResponse.json({
        ...base,
        page,
        totalRows,
        totalPages,
        rows,
        notes,
      });
    }

    // ── Mode normal: listing dari SIMGOS (di-scope range tanggal) ──
    const totalRows = countForFilter(summary, filter);
    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const rows = await getModuleSyncRows(
      spec,
      filter,
      page,
      PAGE_SIZE,
      range,
      keyQuery,
      jenisFilter,
    );
    const notes = await getNotesForKeys(
      spec.module,
      rows.map((r) => r.key),
    );

    return NextResponse.json({
      ...base,
      page,
      totalRows,
      totalPages,
      rows,
      notes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca data SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
