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
import {
  reconcileSpecimenRequestRefs,
  reconcileSpecimenSendFlags,
} from "@/app/lib/dal/specimen-writeback";
import {
  reconcileServiceRequestSendFlags,
  reconcileMissingLabSpecimens,
} from "@/app/lib/dal/servicerequest-writeback";
import { reconcileObservationSendFlags } from "@/app/lib/dal/observation-writeback";
import {
  reconcileMedicationRefs,
  reconcileMedicationSendFlags,
  reconcileMedicationDispenseAuth,
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

  // Specimen: DUA aksi.
  //   • action="trigger" → PEMICU HILIR: flip `send=0` pada Specimen terkirim
  //     yang nyangkut send=1 → trigger membangun Observation lab (`limit` = UJI).
  //   • default → salin id SR terkirim ke `specimen.request` (sekali jalan).
  if (module === "specimen") {
    let action: string | undefined;
    let limit: number | undefined;
    try {
      const body = (await request.json()) as { action?: unknown; limit?: unknown };
      if (typeof body?.action === "string") action = body.action;
      const l = Number(body?.limit);
      if (Number.isFinite(l) && l > 0) limit = Math.floor(l);
    } catch {
      // tanpa body → aksi default.
    }
    try {
      if (action === "trigger") {
        const updated = await reconcileSpecimenSendFlags(limit);
        return NextResponse.json({ updated, pilot: limit != null, done: true });
      }
      const updated = await reconcileSpecimenRequestRefs();
      return NextResponse.json({ updated, done: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal reconcile Specimen";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // Medication: PEMICU HILIR — flip `send=0` pada Medication resep (jenis=1)
  // terkirim yang nyangkut `send=1` → trigger SIMGOS membuat MedicationRequest
  // yang hilang. Dispense (jenis=2) SENGAJA tidak disentuh: authorizingPrescription
  // baru resolve bila Request sudah terkirim, jadi dispense lahir lewat urutan
  // kirim. `limit` (opsional, dari body) → mode UJI (pilot) N baris terbaru
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
      // Backfill authorizingPrescription pada dispense yg request-nya kini
      // sudah terkirim (no-op selama belum ada request terkirim).
      const dispenseAuth = await reconcileMedicationDispenseAuth();
      return NextResponse.json({
        updated: created,
        refsUpdated: refs,
        dispenseAuthUpdated: dispenseAuth,
        pilot: limit != null,
        done: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal reconcile Medication";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // ServiceRequest (semua jenis): "Bangun Specimen & ImagingStudy" — DUA
  // mekanisme, keduanya membangun data hilir yang hilang:
  //   (a) flip `send=0` pada SR lab (JENIS=8) & radiologi (JENIS=7) terkirim yang
  //       nyangkut `send=1` → trigger `service_request_after_update` membangun
  //       Specimen / ImagingStudy (kasus order BER-petugas; tunggakan sejak ~10 Agu).
  //   (b) INSERT langsung `specimen` untuk order lab terkirim TANPA petugas
  //       (performer null) yang tak pernah memicu trigger (trigger memaksa send=0
  //       → tak ada transisi). Menyalin persis statement trigger, idempotent.
  // `limit` (opsional) → UJI N baris terbaru dulu sebelum batch penuh (berlaku
  // untuk kedua mekanisme). `updated` = total baris terbentuk (a + b).
  if (module.startsWith("servicerequest")) {
    let limit: number | undefined;
    try {
      const body = (await request.json()) as { limit?: unknown };
      const l = Number(body?.limit);
      if (Number.isFinite(l) && l > 0) limit = Math.floor(l);
    } catch {
      // tanpa body → batch penuh.
    }
    try {
      const sendFlipped = await reconcileServiceRequestSendFlags(limit);
      const specimensInserted = await reconcileMissingLabSpecimens(limit);
      return NextResponse.json({
        updated: sendFlipped + specimensInserted,
        sendFlipped,
        specimensInserted,
        pilot: limit != null,
        done: true,
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Gagal reconcile ServiceRequest";
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
  let action: string | undefined;
  let trigLimit: number | undefined;
  try {
    const body = (await request.json()) as {
      cursor?: unknown;
      batchSize?: unknown;
      action?: unknown;
      limit?: unknown;
    };
    if (body && typeof body === "object") {
      if (typeof body.action === "string") action = body.action;
      const tl = Number(body.limit);
      if (Number.isFinite(tl) && tl > 0) trigLimit = Math.floor(tl);
      const c = Number(body.cursor);
      if (Number.isFinite(c) && c >= 0) cursor = Math.floor(c);
      const b = Number(body.batchSize);
      if (Number.isFinite(b) && b > 0) batchSize = Math.floor(b);
    }
  } catch {
    // tanpa body → pakai default (mulai dari awal).
  }

  // Observation: action="trigger" → PEMICU HILIR: flip `send=0` pada Observation
  // lab/rad (jenis 6/7) terkirim yang nyangkut send=1 → trigger SIMGOS membangun
  // DiagnosticReport yang hilang (`limit` = UJI N baris terbaru).
  if (action === "trigger") {
    try {
      const updated = await reconcileObservationSendFlags(trigLimit);
      return NextResponse.json({ updated, pilot: trigLimit != null, done: true });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Gagal reconcile Observation";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // default → rakit ulang LOINC (batch by cursor refId).
  try {
    const res = await reconcileLabObservationsBatch(cursor, batchSize);
    return NextResponse.json(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal reconcile SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
