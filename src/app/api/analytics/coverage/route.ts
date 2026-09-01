// app/api/analytics/coverage/route.ts
// GET cakupan sinkronisasi per Resource dari SIMGOS (read-only, di-cache 5 mnt).
// 🔒 Terautentikasi + rate-limited. COUNT ringan + cache → beban SIMGOS minimal.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { getResourceCoverage } from "@/app/lib/dal/coverage.dal";

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "analytics-cov");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  // force=1 melewati cache (tombol refresh) — tetap dibatasi rate-limit.
  const force = request.nextUrl.searchParams.get("force") === "1";

  try {
    const data = await getResourceCoverage(force);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca cakupan SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
