/**
 * components/modules/composition/CompositionForm.tsx
 *
 * Form untuk resource Composition (Resume Medis / discharge summary).
 * Composition adalah dokumen FHIR yang kompleks (section bertingkat), sehingga
 * alur utamanya adalah AUTOFILL dari panel SIMGOS → Raw JSON. Form menyediakan:
 *   - GET  : parameter pencarian (id / subject / status)
 *   - POST/PUT/PATCH : editor Raw JSON (terisi dari autofill panel)
 *
 * Pola visual konsisten dengan ClinicalImpressionForm.tsx.
 */

"use client";

import { useEffect, useState } from "react";

import type { CompositionPayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse } from "@/app/lib/utils/security";

type AutofillRaw = { json: string; nonce: number } | null;

/**
 * Contoh payload Composition — dari koleksi Postman resmi Satu Sehat
 * ("00. FHIR Resource - Contoh Penggunaan" → Composition - Edukasi Diet).
 * Dipakai sebagai template awal editor Raw JSON (POST/PUT); di-override oleh
 * autofill dari panel SIMGOS. Ganti nilai referensi (Patient/Encounter/…).
 */
const EXAMPLE_COMPOSITION = JSON.stringify(
  {
    resourceType: "Composition",
    identifier: {
      system: "http://sys-ids.kemkes.go.id/composition/ORG_ID",
      value: "P20240001",
    },
    status: "final",
    type: {
      coding: [
        { system: "http://loinc.org", code: "18842-5", display: "Discharge summary" },
      ],
    },
    category: [
      {
        coding: [
          { system: "http://loinc.org", code: "LP173421-1", display: "Report" },
        ],
      },
    ],
    subject: { reference: "Patient/PXXXXXXXXXX", display: "Nama Pasien" },
    encounter: { reference: "Encounter/ENCOUNTER_UUID", display: "Kunjungan pasien" },
    date: "2024-01-01",
    author: [{ reference: "Practitioner/NXXXXXXXXX", display: "Nama Dokter" }],
    title: "Resume Medis Rawat Jalan",
    custodian: { reference: "Organization/ORG_ID" },
    section: [
      {
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "42344-2",
              display: "Discharge diet (narrative)",
            },
          ],
        },
        text: { status: "additional", div: "Rekomendasi diet rendah lemak" },
      },
    ],
  },
  null,
  2,
);

/** Contoh body PATCH — JSON Patch (RFC 6902), BUKAN resource Composition. */
const EXAMPLE_PATCH = JSON.stringify(
  [{ op: "replace", path: "/status", value: "amended" }],
  null,
  2,
);

interface CompositionFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: CompositionPayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
  autofillRaw?: AutofillRaw;
}

// ── Shared UI ──────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-100" />
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
          {title}
        </span>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-baseline gap-1.5 text-[12px] font-semibold text-slate-600">
        {label}
        {hint && (
          <span className="text-slate-400 font-normal text-[11px]">— {hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}

function RefPrefix({ label }: { label: string }) {
  return (
    <span className="flex items-center px-2.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-[11px] text-slate-400 font-mono whitespace-nowrap">
      {label}
    </span>
  );
}

const inputBase =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 transition-all duration-150";

const SUBMIT_COLOR: Partial<Record<HttpMethod, string>> = {
  GET: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200",
  POST: "bg-teal-600 hover:bg-teal-700 text-white shadow-sm shadow-teal-200",
  PUT: "bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-200",
  PATCH: "bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-200",
};

function SubmitButton({ method, loading }: { method: HttpMethod; loading: boolean }) {
  const colorCls = loading
    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
    : (SUBMIT_COLOR[method] ?? "bg-slate-600 hover:bg-slate-700 text-white");
  return (
    <button
      type="submit"
      disabled={loading}
      className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${colorCls}`}
    >
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Mengirim...
        </>
      ) : (
        <>
          <span className="font-mono font-bold text-xs">{method}</span>
          <span>/Composition</span>
        </>
      )}
    </button>
  );
}

// ── GET form ───────────────────────────────────────────────
function GetForm({
  loading,
  onSubmit,
}: {
  loading: boolean;
  onSubmit: (params: {
    resourceId?: string;
    queryParams: Record<string, string | undefined>;
  }) => void;
}) {
  const [compositionId, setCompositionId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [status, setStatus] = useState("");

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      resourceId: compositionId.trim() || undefined,
      queryParams: {
        status: status || undefined,
        subject: patientId.trim() ? `Patient/${patientId.trim()}` : undefined,
      },
    });
  };

  return (
    <form onSubmit={handle} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field label="ID Composition" hint="Opsional — kosongkan untuk list">
          <input
            value={compositionId}
            onChange={(e) => setCompositionId(e.target.value)}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${inputBase} font-mono`}
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputBase}
            >
              <option value="">Semua status</option>
              <option value="preliminary">Preliminary</option>
              <option value="final">Final</option>
              <option value="amended">Amended</option>
              <option value="entered-in-error">Entered in Error</option>
            </select>
          </Field>
          <Field label="Patient ID">
            <div className="flex">
              <RefPrefix label="Patient/" />
              <input
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                type="text"
                placeholder="id pasien"
                className={`${inputBase} rounded-l-none border-l-0 font-mono`}
                autoComplete="off"
              />
            </div>
          </Field>
        </div>
      </Section>
      <SubmitButton method="GET" loading={loading} />
    </form>
  );
}

