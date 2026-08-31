/**
 * components/modules/condition/ConditionForm.tsx
 *
 * Form input untuk resource Condition (kondisi/diagnosis).
 * Dua mode: Form (react-hook-form + Yup) & Raw JSON (juga untuk autofill SIMGOS).
 *
 * Catatan:
 *   - `code` boleh ICD-10 (diagnosis) atau SNOMED CT.
 *   - `encounter` WAJIB — Condition dikirim dalam konteks kunjungan.
 *
 * Pola konsisten dengan SpecimenForm.tsx.
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useState } from "react";

import {
  conditionFormSchema,
  conditionGetSchema,
  type ConditionFormValues,
  type ConditionGetValues,
} from "@/app/lib/schemas/condition.schema";
import type { ConditionPayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

/** Payload autofill dari panel SIMGOS (nonce memicu ulang meski JSON sama). */
interface AutofillRaw {
  json: string;
  nonce: number;
}

interface ConditionFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: ConditionPayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
  autofillRaw?: AutofillRaw | null;
}

// ─────────────────────────────────────────────
// Konstanta FHIR
// ─────────────────────────────────────────────

const CLINICAL_DISPLAY: Record<string, string> = {
  active: "Active",
  recurrence: "Recurrence",
  relapse: "Relapse",
  inactive: "Inactive",
  remission: "Remission",
  resolved: "Resolved",
};
const CATEGORY_DISPLAY: Record<string, string> = {
  "encounter-diagnosis": "Encounter Diagnosis",
  "problem-list-item": "Problem List Item",
};
const CODE_SYSTEM_URI: Record<string, string> = {
  "icd-10": "http://hl7.org/fhir/sid/icd-10",
  snomed: "http://snomed.info/sct",
};

// ─────────────────────────────────────────────
// Shared UI primitives
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
          <span className="text-slate-400 font-normal text-[11px]">— {hint}</span>
        )}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-red-600" role="alert">
          <ErrorIcon />
          {error}
        </p>
      )}
    </div>
  );
}

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

function ErrorIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="shrink-0">
      <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 3.5V5.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="5.5" cy="7.5" r="0.5" fill="currentColor" />
    </svg>
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
const inputErr =
  "w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-300/40 focus:border-red-400 transition-all duration-150";
function ic(hasError: boolean) {
  return hasError ? inputErr : inputBase;
}

const SUBMIT_COLOR: Partial<Record<HttpMethod, string>> = {
  GET: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200",
  POST: "bg-teal-600 hover:bg-teal-700 text-white shadow-sm shadow-teal-200",
  PUT: "bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-200",
  PATCH: "bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-200",
};

