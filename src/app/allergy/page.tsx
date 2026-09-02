/**
 * app/allergy/page.tsx
 *
 * Halaman modul AllergyIntolerance.
 * Struktur dan pola konsisten dengan:
 *   - app/careplan/page.tsx
 *   - app/clinical-impression/page.tsx
 *
 * Terdiri dari:
 *   1. Page header (ikon, judul, FHIR badge, env badge)
 *   2. Method tabs (GET, POST, PUT, PATCH)
 *   3. Info bar — judul + deskripsi + endpoint method aktif
 *   4. Request panel (form) + Response panel (viewer) — grid 2 kolom di xl
 *   5. Tabel log pengiriman per resource type
 */

"use client";

import { useRef, useState } from "react";

import DashboardLayout from "@/app/components/layout/DashboardLayout";
import ApiMethodTabs from "@/app/components/modules/ApiMethodTabs";
import AllergyIntoleranceForm from "@/app/components/modules/allergy-intolerance/AllergyIntoleranceForm";
import ResponseViewer from "@/app/components/ui/ResponseViewer";
import DeliveryLogTable from "@/app/components/ui/DeliveryLogTable";
import ModuleSyncPanel from "@/app/components/ihs/ModuleSyncPanel";
import { useApiRequest } from "@/app/lib/hooks/useApiRequest";
import type { HttpMethod } from "@/app/lib/types/api";
import type { AllergyIntolerancePayload } from "@/app/lib/types/fhir";

// ─────────────────────────────────────────────
// Konstanta: info per method
// ─────────────────────────────────────────────

/**
 * Deskripsi, warna aksen, dan endpoint untuk setiap HTTP method
 * yang tersedia di modul AllergyIntolerance.
 */
const METHOD_INFO: Partial<
  Record<
    HttpMethod,
    { title: string; desc: string; color: string; endpoint: string }
  >
> = {
  POST: {
    title: "Catat Alergi Baru",
    desc: "Tambahkan data alergi atau intoleransi pasien ke Satu Sehat.",
    color: "teal",
    endpoint: "POST /AllergyIntolerance",
  },
  GET: {
    title: "Ambil Data Alergi",
    desc: "Ambil data alergi berdasarkan ID atau parameter filter.",
    color: "blue",
    endpoint: "GET /AllergyIntolerance",
  },
  PUT: {
    title: "Perbarui Alergi (Penuh)",
    desc: "Timpa seluruh resource AllergyIntolerance yang sudah ada.",
    color: "amber",
    endpoint: "PUT /AllergyIntolerance/:id",
  },
  PATCH: {
    title: "Perbarui Alergi (Sebagian)",
    desc: "Perbarui sebagian field AllergyIntolerance.",
    color: "violet",
    endpoint: "PATCH /AllergyIntolerance/:id",
  },
};

/**
 * Kelas Tailwind untuk info bar per warna method.
 * Didefinisikan eksplisit agar tidak terpotong oleh PurgeCSS
 * (Tailwind tidak bisa mendeteksi kelas yang dibangun secara dinamis).
 */
const INFO_BAR_COLOR: Record<string, string> = {
  teal: "bg-teal-50 border-teal-100 text-teal-800",
  blue: "bg-blue-50 border-blue-100 text-blue-800",
  amber: "bg-amber-50 border-amber-100 text-amber-800",
  violet: "bg-violet-50 border-violet-100 text-violet-800",
};

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

/** Method yang tersedia untuk modul AllergyIntolerance */
const AVAILABLE_METHODS: HttpMethod[] = ["POST", "GET", "PUT", "PATCH"];

