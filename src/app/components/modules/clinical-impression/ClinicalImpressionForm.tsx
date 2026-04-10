/**
 * components/modules/clinical-impression/ClinicalImpressionForm.tsx
 *
 * Form input untuk resource ClinicalImpression.
 * Mendukung dua mode:
 *   - Form: field-by-field dengan validasi Yup + react-hook-form
 *   - Raw JSON: edit payload langsung (parse + validasi saat submit)
 *
 * Pola komponen ini konsisten dengan CarePlanForm.tsx.
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useState } from "react";

import {
  clinicalImpressionFormSchema,
  clinicalImpressionGetSchema,
  type ClinicalImpressionFormValues,
  type ClinicalImpressionGetValues,
} from "@/app/lib/schemas/clinical-impression.schema";
import type { ClinicalImpressionPayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface ClinicalImpressionFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: ClinicalImpressionPayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
}

// ─────────────────────────────────────────────
// Shared UI: Field wrapper dengan label + error
// ─────────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, required, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-baseline gap-1.5 text-[12px] font-semibold text-slate-600">
        {label}
        {required && (
          <span className="text-red-400 font-bold" aria-hidden="true">
            *
          </span>
        )}
        {hint && (
          <span className="text-slate-400 font-normal text-[11px]">
            — {hint}
          </span>
        )}
      </label>
      {children}
      {error && (
        <p
          className="flex items-center gap-1 text-[11px] text-red-600"
          role="alert"
        >
          <ErrorIcon />
          {error}
        </p>
      )}
    </div>
  );
}

/** Divider dengan label section di tengah */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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

/** Ikon error kecil — SVG inline agar tidak butuh library ikon */
function ErrorIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      fill="none"
      className="shrink-0"
    >
      <circle
        cx="5.5"
        cy="5.5"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5.5 3.5V5.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="5.5" cy="7.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

// ─────────────────────────────────────────────
// Input class helpers
// ─────────────────────────────────────────────

const inputBase =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 transition-all duration-150";

const inputErr =
  "w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-300/40 focus:border-red-400 transition-all duration-150";

function cls(hasError: boolean) {
  return hasError ? inputErr : inputBase;
}

