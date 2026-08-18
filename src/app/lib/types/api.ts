// lib/types/api.ts
// Tipe-tipe untuk API response, log pengiriman, dan UI state

import type { IconType } from "react-icons";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type SendStatus = "success" | "error" | "pending";

export interface ApiResponse {
  status: number | null;
  data: unknown;
  timeMs: number | null;
  loading: boolean;
  error: string | null;
}

export interface DeliveryLog {
  id: string;
  method: HttpMethod;
  endpoint: string;
  statusCode: number;
  status: SendStatus;
  payload: unknown;
  response: unknown;
  sentAt: string; // ISO string
  timeMs: number;
  resourceType: string;
  resourceId?: string;
}

export interface ModuleInfo {
  name: string;
  path: string;
  icon: IconType;
  desc: string;
  group: ModuleGroup;
  methods: HttpMethod[];
  badge: "Active" | "Beta" | "Soon";
  /** false = halaman belum dibuat, card dinonaktifkan di dashboard */
  hasPage?: boolean;
}

export type ModuleGroup = "Klinis" | "Pasien & Praktisi" | "Obat & Diagnosa" | "Utilitas";

export interface DashboardStats {
  total: number;
  success: number;
  failed: number;
  pending: number;
}
