// app/api/fhir/[resource]/[id]/route.ts
// GET, PUT, PATCH by resource ID

import { NextRequest, NextResponse } from "next/server";
import { sendToSatuSehat } from "@/app/lib/dal/fhir.dal";
import { getSession } from "@/app/lib/session";
import { isValidUUID } from "@/app/lib/utils/security";

const ALLOWED_RESOURCES = new Set([
  "AllergyIntolerance",
  "CarePlan",
  "ClinicalImpression",
  "Condition",
  "DiagnosticReport",
  "Encounter",
  "EpisodeOfCare",
  "Location",
  "MedicationRequest",
  "Observation",
  "Organization",
  "Patient",
  "Practitioner",
  "Procedure",
  "ImagingStudy",
  "Questionnaire",
  "QuestionnaireResponse",
  "ServiceRequest",
]);

async function getAuthenticatedSession() {
  const session = await getSession();
  if (!session) return null;
  return session;
}

type RouteContext = { params: Promise<{ resource: string; id: string }> };

// ─────────────────────────────────────────────
// GET /api/fhir/[resource]/[id]
// ─────────────────────────────────────────────
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await getAuthenticatedSession();
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

  return NextResponse.json(result.data, { status: result.status });
}

// ─────────────────────────────────────────────
// PUT /api/fhir/[resource]/[id] — update penuh
// ─────────────────────────────────────────────
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await getAuthenticatedSession();
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

  const result = await sendToSatuSehat({
    method: "PUT",
    resourceType: resource,
    resourceId: id,
    payload,
    userId: session.userId,
  });

  return NextResponse.json(result.data, { status: result.status });
}

// ─────────────────────────────────────────────
// PATCH /api/fhir/[resource]/[id] — update sebagian
// ─────────────────────────────────────────────
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = await getAuthenticatedSession();
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

  const result = await sendToSatuSehat({
    method: "PATCH",
    resourceType: resource,
    resourceId: id,
    payload,
    userId: session.userId,
  });

  return NextResponse.json(result.data, { status: result.status });
}
