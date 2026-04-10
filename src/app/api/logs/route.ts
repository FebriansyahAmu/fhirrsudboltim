// app/api/logs/route.ts
// Ambil log pengiriman dari database untuk user yang sedang login

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { getDeliveryLogs } from "@/app/lib/dal/fhir.dal";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tidak terautentikasi" },
      { status: 401 },
    );
  }

  const resourceType =
    request.nextUrl.searchParams.get("resourceType") ?? undefined;

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
