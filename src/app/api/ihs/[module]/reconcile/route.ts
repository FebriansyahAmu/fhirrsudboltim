// app/api/ihs/[module]/reconcile/route.ts
// POST — RECONCILE MASSAL Observation LAB (jenis=6): sesuaikan baris yang masih
// berkode salah 11477-7 dengan katalog LOINC kita lalu WRITE-BACK code/value/
// interpretation ke SIMGOS, per batch (cursor refId). Membuat staging SIMGOS
// konsisten SEBELUM dikirim (PUT). 🔒 Terautentikasi + rate-limited. Hanya
// modul `observation`. Tulis = UPDATE tersanksi (lihat lab-writeback.ts); tidak
// menyentuh Satu Sehat.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { reconcileLabObservationsBatch } from "@/app/lib/dal/lab-writeback";

const DEFAULT_BATCH = 1000;

export async function POST(
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
  if (module !== "observation") {
    return NextResponse.json(
      { error: "Reconcile hanya untuk modul Observation" },
      { status: 400 },
    );
  }

  // cursor & batchSize dari body (opsional) atau query string.
  let cursor = 0;
  let batchSize = DEFAULT_BATCH;
  try {
    const body = (await request.json()) as {
      cursor?: unknown;
      batchSize?: unknown;
    };
    if (body && typeof body === "object") {
      const c = Number(body.cursor);
      if (Number.isFinite(c) && c >= 0) cursor = Math.floor(c);
      const b = Number(body.batchSize);
      if (Number.isFinite(b) && b > 0) batchSize = Math.floor(b);
    }
  } catch {
    // tanpa body → pakai default (mulai dari awal).
  }

  try {
    const res = await reconcileLabObservationsBatch(cursor, batchSize);
    return NextResponse.json(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal reconcile SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
