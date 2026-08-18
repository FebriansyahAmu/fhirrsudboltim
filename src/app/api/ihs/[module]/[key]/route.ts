// app/api/ihs/[module]/[key]/route.ts
// GET payload FHIR (draft) yang dirakit dari satu baris staging SIMGOS.
// 🔒 Read-only (SELECT). Terautentikasi + rate-limited. Untuk preview/autofill.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { getModuleSpec } from "@/app/lib/ihs/registry";
import { getModulePayload } from "@/app/lib/ihs/module-sync";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; key: string }> },
) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "ihs");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const { module, key } = await params;
  const spec = getModuleSpec(module);
  if (!spec) {
    return NextResponse.json(
      { error: `Modul IHS '${module}' belum terdaftar` },
      { status: 404 },
    );
  }

  // Batasi bentuk key (alfanumerik/underscore/dash) — cegah nilai aneh.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
    return NextResponse.json({ error: "Key tidak valid" }, { status: 400 });
  }

  try {
    const result = await getModulePayload(spec, key);
    if (!result) {
      return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca data SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
