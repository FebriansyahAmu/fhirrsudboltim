// app/api/encounter/[refId]/detail/route.ts
// GET "Detail Encounter": header + resource klinis anak (Condition,
// Observation, Procedure, dst.) dikumpulkan dari SIMGOS berdasarkan
// encounter refId (via kolom terindeks `nopen`).
//
// 🔒 Read-only (SELECT). Terautentikasi + rate-limited.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { getEncounterDetail } from "@/app/lib/ihs/encounter-detail";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ refId: string }> },
) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "ihs");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const { refId } = await params;
  // No. Pendaftaran = alfanumerik pendek (mis. "2605090003").
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(refId)) {
    return NextResponse.json({ error: "refId tidak valid" }, { status: 400 });
  }

  try {
    const detail = await getEncounterDetail(refId);
    if (!detail.encounter.found) {
      return NextResponse.json(
        { error: `Encounter '${refId}' tidak ditemukan di SIMGOS` },
        { status: 404 },
      );
    }
    return NextResponse.json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca data SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