// ── Mutation form (Raw JSON) ───────────────────────────────
function MutationForm({
  method,
  loading,
  onSubmit,
  autofillRaw,
}: {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: { payload: CompositionPayload; resourceId?: string }) => void;
  autofillRaw?: AutofillRaw;
}) {
  // Seed template contoh (dari Postman resmi). PATCH = JSON Patch array.
  const [rawJson, setRawJson] = useState(
    method === "PATCH" ? EXAMPLE_PATCH : EXAMPLE_COMPOSITION,
  );
  const [rawError, setRawError] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState("");

  useEffect(() => {
    if (autofillRaw && autofillRaw.json) {
      setRawJson(autofillRaw.json);
      setRawError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofillRaw?.nonce]);

  // Ganti template contoh saat pindah ke/dari PATCH — HANYA bila belum diedit
  // (rawJson masih sama persis dgn contoh lain), agar tak menimpa isian user.
  useEffect(() => {
    setRawJson((cur) => {
      if (method === "PATCH" && cur === EXAMPLE_COMPOSITION) return EXAMPLE_PATCH;
      if (method !== "PATCH" && cur === EXAMPLE_PATCH) return EXAMPLE_COMPOSITION;
      return cur;
    });
  }, [method]);

  const needsId = method === "PUT" || method === "PATCH";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = safeJsonParse(rawJson);
    if (!parsed) {
      setRawError("JSON tidak valid. Periksa format payload Anda.");
      return;
    }
    if (needsId && !resourceId.trim()) {
      setRawError("ID Composition wajib diisi untuk PUT/PATCH.");
      return;
    }
    setRawError(null);
    onSubmit({
      payload: parsed as CompositionPayload,
      resourceId: needsId ? resourceId.trim() : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {needsId && (
        <Section title="Identifikasi">
          <Field label="ID Composition">
            <input
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              type="text"
              placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
              className={`${inputBase} font-mono`}
              autoComplete="off"
            />
          </Field>
        </Section>
      )}

      <div className="space-y-2">
        <span className="text-xs text-slate-500 font-medium">Raw JSON Payload</span>
        <p className="text-[11px] text-slate-400">
          Gunakan tombol <span className="font-semibold">Autofill</span> pada baris
          di panel SIMGOS untuk mengisi payload Composition, lalu kirim.
        </p>
        <textarea
          value={rawJson}
          onChange={(e) => {
            setRawJson(e.target.value);
            setRawError(null);
          }}
          rows={18}
          placeholder='{"resourceType": "Composition", ...}'
          className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
            rawError
              ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
              : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
          }`}
          spellCheck={false}
          aria-label="Raw JSON payload Composition"
        />
        {rawError && (
          <p className="text-[11px] text-red-600" role="alert">
            {rawError}
          </p>
        )}
      </div>

      <SubmitButton method={method} loading={loading} />
    </form>
  );
}

// ── Komponen utama ─────────────────────────────────────────
export default function CompositionForm({
  method,
  loading,
  onSubmit,
  autofillRaw,
}: CompositionFormProps) {
  if (method === "GET") {
    return <GetForm loading={loading} onSubmit={(params) => onSubmit(params)} />;
  }
  return (
    <MutationForm
      method={method}
      loading={loading}
      onSubmit={(params) => onSubmit(params)}
      autofillRaw={autofillRaw}
    />
  );
}
