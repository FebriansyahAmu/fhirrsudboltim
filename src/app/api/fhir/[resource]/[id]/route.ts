// app/api/fhir/[resource]/[id]/route.ts
// GET, PUT, PATCH by resource ID

import { NextRequest, NextResponse } from "next/server";
import { sendToSatuSehat } from "@/app/lib/dal/fhir.dal";
import { maybeClinicalWriteBack } from "@/app/lib/dal/clinical-writeback";
import { maybeLabObservationWriteBack } from "@/app/lib/dal/lab-writeback";
import { getSession } from "@/app/lib/session";
import { isValidUUID } from "@/app/lib/utils/security";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import {
  ALLOWED_RESOURCES,
  validateFhirPayload,
} from "@/app/lib/constants/fhir";

type RouteContext = { params: Promise<{ resource: string; id: string }> };

// ─────────────────────────────────────────────
// GET /api/fhir/[resource]/[id]
// ─────────────────────────────────────────────
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const limited = checkRateLimit(_request, RATE_LIMITS.api, "fhir");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tidak terautentikasi" },
      { status: 401 },
    );
  }

  const { resource, id } = await params;

  if (!ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json(
      { error: "Resource type tidak diizinkan" },
      { status: 400 },
    );
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
  }

  const result = await sendToSatuSehat({
    method: "GET",
    resourceType: resource,
    resourceId: id,
    userId: session.userId,
  });

  // Resource KLINIS (GET by-id): bila client menyertakan ?module=&key= dan
  // hasilnya 2xx, write-back id + subject + encounter ke baris staging (IF null)
  // — memperbaiki baris yang "terlanjur" terkirim sebelum ada write-back. Guard
  // id di DAL memastikan hanya baris yang id-nya kosong/sama yang tersentuh.
  await maybeClinicalWriteBack({
    searchParams: _request.nextUrl.searchParams,
    resource,
    status: result.status,
    responseData: result.data,
  });

  return NextResponse.json(result.data, { status: result.status });
}

// ─────────────────────────────────────────────
// PUT /api/fhir/[resource]/[id] — update penuh
// ─────────────────────────────────────────────
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "fhir");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tidak terautentikasi" },
      { status: 401 },
    );
  }

  const { resource, id } = await params;

  if (!ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json(
      { error: "Resource type tidak diizinkan" },
      { status: 400 },
    );
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const validationError = validateFhirPayload(payload, resource);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const result = await sendToSatuSehat({
    method: "PUT",
    resourceType: resource,
    resourceId: id,
    payload,
    userId: session.userId,
  });

  // Observation LAB (jenis=6): re-PUT sukses (2xx) → write-back code/value/
  // interpretation yg sudah dikoreksi ke SIMGOS `observation` (via ?module=&key=)
  // agar staging konsisten dgn versi baru di Satu Sehat. No-op utk non-LAB.
  await maybeLabObservationWriteBack({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
  });

  return NextResponse.json(result.data, { status: result.status });
}

// ─────────────────────────────────────────────
// PATCH /api/fhir/[resource]/[id] — update sebagian
// ─────────────────────────────────────────────
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "fhir");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tidak terautentikasi" },
      { status: 401 },
    );
  }

  const { resource, id } = await params;

  if (!ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json(
      { error: "Resource type tidak diizinkan" },
      { status: 400 },
    );
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const validationError = validateFhirPayload(payload, resource);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const result = await sendToSatuSehat({
    method: "PATCH",
    resourceType: resource,
    resourceId: id,
    payload,
    userId: session.userId,
  });

  return NextResponse.json(result.data, { status: result.status });
}