export default function AllergyIntolerancePage() {
  const [activeMethod, setActiveMethod] = useState<HttpMethod>("POST");
  const [autofillRaw, setAutofillRaw] = useState<{
    json: string;
    nonce: number;
  } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<{ module: string; key: string } | null>(null);

  /**
   * useApiRequest mengelola state loading/response dan
   * mengirim request ke internal API Route `/api/fhir/AllergyIntolerance`.
   * Token Satu Sehat ditambahkan server-side di API Route — tidak pernah ke browser.
   */
  const { apiResponse, sendRequest, resetResponse } = useApiRequest({
    resourceType: "AllergyIntolerance",
  });

  /** Ganti method aktif dan bersihkan response sebelumnya */
  const handleMethodChange = (method: HttpMethod) => {
    setActiveMethod(method);
    resetResponse();
  };

  // Autofill payload dari panel SIMGOS → mode POST + Raw JSON, lalu scroll ke form.
  const handleUsePayload = (
    payload: unknown,
    _resourceType?: string,
    source?: { module: string; key: string },
  ) => {
    sourceRef.current = source ?? null;
    setActiveMethod("POST");
    resetResponse();
    setAutofillRaw({ json: JSON.stringify(payload, null, 2), nonce: Date.now() });
    setTimeout(
      () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      60,
    );
  };

  /**
   * Diteruskan ke AllergyIntoleranceForm sebagai callback.
   * Form yang menentukan payload, resourceId, atau queryParams
   * sesuai method yang aktif.
   */
  const handleSubmit = async (params: {
    payload?: AllergyIntolerancePayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => {
    await sendRequest({
      method: activeMethod,
      payload: params.payload,
      resourceId: params.resourceId,
      queryParams:
        (activeMethod === "POST" || activeMethod === "GET") && sourceRef.current
          ? {
              ...params.queryParams,
              module: sourceRef.current.module,
              key: sourceRef.current.key,
            }
          : params.queryParams,
    });
  };

  const info = METHOD_INFO[activeMethod];

  return (
    <DashboardLayout
      title="AllergyIntolerance"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "AllergyIntolerance" },
      ]}
    >
      <div className="space-y-6">
        {/* ── 1. Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Ikon modul — warna kuning/amber sesuai visual "alergi/peringatan" */}
            <div className="w-11 h-11 rounded-2xl bg-linear-to-br from-amber-100 to-yellow-100 border border-amber-200 flex items-center justify-center text-2xl shrink-0 shadow-sm">
              ⚠️
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">
                  AllergyIntolerance
                </h1>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                  FHIR R4
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Alergi & intoleransi pasien — Satu Sehat Integration
              </p>
            </div>
          </div>

          {/* Environment badge */}
          <span className="shrink-0 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-medium w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Development
          </span>
        </div>

        {/* ── SIMGOS: status kirim (read-only) — highlight "Menunggu Encounter" ── */}
        <ModuleSyncPanel
          module="allergy"
          title="Data Alergi di SIMGOS"
          onUsePayload={handleUsePayload}
        />

        {/* ── 2. Method Tabs ── */}
        <ApiMethodTabs
          methods={AVAILABLE_METHODS}
          activeMethod={activeMethod}
          onChange={handleMethodChange}
        />

        {/* ── 3. Info Bar ── */}
        {info && (
          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl border ${
              INFO_BAR_COLOR[info.color]
            }`}
          >
            <div>
              <p className="text-sm font-semibold">{info.title}</p>
              <p className="text-xs opacity-70 mt-0.5">{info.desc}</p>
            </div>
            <code className="hidden sm:block text-[11px] font-mono bg-white/60 px-2.5 py-1.5 rounded-xl border border-current/10 whitespace-nowrap shrink-0">
              {info.endpoint}
            </code>
          </div>
        )}

        {/* ── 4. Request + Response Panel ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Form panel */}
          <div
            ref={formRef}
            className="scroll-mt-20 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 overflow-y-auto max-h-[72vh]"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Request
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            <AllergyIntoleranceForm
              method={activeMethod}
              loading={apiResponse.loading}
              onSubmit={handleSubmit}
              autofillRaw={autofillRaw}
            />
          </div>

          {/* Response panel */}
          <div className="h-[72vh]">
            <ResponseViewer response={apiResponse} />
          </div>
        </div>

        {/* ── 5. Log Pengiriman ── */}
        {/*
          DeliveryLogTable mem-filter log hanya untuk resourceType "AllergyIntolerance".
          Setelah DAL dan DB diimplementasikan, data log akan datang dari database
          via API Route — bukan state lokal.
        */}
        <DeliveryLogTable resourceType="AllergyIntolerance" />
      </div>
    </DashboardLayout>
  );
}
