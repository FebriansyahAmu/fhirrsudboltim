// lib/utils/log.ts
// Utilitas untuk manajemen log pengiriman data

import type { DeliveryLog, HttpMethod, SendStatus } from "../types/api";
import { generateLogId } from "./security";

const LOG_STORAGE_KEY = "ss_delivery_logs";
const MAX_LOGS = 100; // Batas maksimal log yang disimpan

/**
 * Simpan log pengiriman ke sessionStorage.
 * Log lama dihapus jika melebihi MAX_LOGS.
 */
export function saveDeliveryLog(log: DeliveryLog): void {
  try {
    const existing = getDeliveryLogs();
    const updated = [log, ...existing].slice(0, MAX_LOGS);
    sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    console.warn("Gagal menyimpan log pengiriman");
  }
}

/**
 * Ambil semua log pengiriman dari sessionStorage.
 */
export function getDeliveryLogs(): DeliveryLog[] {
  try {
    const raw = sessionStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DeliveryLog[];
  } catch {
    return [];
  }
}

/**
 * Hapus semua log pengiriman.
 */
export function clearDeliveryLogs(): void {
  try {
    sessionStorage.removeItem(LOG_STORAGE_KEY);
  } catch {
    // Silent
  }
}

/**
 * Buat objek log baru dari hasil API call.
 */
export function createDeliveryLog(params: {
  method: HttpMethod;
  endpoint: string;
  statusCode: number;
  payload: unknown;
  response: unknown;
  timeMs: number;
  resourceType: string;
  resourceId?: string;
}): DeliveryLog {
  const status: SendStatus =
    params.statusCode >= 200 && params.statusCode < 300 ? "success" : "error";

  return {
    id: generateLogId(),
    method: params.method,
    endpoint: params.endpoint,
    statusCode: params.statusCode,
    status,
    payload: params.payload,
    response: params.response,
    sentAt: new Date().toISOString(),
    timeMs: params.timeMs,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
  };
}

/**
 * Format tanggal ISO ke format lokal Indonesia.
 */
export function formatLogDate(isoString: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

/**
 * Format durasi menjadi string yang mudah dibaca.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
