/**
 * app/medication/page.tsx
 *
 * Halaman modul Medication (definisi obat / KFA).
 * Struktur konsisten dengan modul lain. Medication bersifat DEFINITIONAL —
 * tidak terikat pasien/kunjungan (tidak ada "Menunggu Encounter").
 *
 * Alur:
 *   1. Panel SIMGOS (read-only, filter tanggal, autofill) — tabel `medication`.
 *   2. Autofill payload dari panel → form (Raw JSON) untuk POST manual.
 */

"use client";

import { useRef, useState } from "react";

import DashboardLayout from "@/app/components/layout/DashboardLayout";
import ApiMethodTabs from "@/app/components/modules/ApiMethodTabs";
import MedicationForm from "@/app/components/modules/medication/MedicationForm";
import ResponseViewer from "@/app/components/ui/ResponseViewer";
import DeliveryLogTable from "@/app/components/ui/DeliveryLogTable";
import ModuleSyncPanel from "@/app/components/ihs/ModuleSyncPanel";
import { useApiRequest } from "@/app/lib/hooks/useApiRequest";
import type { HttpMethod } from "@/app/lib/types/api";
import type { MedicationPayload } from "@/app/lib/types/fhir";

const METHOD_INFO: Partial<
  Record<
    HttpMethod,
    { title: string; desc: string; color: string; endpoint: string }
  >
> = {
  POST: {
    title: "Daftarkan Obat (KFA)",
    desc: "Kirim definisi Medication (KFA) ke Satu Sehat.",
    color: "emerald",
    endpoint: "POST /Medication",
  },
  GET: {
    title: "Ambil Data Obat",
    desc: "Ambil Medication berdasarkan ID.",
    color: "blue",
    endpoint: "GET /Medication/:id",
  },
  PUT: {
    title: "Perbarui Obat (Penuh)",
    desc: "Timpa seluruh resource Medication yang sudah ada.",
    color: "amber",
    endpoint: "PUT /Medication/:id",
  },
  PATCH: {
    title: "Perbarui Obat (Sebagian)",
    desc: "Perbarui sebagian field Medication (mis. status).",
    color: "violet",
    endpoint: "PATCH /Medication/:id",
  },
};

const INFO_BAR_COLOR: Record<string, string> = {
  emerald: "bg-emerald-50 border-emerald-100 text-emerald-800",
  blue: "bg-blue-50 border-blue-100 text-blue-800",
  amber: "bg-amber-50 border-amber-100 text-amber-800",
  violet: "bg-violet-50 border-violet-100 text-violet-800",
};

const AVAILABLE_METHODS: HttpMethod[] = ["POST", "GET", "PUT", "PATCH"];

export default function MedicationPage() {
  const [activeMethod, setActiveMethod] = useState<HttpMethod>("POST");
  const [autofillRaw, setAutofillRaw] = useState<{
    json: string;
    nonce: number;
  } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<{ module: string; key: string } | null>(null);

  const { apiResponse, sendRequest, resetResponse } = useApiRequest({
    resourceType: "Medication",
  });

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

  const handleSubmit = async (params: {
    payload?: MedicationPayload;
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
      title="Medication"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Medication" },
      ]}
    >
      <div className="space-y-6">
        {/* ── 1. Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-linear-to-br from-emerald-100 to-teal-100 border border-emerald-200 flex items-center justify-center text-2xl shrink-0 shadow-sm">
              💊
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">Medication</h1>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  FHIR R4
                </span>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500 font-mono">
                  KFA
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Definisi obat (Kamus Farmasi Alkes) — Satu Sehat Integration
              </p>
            </div>
          </div>

          <span className="shrink-0 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-medium w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Development
          </span>
        </div>

        {/* ── SIMGOS: status kirim (read-only, filter tanggal, autofill) ── */}
        <ModuleSyncPanel
          module="medication"
          title="Data Medication di SIMGOS"
          onUsePayload={handleUsePayload}
          defaultOpen
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

            <MedicationForm
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
        <DeliveryLogTable resourceType="Medication" />
      </div>
    </DashboardLayout>
  );
}
