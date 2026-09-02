// app/api/ihs/missing-encounter/route.ts
// GET  : daftar pendaftaran (ranap) yang belum punya Encounter (di-skip ETL).
// POST : buat Encounter untuk sebuah refId (INSERT refId → trigger SIMGOS
//        membangun sisanya). Terautentikasi + rate-limited.
//
// Catatan: path "missing-encounter" (bukan "encounter/…") sengaja agar tidak
// menaungi route dinamis `[module]` untuk modul "encounter".

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import {
  listMissingEncounters,
  createMissingEncounter,
} from "@/app/lib/ihs/encounter-missing.dal";

function normDate(v: string | null): string | undefined {
  if (!v) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

/** Kata kunci pencarian No. Pendaftaran — hanya digit (prefix), aman injeksi. */
function normKey(v: string | null): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  return /^[0-9]{1,10}$/.test(s) ? s : undefined;
}

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "enc-missing");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);

  try {
    const data = await listMissingEncounters({
      from: normDate(sp.get("from")),
      to: normDate(sp.get("to")),
      keyQuery: normKey(sp.get("key")),
      page,
      pageSize: 10,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca data SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "enc-missing-create");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const refId =
    body && typeof body === "object" && "refId" in body
      ? String((body as { refId: unknown }).refId)
      : "";
  if (!/^\d{10}$/.test(refId)) {
    return NextResponse.json({ error: "refId tidak valid" }, { status: 400 });
  }

  try {
    const result = await createMissingEncounter(refId);
    console.log(
      `[encounter create] refId=${refId} created=${result.created} exists=${result.alreadyExists} by=${session.userId}`,
    );
    return NextResponse.json({ refId, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membuat Encounter";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
