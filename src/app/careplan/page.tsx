"use client";

import { useState } from "react";

import DashboardLayout from "@/app/components/layout/DashboardLayout";
import ApiMethodTabs from "@/app/components/modules/ApiMethodTabs";
import CarePlanForm from "@/app/components/modules/careplan/CarePlanForm";
import ResponseViewer from "@/app/components/ui/ResponseViewer";
import DeliveryLogTable from "../components/ui/DeliveryLogTable";
import { useApiRequest } from "@/app/lib/hooks/useApiRequest";
import type { HttpMethod } from "@/app/lib/types/api";
import type { CarePlanPayload } from "@/app/lib/types/fhir";

const METHOD_INFO: Record<
  HttpMethod,
  { title: string; desc: string; color: string }
> = {
  POST: {
    title: "Buat CarePlan Baru",
    desc: "Kirim resource CarePlan baru ke Satu Sehat.",
    color: "teal",
  },
  GET: {
    title: "Ambil Data CarePlan",
    desc: "Cari atau ambil CarePlan berdasarkan ID / parameter.",
    color: "blue",
  },
  PUT: {
    title: "Perbarui CarePlan (Penuh)",
    desc: "Timpa seluruh resource CarePlan yang sudah ada.",
    color: "amber",
  },
  PATCH: {
    title: "Perbarui CarePlan (Sebagian)",
    desc: "Perbarui sebagian field CarePlan.",
    color: "violet",
  },
  DELETE: {
    title: "Hapus CarePlan",
    desc: "Hapus resource CarePlan.",
    color: "red",
  },
};

const INFO_COLORS: Record<string, string> = {
  teal: "bg-teal-50 border-teal-100 text-teal-800",
  blue: "bg-blue-50 border-blue-100 text-blue-800",
  amber: "bg-amber-50 border-amber-100 text-amber-800",
  violet: "bg-violet-50 border-violet-100 text-violet-800",
  red: "bg-red-50 border-red-100 text-red-800",
};

export default function CarePlanPage() {
  const [activeMethod, setActiveMethod] = useState<HttpMethod>("POST");
  const { apiResponse, sendRequest, resetResponse } = useApiRequest({
    resourceType: "CarePlan",
  });

  const handleMethodChange = (method: HttpMethod) => {
    setActiveMethod(method);
    resetResponse();
  };

  const handleSubmit = async (params: {
    payload?: CarePlanPayload;
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
      title="CarePlan"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "CarePlan" },
      ]}
    >
      <div className="space-y-6">
        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-linear-to-br from-teal-100 to-emerald-100 border border-teal-200 flex items-center justify-center text-2xl shrink-0 shadow-sm">
              📋
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">CarePlan</h1>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-teal-100 text-teal-700">
                  FHIR R4
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Manajemen rencana perawatan pasien — Satu Sehat Integration
              </p>
            </div>
          </div>

          {/* Env badge */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Development
            </span>
          </div>
        </div>

        {/* ── Method Tabs ── */}
        <ApiMethodTabs
          methods={["POST", "GET", "PUT", "PATCH"]}
          activeMethod={activeMethod}
          onChange={handleMethodChange}
        />

        {/* ── Method Info Bar ── */}
        <div
          className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${INFO_COLORS[info.color]}`}
        >
          <div>
            <p className="text-sm font-semibold">{info.title}</p>
            <p className="text-xs opacity-70 mt-0.5">{info.desc}</p>
          </div>
          <code className="hidden sm:block text-[11px] font-mono bg-white/60 px-2.5 py-1.5 rounded-xl border border-current/10">
            {activeMethod} /CarePlan
          </code>
        </div>

        {/* ── Request + Response Panel ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Form */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 overflow-y-auto max-h-[70vh]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Request
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <CarePlanForm
              method={activeMethod}
              onSubmit={handleSubmit}
              loading={apiResponse.loading}
            />
          </div>

          {/* Response */}
          <div className="h-[70vh]">
            <ResponseViewer response={apiResponse} />
          </div>
        </div>

        {/* ── Delivery Log Table ── */}
        <DeliveryLogTable resourceType="CarePlan" />
      </div>
    </DashboardLayout>
  );
}
