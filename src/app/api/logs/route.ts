// app/api/logs/route.ts
// Ambil log pengiriman dari database untuk user yang sedang login

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { getDeliveryLogs } from "@/app/lib/dal/fhir.dal";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { ALLOWED_RESOURCES } from "@/app/lib/constants/fhir";

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "logs");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tidak terautentikasi" },
      { status: 401 },
    );
  }

  const rawResourceType =
    request.nextUrl.searchParams.get("resourceType") ?? undefined;

  const resourceType =
    rawResourceType && ALLOWED_RESOURCES.has(rawResourceType)
      ? rawResourceType
      : undefined;

  const rows = await getDeliveryLogs(session.userId, resourceType);

  // Map dari snake_case DB ke camelCase yang dipakai DeliveryLogTable
  const logs = rows.map((r) => ({
    id: r.id,
    method: r.method,
    endpoint: r.endpoint,
    statusCode: r.status_code,
    status: r.status,
    payload: r.payload,
    response: r.response,
    sentAt: r.sent_at.toISOString(),
    timeMs: r.time_ms,
    resourceType: r.resource_type,
    resourceId: r.resource_id ?? undefined,
  }));

  return NextResponse.json(logs);
}