/** Prefix monospace untuk field referensi (Patient/, Encounter/, dll.) */
function RefPrefix({ label }: { label: string }) {
  return (
    <span className="flex items-center px-2.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-[11px] text-slate-400 font-mono whitespace-nowrap">
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────
// Submit button
// ─────────────────────────────────────────────

const SUBMIT_COLOR: Partial<Record<HttpMethod, string>> = {
  GET: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200",
  POST: "bg-teal-600 hover:bg-teal-700 text-white shadow-sm shadow-teal-200",
  PUT: "bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-200",
  PATCH:
    "bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-200",
};

interface SubmitButtonProps {
  method: HttpMethod;
  loading: boolean;
  label?: string;
}

function SubmitButton({ method, loading, label }: SubmitButtonProps) {
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
          <span>{label ?? "/ClinicalImpression"}</span>
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// GET form — hanya parameter query
// ─────────────────────────────────────────────

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
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClinicalImpressionGetValues>({
    resolver: yupResolver(
      clinicalImpressionGetSchema,
    ) as unknown as Resolver<ClinicalImpressionGetValues>,
  });

  const onValid = (data: ClinicalImpressionGetValues) => {
    onSubmit({
      resourceId: data.clinicalImpressionId || undefined,
      queryParams: {
        status: data.status || undefined,
        // Prefix "Patient/" ditambahkan di sini agar query string sesuai spec FHIR
        subject: data.patientId ? `Patient/${data.patientId}` : undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID ClinicalImpression"
          hint="Opsional — kosongkan untuk list"
          error={errors.clinicalImpressionId?.message}
        >
          <input
            {...register("clinicalImpressionId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${cls(!!errors.clinicalImpressionId)} font-mono`}
            autoComplete="off"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Status" error={errors.status?.message}>
            <select {...register("status")} className={cls(!!errors.status)}>
              <option value="">Semua status</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="entered-in-error">Entered in Error</option>
            </select>
          </Field>

          <Field label="Patient ID" error={errors.patientId?.message}>
            <input
              {...register("patientId")}
              type="text"
              placeholder="UUID pasien"
              className={`${cls(!!errors.patientId)} font-mono`}
              autoComplete="off"
            />
          </Field>
        </div>
      </Section>

      <SubmitButton
        method="GET"
        loading={loading}
        label="/ClinicalImpression"
      />
    </form>
  );
}

// ─────────────────────────────────────────────
// Mutation form — POST / PUT / PATCH
// ─────────────────────────────────────────────

function MutationForm({
  method,
  loading,
  onSubmit,
}: {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload: ClinicalImpressionPayload;
    resourceId?: string;
  }) => void;
}) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

  const needsId = method === "PUT" || method === "PATCH";

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ClinicalImpressionFormValues>({
    resolver: yupResolver(
      clinicalImpressionFormSchema,
    ) as unknown as Resolver<ClinicalImpressionFormValues>,
    defaultValues: {
      status: "completed",
      codeSnomed: "312850006",
      codeDisplay: "History of disorder",
      patientId: "",
      patientName: "",
      encounterId: "",
      practitionerId: "",
      effectiveDateTime: new Date().toISOString().slice(0, 16),
      date: new Date().toISOString().slice(0, 16),
      summary:
        "Pasien datang dengan keluhan utama demam menggigil disertai sakit kepala. Pasien memiliki riwayat diabetes mellitus tipe 2 dan dahulu pasien pernah menderita asma.",
      clinicalImpressionId: "",
    },
  });

  /** Bangun payload FHIR dari nilai form yang sudah tervalidasi */
  const buildPayload = (
    data: ClinicalImpressionFormValues,
  ): ClinicalImpressionPayload => ({
    resourceType: "ClinicalImpression",
    status: data.status as ClinicalImpressionPayload["status"],
    code: {
      coding: [
        {
          system: "http://snomed.info/sct",
          code: data.codeSnomed,
          display: data.codeDisplay,
        },
      ],
    },
    subject: {
      reference: `Patient/${data.patientId}`,
      display: data.patientName,
    },
    encounter: {
      reference: `Encounter/${data.encounterId}`,
    },
    effectiveDateTime: new Date(data.effectiveDateTime).toISOString(),
    date: new Date(data.date).toISOString(),
    assessor: {
      reference: `Practitioner/${data.practitionerId}`,
    },
    summary: data.summary || undefined,
  });

  const onValidForm = (data: ClinicalImpressionFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.clinicalImpressionId || undefined : undefined,
    });
  };

  /** Submit dari mode Raw JSON */
  const handleRawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = safeJsonParse(rawJson);
    if (!parsed) {
      setRawError("JSON tidak valid. Periksa format payload Anda.");
      return;
    }
    setRawError(null);
    onSubmit({ payload: parsed as ClinicalImpressionPayload });
  };

  /** Sinkronisasi nilai form ke textarea Raw JSON */
  const syncRaw = () => {
    const values = getValues();
    // Bangun payload dari nilai form saat ini (belum tervalidasi — hanya untuk preview)
    const preview: Partial<ClinicalImpressionPayload> = {
      resourceType: "ClinicalImpression",
      status: values.status as ClinicalImpressionPayload["status"],
      code: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: values.codeSnomed,
            display: values.codeDisplay,
          },
        ],
      },
      subject: {
        reference: `Patient/${values.patientId}`,
        display: values.patientName,
      },
      encounter: { reference: `Encounter/${values.encounterId}` },
      effectiveDateTime: values.effectiveDateTime,
      date: values.date,
      assessor: { reference: `Practitioner/${values.practitionerId}` },
      summary: values.summary,
    };
    setRawJson(safeJsonStringify(preview));
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(["form", "raw"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === m
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {m === "form" ? "🧩 Form" : "{ } Raw JSON"}
          </button>
        ))}
      </div>

      {/* ── Form mode ── */}
      {mode === "form" && (
        <form
          onSubmit={handleSubmit(onValidForm)}
          noValidate
          className="space-y-4"
        >
          {/* ID resource — hanya untuk PUT/PATCH */}
          {needsId && (
            <Section title="Identifikasi">
              <Field
                label="ID ClinicalImpression"
                required
                error={errors.clinicalImpressionId?.message}
              >
                <input
                  {...register("clinicalImpressionId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${cls(!!errors.clinicalImpressionId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          {/* Status & Kode */}
          <Section title="Status & Kode Klinis">
            <Field label="Status" required error={errors.status?.message}>
              <select {...register("status")} className={cls(!!errors.status)}>
                <option value="completed">Completed</option>
                <option value="in-progress">In Progress</option>
                <option value="entered-in-error">Entered in Error</option>
              </select>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Kode SNOMED"
                required
                error={errors.codeSnomed?.message}
              >
                <input
                  {...register("codeSnomed")}
                  type="text"
                  placeholder="312850006"
                  className={`${cls(!!errors.codeSnomed)} font-mono`}
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Display Kode"
                required
                error={errors.codeDisplay?.message}
              >
                <input
                  {...register("codeDisplay")}
                  type="text"
                  placeholder="History of disorder"
                  className={cls(!!errors.codeDisplay)}
                />
              </Field>
            </div>
          </Section>

          {/* Tanggal */}
          <Section title="Waktu Penilaian">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Tanggal Efektif"
                required
                hint="effectiveDateTime"
                error={errors.effectiveDateTime?.message}
              >
                <input
                  {...register("effectiveDateTime")}
                  type="datetime-local"
                  className={cls(!!errors.effectiveDateTime)}
                />
              </Field>

              <Field
                label="Tanggal Dicatat"
                required
                hint="date"
                error={errors.date?.message}
              >
                <input
                  {...register("date")}
                  type="datetime-local"
                  className={cls(!!errors.date)}
                />
              </Field>
            </div>
          </Section>

          {/* Referensi */}
          <Section title="Referensi">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Patient ID"
                required
                error={errors.patientId?.message}
              >
                <div className="flex">
                  <RefPrefix label="Patient/" />
                  <input
                    {...register("patientId")}
                    type="text"
                    placeholder="UUID"
                    className={`${cls(!!errors.patientId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>

              <Field
                label="Nama Pasien"
                required
                error={errors.patientName?.message}
              >
                <input
                  {...register("patientName")}
                  type="text"
                  placeholder="Nama lengkap pasien"
                  className={cls(!!errors.patientName)}
                />
              </Field>
            </div>

            <Field
              label="Encounter ID"
              required
              error={errors.encounterId?.message}
            >
              <div className="flex">
                <RefPrefix label="Encounter/" />
                <input
                  {...register("encounterId")}
                  type="text"
                  placeholder="UUID"
                  className={`${cls(!!errors.encounterId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>

            <Field
              label="Assessor (Practitioner ID)"
              required
              error={errors.practitionerId?.message}
            >
              <div className="flex">
                <RefPrefix label="Practitioner/" />
                <input
                  {...register("practitionerId")}
                  type="text"
                  placeholder="UUID"
                  className={`${cls(!!errors.practitionerId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>
          </Section>

          {/* Ringkasan klinis */}
          <Section title="Ringkasan Klinis">
            <Field
              label="Summary"
              hint="Opsional — narasi hasil penilaian"
              error={errors.summary?.message}
            >
              <textarea
                {...register("summary")}
                rows={5}
                placeholder="Pasien datang dengan keluhan..."
                className={`${cls(!!errors.summary)} resize-none leading-relaxed`}
              />
              <p className="text-[10px] text-slate-400 text-right">
                Maks. 5000 karakter
              </p>
            </Field>
          </Section>

          <SubmitButton method={method} loading={loading} />
        </form>
      )}

      {/* ── Raw JSON mode ── */}
      {mode === "raw" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              Raw JSON Payload
            </span>
            <button
              type="button"
              onClick={syncRaw}
              className="text-[11px] text-teal-600 hover:text-teal-800 font-medium transition-colors"
            >
              ↩ Sync dari form
            </button>
          </div>

          <form onSubmit={handleRawSubmit} className="space-y-2">
            <textarea
              value={rawJson}
              onChange={(e) => {
                setRawJson(e.target.value);
                setRawError(null);
              }}
              rows={18}
              placeholder='{"resourceType": "ClinicalImpression", ...}'
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
                rawError
                  ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                  : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
              }`}
              spellCheck={false}
              aria-label="Raw JSON payload ClinicalImpression"
            />

            {rawError && (
              <p
                className="flex items-center gap-1 text-[11px] text-red-600"
                role="alert"
              >
                <ErrorIcon />
                {rawError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                loading
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : (SUBMIT_COLOR[method] ??
                    "bg-slate-600 text-white hover:bg-slate-700")
              }`}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Mengirim...
                </>
              ) : (
                <>
                  <span className="font-mono font-bold text-xs">{method}</span>
                  /ClinicalImpression
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Komponen utama — routing ke GET atau Mutation
// ─────────────────────────────────────────────

export default function ClinicalImpressionForm({
  method,
  loading,
  onSubmit,
}: ClinicalImpressionFormProps) {
  if (method === "GET") {
    return (
      <GetForm loading={loading} onSubmit={(params) => onSubmit(params)} />
    );
  }

  return (
    <MutationForm
      method={method}
      loading={loading}
      onSubmit={(params) => onSubmit(params)}
    />
  );
}
