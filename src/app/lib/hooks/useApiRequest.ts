/**
 * lib/hooks/useApiRequest.ts
 *
 * Custom hook untuk mengelola state request API ke internal Next.js API Route.
 *
 * ARSITEKTUR:
 * Hook ini TIDAK fetch langsung ke Satu Sehat API. Semua request melewati
 * internal route `/api/fhir/[resource]` yang bertindak sebagai proxy aman.
 *
 *   Browser (hook ini)
 *     → /api/fhir/[resource]             (Next.js API Route — server-side)
 *       → DAL: validasi + catat ke DB
 *         → Forward ke api-satusehat.kemkes.go.id (dengan server token)
 *           → Response dikembalikan ke browser
 *
 * Keuntungan pola ini:
 * - Client secret & access token TIDAK pernah terekspos ke browser
 * - Audit log tersimpan di DB server-side (bukan sessionStorage)
 * - Rate limiting dan retry bisa diimplementasikan di API Route
 * - Satu titik interceptor untuk semua modul FHIR
 */

"use client";

import { useState, useCallback } from "react";
import type { ApiResponse, HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, buildSafeQueryString } from "@/app/lib/utils/security";
import { createDeliveryLog, saveDeliveryLog } from "@/app/lib/utils/log";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface UseApiRequestOptions {
  /** Nama resource FHIR, e.g. "ClinicalImpression", "CarePlan" */
  resourceType: string;
}

export interface SendRequestParams {
  method: HttpMethod;
  /** Body payload — hanya untuk POST, PUT, PATCH */
  payload?: unknown;
  /** ID resource — untuk GET by ID, PUT, PATCH */
  resourceId?: string;
  /** Query params — untuk GET dengan filter */
  queryParams?: Record<string, string | undefined>;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Bangun path internal Next.js API Route.
 * Contoh: buildInternalPath("ClinicalImpression", "abc-123")
 *         → "/api/fhir/ClinicalImpression/abc-123"
 *
 * encodeURIComponent memastikan karakter berbahaya tidak lolos ke path.
 */
function buildInternalPath(resourceType: string, resourceId?: string): string {
  const base = `/api/fhir/${encodeURIComponent(resourceType)}`;
  if (resourceId) {
    return `${base}/${encodeURIComponent(resourceId)}`;
  }
  return base;
}

/**
 * Petakan error jaringan ke pesan yang aman untuk ditampilkan ke UI.
 * Stack trace dan detail internal tidak pernah diteruskan ke user.
 */
function mapNetworkError(err: unknown): string {
  if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
    return "Tidak dapat terhubung ke server. Periksa koneksi jaringan Anda.";
  }
  if (err instanceof Error) {
    // Hanya teruskan pesan error validasi internal yang sudah kita control
    const safeMessages = ["tidak diizinkan", "UUID", "Resource type"];
    if (safeMessages.some((m) => err.message.includes(m))) {
      return err.message;
    }
  }
  return "Terjadi kesalahan. Silakan coba lagi.";
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useApiRequest({ resourceType }: UseApiRequestOptions) {
  const [apiResponse, setApiResponse] = useState<ApiResponse>({
    status: null,
    data: null,
    timeMs: null,
    loading: false,
    error: null,
  });

  /**
   * Kirim request ke internal Next.js API Route.
   *
   * API Route bertanggung jawab untuk:
   * - Menambahkan Authorization header (server-side, tidak terekspos ke browser)
   * - Memvalidasi payload sebelum diteruskan ke Satu Sehat
   * - Menyimpan log ke database via DAL
   * - Forward request ke Satu Sehat dan kembalikan response
   */
  const sendRequest = useCallback(
    async ({ method, payload, resourceId, queryParams }: SendRequestParams) => {
      // Reset state sebelum request baru dimulai
      setApiResponse({
        status: null,
        data: null,
        timeMs: null,
        loading: true,
        error: null,
      });

      const startTime = performance.now();

      try {
        // 1. Bangun URL internal — bukan URL Satu Sehat langsung
        const path = buildInternalPath(resourceType, resourceId);
        const qs = queryParams ? buildSafeQueryString(queryParams) : "";
        const url = `${path}${qs}`;

        // 2. Fetch ke internal API Route
        //    credentials: "same-origin" — agar cookie sesi Next.js ikut (untuk auth internal jika diperlukan)
        //    Token Satu Sehat ditambahkan di server oleh API Route, bukan di sini
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body:
            method !== "GET" && payload ? JSON.stringify(payload) : undefined,
          credentials: "same-origin",
          redirect: "error",
        });

        const elapsed = Math.round(performance.now() - startTime);

        // 3. Parse response — API Route selalu mengembalikan JSON
        const rawText = await res.text();
        const data = safeJsonParse(rawText) ?? { raw: rawText };

        setApiResponse({
          status: res.status,
          data,
          timeMs: elapsed,
          loading: false,
          error: null,
        });

        // Simpan log ke sessionStorage agar DeliveryLogTable bisa menampilkannya
        saveDeliveryLog(
          createDeliveryLog({
            method,
            endpoint: url,
            statusCode: res.status,
            payload: payload ?? null,
            response: data,
            timeMs: elapsed,
            resourceType,
            resourceId,
          }),
        );
      } catch (err: unknown) {
        const elapsed = Math.round(performance.now() - startTime);

        setApiResponse({
          status: null,
          data: null,
          timeMs: elapsed,
          loading: false,
          error: mapNetworkError(err),
        });
      }
    },
    [resourceType],
  );

  /** Reset state response ke kondisi awal (dipanggil saat ganti method tab) */
  const resetResponse = useCallback(() => {
    setApiResponse({
      status: null,
      data: null,
      timeMs: null,
      loading: false,
      error: null,
    });
  }, []);

  return { apiResponse, sendRequest, resetResponse };
}
