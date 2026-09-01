// app/api/fhir/[resource]/route.ts
// Entry point FHIR API — GET (list/search) dan POST (create)
//
// Request Flow:
//   Browser → route.ts → fhir.dal.ts → Satu Sehat API
//                               ↓
//                          prisma.ts (simpan log)

import { NextRequest, NextResponse } from "next/server";
import { sendToSatuSehat } from "@/app/lib/dal/fhir.dal";
import {
  writeBackPatientRecord,
  nikFromIdentifierParam,
} from "@/app/lib/dal/patient-writeback";
import { handleEncounterPostResult } from "@/app/lib/dal/encounter-writeback";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import {
  ALLOWED_RESOURCES,
  validateFhirPayload,
} from "@/app/lib/constants/fhir";

// ─────────────────────────────────────────────
// GET /api/fhir/[resource] — ambil list atau search
// ─────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "fhir");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tidak terautentikasi" },
      { status: 401 },
    );
  }

  const { resource } = await params;

  if (!ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json(
      { error: "Resource type tidak diizinkan" },
      { status: 400 },
    );
  }

  const { searchParams } = request.nextUrl;
  const queryParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    queryParams[key] = value;
  });

  const result = await sendToSatuSehat({
    method: "GET",
    resourceType: resource,
    queryParams,
    userId: session.userId,
  });

  // Patient GET by NIK (2xx) → write-back data yang KOSONG di SIMGOS
  // (id/identifier/meta/name) untuk pasien yang terlanjur dikirim tanpa
  // dilengkapi. HANYA saat pencarian memang memakai NIK (identifier param),
  // ditautkan via NIK itu. Kegagalan tak membatalkan response ke client.
  const knownNik = nikFromIdentifierParam(queryParams.identifier);
  if (
    resource === "Patient" &&
    knownNik &&
    result.status >= 200 &&
    result.status < 300
  ) {
    try {
      const wb = await writeBackPatientRecord(result.data, { knownNik });
      if (wb) {
        console.log(
          `[patient GET writeback] nik=${wb.nik} cols=${wb.cols.join("+")} rows=${wb.updated}`,
        );
      }
    } catch (err) {
      console.error("[patient GET writeback] gagal update SIMGOS patient:", err);
    }
  }

  return NextResponse.json(result.data, { status: result.status });
}

// ─────────────────────────────────────────────
// POST /api/fhir/[resource] — buat resource baru
// ─────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "fhir");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tidak terautentikasi" },
      { status: 401 },
    );
  }

  const { resource } = await params;

  if (!ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json(
      { error: "Resource type tidak diizinkan" },
      { status: 400 },
    );
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
    method: "POST",
    resourceType: resource,
    payload,
    userId: session.userId,
  });

  // Write-back data IHS ke SIMGOS untuk Patient yang berhasil dibuat (2xx):
  // id + identifier + meta + name (kolom yang masih kosong saja). Menautkan
  // baris via NIK. Kegagalan write-back tidak membatalkan response ke client.
  if (
    resource === "Patient" &&
    result.status >= 200 &&
    result.status < 300
  ) {
    try {
      const wb = await writeBackPatientRecord(result.data, { requestPayload: payload });
      if (wb) {
        console.log(
          `[patient writeback] nik=${wb.nik} id=${wb.ihsId ?? "-"} cols=${wb.cols.join("+")} rows=${wb.updated}`,
        );
      } else {
        console.warn(
          "[patient writeback] dilewati: NIK/data tidak dapat diekstrak dari response",
        );
      }
    } catch (err) {
      console.error("[patient writeback] gagal update SIMGOS patient:", err);
    }
  }

  // Encounter: write-back id ke SIMGOS bila sukses (2xx), atau catatan
  // "kuning" (warning) di DB kita bila gagal (4xx/5xx). Ditautkan via refId
  // (= identifier[0].value). Kegagalan proses ini tidak membatalkan response.
  if (resource === "Encounter") {
    try {
      await handleEncounterPostResult({
        status: result.status,
        responseData: result.data,
        requestPayload: payload,
        userId: session.userId,
      });
    } catch (err) {
      console.error("[encounter] gagal memproses hasil POST:", err);
    }
  }

  return NextResponse.json(result.data, { status: result.status });
}
