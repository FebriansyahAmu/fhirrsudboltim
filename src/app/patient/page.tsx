/**
 * app/patient/page.tsx
 *
 * Halaman modul Patient.
 * Struktur dan pola konsisten dengan:
 *   - app/encounter/page.tsx
 *   - app/service-request/page.tsx
 */

"use client";

import { useState } from "react";

import DashboardLayout from "@/app/components/layout/DashboardLayout";
import ApiMethodTabs from "@/app/components/modules/ApiMethodTabs";
import PatientForm from "@/app/components/modules/patient/PatientForm";
import ResponseViewer from "@/app/components/ui/ResponseViewer";
import DeliveryLogTable from "@/app/components/ui/DeliveryLogTable";
import { useApiRequest } from "@/app/lib/hooks/useApiRequest";
import type { HttpMethod } from "@/app/lib/types/api";
import type { PatientPayload } from "@/app/lib/types/fhir";

// ─────────────────────────────────────────────
// Konstanta: info per method
// ─────────────────────────────────────────────

const METHOD_INFO: Partial<
  Record<
    HttpMethod,
    { title: string; desc: string; color: string; endpoint: string }
  >
> = {
  POST: {
    title: "Daftarkan Pasien Baru",
    desc: "Kirim data pasien pertama kali ke Satu Sehat menggunakan NIK.",
    color: "teal",
    endpoint: "POST /Patient",
  },
  GET: {
    title: "Cari Data Pasien",
    desc: "Cari pasien berdasarkan UUID, NIK, atau nama.",
    color: "blue",
    endpoint: "GET /Patient",
  },
  PUT: {
    title: "Perbarui Data Pasien (Penuh)",
    desc: "Timpa seluruh resource Patient yang sudah ada.",
    color: "amber",
    endpoint: "PUT /Patient/:id",
  },
  PATCH: {
    title: "Perbarui Data Pasien (Sebagian)",
    desc: "Perbarui sebagian field data pasien.",
    color: "violet",
    endpoint: "PATCH /Patient/:id",
  },
};

const INFO_BAR_COLOR: Record<string, string> = {
  teal: "bg-teal-50 border-teal-100 text-teal-800",
  blue: "bg-blue-50 border-blue-100 text-blue-800",
  amber: "bg-amber-50 border-amber-100 text-amber-800",
  violet: "bg-violet-50 border-violet-100 text-violet-800",
};

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

const AVAILABLE_METHODS: HttpMethod[] = ["POST", "GET", "PUT", "PATCH"];

export default function PatientPage() {
  const [activeMethod, setActiveMethod] = useState<HttpMethod>("POST");

  const { apiResponse, sendRequest, resetResponse } = useApiRequest({
    resourceType: "Patient",
  });

  const handleMethodChange = (method: HttpMethod) => {
    setActiveMethod(method);
    resetResponse();
  };

  const handleSubmit = async (params: {
    payload?: PatientPayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => {
    await sendRequest({
      method: activeMethod,
      payload: params.payload,
      resourceId: params.resourceId,
      queryParams: params.queryParams,
    });
  };

  const info = METHOD_INFO[activeMethod];

  return (
    <DashboardLayout
      title="Patient"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Patient" },
      ]}
    >
      <div className="space-y-6">
        {/* ── 1. Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-linear-to-br from-sky-100 to-blue-100 border border-sky-200 flex items-center justify-center text-2xl shrink-0 shadow-sm">
              👤
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">Patient</h1>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-sky-100 text-sky-700">
                  FHIR R4
                </span>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                  NIK
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Registrasi & pencarian data pasien — Satu Sehat Integration
              </p>
            </div>
          </div>

          <span className="shrink-0 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-medium w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Development
          </span>
        </div>

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
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 overflow-y-auto max-h-[72vh]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Request
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            <PatientForm
              method={activeMethod}
              loading={apiResponse.loading}
              onSubmit={handleSubmit}
            />
          </div>

          {/* Response panel */}
          <div className="h-[72vh]">
            <ResponseViewer response={apiResponse} />
          </div>
        </div>

        {/* ── 5. Log Pengiriman ── */}
        <DeliveryLogTable resourceType="Patient" />
      </div>
    </DashboardLayout>
  );
}
