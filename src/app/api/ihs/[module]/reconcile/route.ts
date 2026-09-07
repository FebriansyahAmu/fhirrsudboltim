// app/api/ihs/[module]/reconcile/route.ts
// POST — RECONCILE MASSAL staging SIMGOS. 🔒 Terautentikasi + rate-limited.
// Tulis = UPDATE tersanksi; tidak menyentuh Satu Sehat.
//   • module=observation → Observation LAB (jenis=6): perbaiki kode 11477-7 ke
//     katalog LOINC + value/interpretation, per batch (cursor refId).
//   • module=specimen → salin id ServiceRequest terkirim (service_request.id,
//     UUID) ke specimen.request untuk spesimen ber-refId sama (sekali jalan).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { reconcileLabObservationsBatch } from "@/app/lib/dal/lab-writeback";
import { reconcileSpecimenRequestRefs } from "@/app/lib/dal/specimen-writeback";
import {
  reconcileMedicationRefs,
  reconcileMedicationSendFlags,
} from "@/app/lib/dal/medication-writeback";

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

  // Specimen: sekali jalan (satu UPDATE join) — salin id SR terkirim ke request.
  if (module === "specimen") {
    try {
      const updated = await reconcileSpecimenRequestRefs();
      return NextResponse.json({ updated, done: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal reconcile Specimen";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // Medication: PEMICU HILIR — flip `send=0` pada Medication terkirim yang
  // nyangkut `send=1` → trigger SIMGOS membuat MedicationRequest/Dispense yang
  // hilang. `limit` (opsional, dari body) → mode UJI (pilot) N baris terbaru
  // sebelum batch penuh. Lalu propagasikan referensi ke baris hilir yang sudah
  // ada (memperbaiki medicationReference basi).
  if (module === "medication") {
    let limit: number | undefined;
    try {
      const body = (await request.json()) as { limit?: unknown };
      const l = Number(body?.limit);
      if (Number.isFinite(l) && l > 0) limit = Math.floor(l);
    } catch {
      // tanpa body → batch penuh.
    }
    try {
      const created = await reconcileMedicationSendFlags(limit);
      // Pelengkap: rapikan referensi basi pada baris hilir yang sudah ada.
      const refs = await reconcileMedicationRefs();
      return NextResponse.json({
        updated: created,
        refsUpdated: refs,
        pilot: limit != null,
        done: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal reconcile Medication";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  if (module !== "observation") {
    return NextResponse.json(
      { error: "Reconcile hanya untuk modul Observation/Specimen" },
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
