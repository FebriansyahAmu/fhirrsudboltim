// app/api/fhir/[resource]/route.ts
// Entry point FHIR API — GET (list/search) dan POST (create)
//
// Request Flow:
//   Browser → route.ts → fhir.dal.ts → Satu Sehat API
//                               ↓
//                          prisma.ts (simpan log)

import { NextRequest, NextResponse } from "next/server";
import { sendToSatuSehat } from "@/app/lib/dal/fhir.dal";
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

  return NextResponse.json(result.data, { status: result.status });
}
