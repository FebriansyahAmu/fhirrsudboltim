// app/api/analytics/route.ts
// GET agregasi analitik pengiriman FHIR → Satu Sehat (read-only, DB kita).
// 🔒 Terautentikasi + rate-limited. Tidak menyentuh SIMGOS.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { getAnalytics, normalizeDays } from "@/app/lib/dal/analytics.dal";

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "analytics");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const days = normalizeDays(request.nextUrl.searchParams.get("days"));

  try {
    const data = await getAnalytics(session.userId, days);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal mengambil data analitik";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
