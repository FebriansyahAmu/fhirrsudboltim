// app/api/ihs/[module]/[key]/rebuild/route.ts
// POST — RAKIT ULANG Observation LAB (jenis=6) lalu WRITE-BACK ke SIMGOS
// (kolom code/valueQuantity/valueString/interpretation) berdasarkan refId.
// 🔒 Terautentikasi + rate-limited. Satu-satunya tulis = UPDATE tersanksi
//    (lihat lab-writeback.ts). Hanya modul `observation`, hanya baris LAB.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { writeBackLabObservation } from "@/app/lib/dal/lab-writeback";

export async function POST(
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

  // Hanya modul Observation umum/LAB (tabel `observation`, PK refId_jenis).
  if (module !== "observation") {
    return NextResponse.json(
      { error: "Rakit ulang hanya untuk modul Observation" },
      { status: 400 },
    );
  }
  // key = "refId_jenis". LAB = jenis 6.
  if (!/^\d{1,20}_\d+$/.test(key)) {
    return NextResponse.json({ error: "Key tidak valid" }, { status: 400 });
  }
  const [refId, jenis] = key.split("_");
  if (jenis !== "6") {
    return NextResponse.json(
      { error: "Rakit ulang hanya untuk hasil LAB (jenis=6)" },
      { status: 400 },
    );
  }

  try {
    const res = await writeBackLabObservation(refId);
    if (!res) {
      return NextResponse.json(
        {
          error:
            "Tidak ada pemetaan LOINC aktif / nilai valid untuk parameter ini",
        },
        { status: 422 },
      );
    }
    if (res.updated === 0) {
      return NextResponse.json(
        { error: "Baris observation tidak ditemukan di SIMGOS" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      updated: res.updated,
      code: res.rebuild.code,
      codeDisplay: res.rebuild.codeDisplay,
      valueQuantity: res.rebuild.valueQuantity ?? null,
      valueString: res.rebuild.valueString ?? null,
      interpretation: res.rebuild.interpretation ?? null,
      valueDisplay: res.rebuild.valueDisplay,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menulis ke SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