function SubmitButton({
  method,
  loading,
}: {
  method: HttpMethod;
  loading: boolean;
}) {
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
          <span>/Condition</span>
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// GET form
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
  } = useForm<ConditionGetValues>({
    resolver: yupResolver(conditionGetSchema) as unknown as Resolver<ConditionGetValues>,
  });

  const onValid = (data: ConditionGetValues) => {
    onSubmit({
      resourceId: data.conditionId || undefined,
      queryParams: {
        subject: data.patientId || undefined,
        encounter: data.encounterId || undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID Condition"
          hint="Opsional — kosongkan untuk pencarian"
          error={errors.conditionId?.message}
        >
          <input
            {...register("conditionId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${ic(!!errors.conditionId)} font-mono`}
            autoComplete="off"
          />
        </Field>

        <Field label="Patient ID" hint="subject" error={errors.patientId?.message}>
          <input
            {...register("patientId")}
            type="text"
            placeholder="mis. 100000030009"
            className={`${ic(!!errors.patientId)} font-mono`}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Encounter ID"
          hint="encounter"
          error={errors.encounterId?.message}
        >
          <input
            {...register("encounterId")}
            type="text"
            placeholder="UUID Encounter"
            className={`${ic(!!errors.encounterId)} font-mono`}
            autoComplete="off"
          />
        </Field>
      </Section>

      <SubmitButton method="GET" loading={loading} />
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
  autofillRaw,
}: {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: { payload: ConditionPayload; resourceId?: string }) => void;
  autofillRaw?: AutofillRaw | null;
}) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

  // Autofill dari panel SIMGOS → buka mode Raw JSON + isi payload.
  useEffect(() => {
    if (autofillRaw && autofillRaw.json) {
      setMode("raw");
      setRawJson(autofillRaw.json);
      setRawError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofillRaw?.nonce]);

  const needsId = method === "PUT" || method === "PATCH";

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ConditionFormValues>({
    resolver: yupResolver(
      conditionFormSchema,
    ) as unknown as Resolver<ConditionFormValues>,
    defaultValues: {
      conditionId: "",
      clinicalStatusCode: "active",
      categoryCode: "encounter-diagnosis",
      codeSystem: "icd-10",
      codeValue: "K35.8",
      codeDisplay: "Acute appendicitis, other and unspecified",
      subjectPatientId: "",
      subjectDisplay: "",
      encounterId: "",
      encounterDisplay: "",
    },
  });

  const buildPayload = (data: ConditionFormValues): ConditionPayload => {
    return {
      resourceType: "Condition",
      clinicalStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/condition-clinical",
            code: data.clinicalStatusCode,
            display: CLINICAL_DISPLAY[data.clinicalStatusCode] ?? data.clinicalStatusCode,
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/condition-category",
              code: data.categoryCode,
              display: CATEGORY_DISPLAY[data.categoryCode] ?? data.categoryCode,
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: CODE_SYSTEM_URI[data.codeSystem],
            code: data.codeValue,
            display: data.codeDisplay,
          },
        ],
      },
      subject: {
        reference: `Patient/${data.subjectPatientId}`,
        display: data.subjectDisplay,
      },
      encounter: {
        reference: `Encounter/${data.encounterId}`,
        display: data.encounterDisplay || undefined,
      },
    };
  };

  const onValidForm = (data: ConditionFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.conditionId || undefined : undefined,
    });
  };

  const handleRawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = safeJsonParse(rawJson);
    if (!parsed) {
      setRawError("JSON tidak valid. Periksa format payload Anda.");
      return;
    }
    setRawError(null);
    onSubmit({ payload: parsed as ConditionPayload });
  };

  const syncRaw = () => {
    setRawJson(safeJsonStringify(buildPayload(getValues())));
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
        <form onSubmit={handleSubmit(onValidForm)} noValidate className="space-y-4">
          {needsId && (
            <Section title="Identifikasi">
              <Field label="ID Condition" required error={errors.conditionId?.message}>
                <input
                  {...register("conditionId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.conditionId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          <Section title="Klasifikasi">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Status Klinis"
                required
                error={errors.clinicalStatusCode?.message}
              >
                <select
                  {...register("clinicalStatusCode")}
                  className={ic(!!errors.clinicalStatusCode)}
                >
                  <option value="active">Active</option>
                  <option value="recurrence">Recurrence</option>
                  <option value="relapse">Relapse</option>
                  <option value="inactive">Inactive</option>
                  <option value="remission">Remission</option>
                  <option value="resolved">Resolved</option>
                </select>
              </Field>

              <Field label="Kategori" required error={errors.categoryCode?.message}>
                <select
                  {...register("categoryCode")}
                  className={ic(!!errors.categoryCode)}
                >
                  <option value="encounter-diagnosis">
                    Encounter Diagnosis
                  </option>
                  <option value="problem-list-item">Problem List Item</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Kode Diagnosis">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Sistem Kode" required error={errors.codeSystem?.message}>
                <select
                  {...register("codeSystem")}
                  className={ic(!!errors.codeSystem)}
                >
                  <option value="icd-10">ICD-10</option>
                  <option value="snomed">SNOMED CT</option>
                </select>
              </Field>

              <Field label="Kode" required error={errors.codeValue?.message}>
                <input
                  {...register("codeValue")}
                  type="text"
                  placeholder="K35.8"
                  className={`${ic(!!errors.codeValue)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </div>

            <Field
              label="Nama Diagnosis"
              required
              error={errors.codeDisplay?.message}
            >
              <input
                {...register("codeDisplay")}
                type="text"
                placeholder="Acute appendicitis, other and unspecified"
                className={ic(!!errors.codeDisplay)}
              />
            </Field>
          </Section>

          <Section title="Referensi">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Patient ID"
                required
                error={errors.subjectPatientId?.message}
              >
                <div className="flex">
                  <RefPrefix label="Patient/" />
                  <input
                    {...register("subjectPatientId")}
                    type="text"
                    placeholder="100000030009"
                    className={`${ic(!!errors.subjectPatientId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>

              <Field
                label="Nama Pasien"
                required
                error={errors.subjectDisplay?.message}
              >
                <input
                  {...register("subjectDisplay")}
                  type="text"
                  placeholder="Nama lengkap pasien"
                  className={ic(!!errors.subjectDisplay)}
                />
              </Field>
            </div>

            <Field
              label="Encounter ID"
              required
              hint="kunjungan yang SUDAH terkirim"
              error={errors.encounterId?.message}
            >
              <div className="flex">
                <RefPrefix label="Encounter/" />
                <input
                  {...register("encounterId")}
                  type="text"
                  placeholder="UUID Encounter"
                  className={`${ic(!!errors.encounterId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>

            <Field
              label="Keterangan Encounter"
              hint="Opsional"
              error={errors.encounterDisplay?.message}
            >
              <input
                {...register("encounterDisplay")}
                type="text"
                placeholder="Contoh: Kunjungan Budi Santoso, 14 Juni 2022"
                className={ic(!!errors.encounterDisplay)}
              />
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
              rows={20}
              placeholder='{"resourceType": "Condition", ...}'
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
                rawError
                  ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                  : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
              }`}
              spellCheck={false}
              aria-label="Raw JSON payload Condition"
            />

            {rawError && (
              <p className="flex items-center gap-1 text-[11px] text-red-600" role="alert">
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
                  /Condition
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
// Komponen utama — routing ke GET atau Mutation form
// ─────────────────────────────────────────────

export default function ConditionForm({
  method,
  loading,
  onSubmit,
  autofillRaw,
}: ConditionFormProps) {
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
