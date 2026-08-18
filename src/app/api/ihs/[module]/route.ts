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
  countForFilter,
  type SyncFilter,
} from "@/app/lib/ihs/module-sync";

const PAGE_SIZE = 10;

function normFilter(v: string | null): SyncFilter {
  return v === "terkirim" || v === "belum" || v === "siap" ? v : "semua";
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
  const requestedPage = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);

  try {
    const summary = await getModuleSyncSummary(spec);
    const totalRows = countForFilter(summary, filter);
    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const rows = await getModuleSyncRows(spec, filter, page, PAGE_SIZE);

    return NextResponse.json({
      module: spec.module,
      resourceType: spec.resourceType,
      keyLabel: spec.keyLabel,
      columns: spec.columns.map((c) => ({ label: c.label, type: c.type })),
      createFromMaster: spec.createFromMaster ?? false,
      summary,
      filter,
      page,
      pageSize: PAGE_SIZE,
      totalRows,
      totalPages,
      rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca data SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
