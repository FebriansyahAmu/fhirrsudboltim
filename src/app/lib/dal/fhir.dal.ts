// lib/dal/fhir.dal.ts
// Data Access Layer untuk operasi FHIR ke Satu Sehat
//
// Tanggung jawab:
//   - Forward request ke Satu Sehat dengan token OAuth2
//   - Simpan log pengiriman ke database
//   - Tidak pernah return data ke browser secara langsung

import { randomUUID } from "crypto";
import { prisma } from "@/app/lib/db/prisma";
import { getValidToken } from "./token.dal";
import {
  buildSafeApiUrl,
  buildSafeQueryString,
} from "@/app/lib/utils/security";

export type FhirMethod = "GET" | "POST" | "PUT" | "PATCH";

export interface FhirRequestParams {
  method: FhirMethod;
  resourceType: string;
  resourceId?: string;
  queryParams?: Record<string, string | undefined>;
  payload?: unknown;
  userId: string;
}

export interface FhirResult {
  status: number;
  data: unknown;
  timeMs: number;
}

// ─────────────────────────────────────────────
// Forward request ke Satu Sehat + simpan log
// ─────────────────────────────────────────────
export async function sendToSatuSehat(
  params: FhirRequestParams,
): Promise<FhirResult> {
  const { method, resourceType, resourceId, queryParams, payload, userId } =
    params;

  const baseUrl = process.env.SATU_SEHAT_BASE_URL;
  if (!baseUrl) throw new Error("SATU_SEHAT_BASE_URL belum diset");

  const token = await getValidToken();
  const endpoint =
    buildSafeApiUrl(baseUrl, resourceType, resourceId) +
    (queryParams ? buildSafeQueryString(queryParams) : "");

  const start = Date.now();
  let status = 0;
  let data: unknown = null;

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: payload ? JSON.stringify(payload) : undefined,
      credentials: "omit",
      redirect: "error",
    });

    status = response.status;
    data = await response.json().catch(() => null);
  } catch (err) {
    status = 500;
    data = { error: "Gagal terhubung ke Satu Sehat" };
  }

  const timeMs = Date.now() - start;
  const isSuccess = status >= 200 && status < 300;

  // Simpan log ke database (fire-and-forget, tidak block response)
  saveDeliveryLog({
    userId,
    method,
    resourceType,
    resourceId,
    endpoint,
    statusCode: status,
    status: isSuccess ? "success" : "error",
    timeMs,
    payload: payload ?? null,
    response: data,
  }).catch((err) => {
    console.error("[fhir.dal] Gagal simpan delivery log:", err);
  });

  return { status, data, timeMs };
}

// ─────────────────────────────────────────────
// Simpan log pengiriman ke database
// ─────────────────────────────────────────────
interface SaveLogParams {
  userId: string;
  method: FhirMethod;
  resourceType: string;
  resourceId?: string;
  endpoint: string;
  statusCode: number;
  status: "success" | "error" | "pending";
  timeMs: number;
  payload: unknown;
  response: unknown;
}

async function saveDeliveryLog(params: SaveLogParams): Promise<void> {
  await prisma.delivery_logs.create({
    data: {
      id: randomUUID(),
      user_id: params.userId,
      method: params.method,
      resource_type: params.resourceType,
      resource_id: params.resourceId ?? null,
      endpoint: params.endpoint,
      status_code: params.statusCode,
      status: params.status,
      time_ms: params.timeMs,
      payload: params.payload as object,
      response: params.response as object,
    },
  });
}

// ─────────────────────────────────────────────
// Ambil log pengiriman milik user (untuk halaman dashboard)
// ─────────────────────────────────────────────
export async function getDeliveryLogs(userId: string, resourceType?: string) {
  return prisma.delivery_logs.findMany({
    where: {
      user_id: userId,
      ...(resourceType ? { resource_type: resourceType } : {}),
    },
    orderBy: { sent_at: "desc" },
    take: 100,
  });
}

// ─────────────────────────────────────────────
// Agregasi statistik pengiriman milik user
// ─────────────────────────────────────────────
export interface DeliveryStats {
  total: number;
  success: number;
  failed: number;
  today: number;
  todaySuccess: number;
  todayFailed: number;
  avgResponseMs: number | null;
  lastActivityAt: Date | null;
}

export async function getDeliveryStats(userId: string): Promise<DeliveryStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    total,
    success,
    failed,
    today,
    todaySuccess,
    todayFailed,
    aggTime,
    lastLog,
  ] = await Promise.all([
    prisma.delivery_logs.count({ where: { user_id: userId } }),
    prisma.delivery_logs.count({ where: { user_id: userId, status: "success" } }),
    prisma.delivery_logs.count({ where: { user_id: userId, status: "error" } }),
    prisma.delivery_logs.count({ where: { user_id: userId, sent_at: { gte: todayStart } } }),
    prisma.delivery_logs.count({ where: { user_id: userId, status: "success", sent_at: { gte: todayStart } } }),
    prisma.delivery_logs.count({ where: { user_id: userId, status: "error", sent_at: { gte: todayStart } } }),
    prisma.delivery_logs.aggregate({ where: { user_id: userId }, _avg: { time_ms: true } }),
    prisma.delivery_logs.findFirst({
      where: { user_id: userId },
      orderBy: { sent_at: "desc" },
      select: { sent_at: true },
    }),
  ]);

  return {
    total,
    success,
    failed,
    today,
    todaySuccess,
    todayFailed,
    avgResponseMs: aggTime._avg.time_ms ?? null,
    lastActivityAt: lastLog?.sent_at ?? null,
  };
}

// ─────────────────────────────────────────────
// Ambil log terbaru untuk recent activity dashboard
// ─────────────────────────────────────────────
export interface RecentLog {
  id: string;
  method: string;
  resource_type: string;
  status_code: number;
  status: string;
  time_ms: number;
  sent_at: Date;
}

export async function getRecentLogs(userId: string, limit = 6): Promise<RecentLog[]> {
  return prisma.delivery_logs.findMany({
    where: { user_id: userId },
    orderBy: { sent_at: "desc" },
    take: limit,
    select: {
      id: true,
      method: true,
      resource_type: true,
      status_code: true,
      status: true,
      time_ms: true,
      sent_at: true,
    },
  });
}
