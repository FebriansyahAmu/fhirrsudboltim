"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useState } from "react";

import {
  medicationFormSchema,
  medicationGetSchema,
  type MedicationFormValues,
  type MedicationGetValues,
} from "@/app/lib/schemas/medication.schema";
import type { MedicationPayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

/** Payload yang di-autofill dari panel SIMGOS (Raw JSON). */
type AutofillRaw = { json: string; nonce: number } | null;

interface MedicationFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: MedicationPayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
  autofillRaw?: AutofillRaw;
}

const KFA_SYSTEM = "http://sys-ids.kemkes.go.id/kfa";
const FORM_SYSTEM = "http://terminology.kemkes.go.id/CodeSystem/medication-form";
const MED_PROFILE = "https://fhir.kemkes.go.id/r4/StructureDefinition/Medication";

// ─────────────────────────────────────────────
// Field & Section UI
// ─────────────────────────────────────────────
function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
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

function RefPrefix({ text }: { text: string }) {
  return (
    <span className="flex items-center px-2.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-[11px] text-slate-400 font-mono whitespace-nowrap">
      {text}
    </span>
  );
}

const inputCls =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all duration-150";
const inputErrCls =
  "w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-300/40 focus:border-red-400 transition-all duration-150";
const cx = (err: boolean) => (err ? inputErrCls : inputCls);

// ─────────────────────────────────────────────
// GET Form (by ID)
// ─────────────────────────────────────────────
function GetForm({
  onSubmit,
  loading,
}: {
  onSubmit: (params: {
    queryParams: Record<string, string | undefined>;
    resourceId?: string;
  }) => void;
  loading: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MedicationGetValues>({
    resolver: yupResolver(
      medicationGetSchema,
    ) as unknown as Resolver<MedicationGetValues>,
  });

  const onValid = (data: MedicationGetValues) => {
    onSubmit({ resourceId: data.medicationId || undefined, queryParams: {} });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Ambil Berdasarkan ID">
        <Field
          label="ID Medication"
          required
          hint="Medication dicari berdasarkan ID"
          error={errors.medicationId?.message}
        >
          <input
            {...register("medicationId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${cx(!!errors.medicationId)} font-mono`}
            autoComplete="off"
          />
        </Field>
      </Section>
      <SubmitButton method="GET" loading={loading} />
    </form>
  );
}

// ─────────────────────────────────────────────
// POST/PUT/PATCH Form
// ─────────────────────────────────────────────
function MutationForm({
  method,
  onSubmit,
  loading,
  autofillRaw,
}: {
  method: HttpMethod;
  onSubmit: (params: { payload: MedicationPayload; resourceId?: string }) => void;
  loading: boolean;
  autofillRaw?: AutofillRaw;
}) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

  // Autofill dari panel SIMGOS → pindah ke Raw JSON & isi payload.
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
  } = useForm<MedicationFormValues>({
    resolver: yupResolver(
      medicationFormSchema,
    ) as unknown as Resolver<MedicationFormValues>,
    defaultValues: {
      status: "active",
      kfaCode: "93001019",
      kfaDisplay:
        "Obat Anti Tuberculosis / Rifampicin 150 mg / Isoniazid 75 mg (KIMIA FARMA)",
      formCode: "BS023",
      formDisplay: "Kaplet Salut Selaput",
      manufacturerId: "",
      identifierValue: "",
      medicationId: "",
    },
  });

  const buildPayload = (data: MedicationFormValues): MedicationPayload => {
    const payload: MedicationPayload = {
      resourceType: "Medication",
      meta: { profile: [MED_PROFILE] },
      code: {
        coding: [
          { system: KFA_SYSTEM, code: data.kfaCode, display: data.kfaDisplay },
        ],
      },
      status: data.status,
    };

    if (data.identifierValue) {
      payload.identifier = [{ use: "official", value: data.identifierValue }];
    }
    if (data.manufacturerId) {
      payload.manufacturer = { reference: `Organization/${data.manufacturerId}` };
    }
    if (data.formCode || data.formDisplay) {
      payload.form = {
        coding: [
          {
            system: FORM_SYSTEM,
            code: data.formCode ?? "",
            display: data.formDisplay ?? "",
          },
        ],
      };
    }

    return payload;
  };

  const onValidForm = (data: MedicationFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.medicationId || undefined : undefined,
    });
  };

  const handleRawSubmit = () => {
    const parsed = safeJsonParse(rawJson);
    if (!parsed) {
      setRawError("JSON tidak valid. Periksa format payload Anda.");
      return;
    }
    setRawError(null);
    onSubmit({ payload: parsed as MedicationPayload });
  };

  const syncRaw = () => setRawJson(safeJsonStringify(buildPayload(getValues())));

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

      {/* Info: form ringkas, ingredient/strength lengkap via Raw JSON/autofill */}
      <p className="rounded-xl bg-emerald-50/60 border border-emerald-100 px-3 py-2 text-[11px] text-emerald-800">
        Form ini merakit Medication ringkas (kode KFA, status, bentuk). Untuk
        <span className="font-semibold"> ingredient &amp; strength</span> lengkap,
        gunakan <span className="font-semibold">Autofill</span> dari panel SIMGOS
        atau mode <span className="font-mono">Raw JSON</span>.
      </p>

      {/* Form mode */}
      {mode === "form" && (
        <form onSubmit={handleSubmit(onValidForm)} noValidate className="space-y-4">
          {needsId && (
            <Section title="Identifikasi">
              <Field label="ID Medication" required error={errors.medicationId?.message}>
                <input
                  {...register("medicationId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${cx(!!errors.medicationId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          <Section title="Obat (KFA)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" required error={errors.status?.message}>
                <select {...register("status")} className={cx(!!errors.status)}>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                  <option value="entered-in-error">entered-in-error</option>
                </select>
              </Field>
              <Field label="Kode KFA" required error={errors.kfaCode?.message}>
                <input
                  {...register("kfaCode")}
                  type="text"
                  placeholder="93001019"
                  className={`${cx(!!errors.kfaCode)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </div>
            <Field label="Nama Obat" required error={errors.kfaDisplay?.message}>
              <textarea
                {...register("kfaDisplay")}
                rows={2}
                placeholder="Nama obat sesuai KFA"
                className={`${cx(!!errors.kfaDisplay)} resize-none`}
              />
            </Field>
          </Section>

          <Section title="Bentuk Sediaan (opsional)">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Kode Bentuk" error={errors.formCode?.message}>
                <input
                  {...register("formCode")}
                  type="text"
                  placeholder="BS023"
                  className={`${cx(!!errors.formCode)} font-mono`}
                  autoComplete="off"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Nama Bentuk" error={errors.formDisplay?.message}>
                  <input
                    {...register("formDisplay")}
                    type="text"
                    placeholder="Kaplet Salut Selaput"
                    className={cx(!!errors.formDisplay)}
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Lainnya (opsional)">
            <Field
              label="Manufacturer (Organization)"
              error={errors.manufacturerId?.message}
            >
              <div className="flex">
                <RefPrefix text="Organization/" />
                <input
                  {...register("manufacturerId")}
                  type="text"
                  placeholder="Opsional"
                  className={`${cx(!!errors.manufacturerId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>
            <Field
              label="Identifier lokal"
              hint="Opsional"
              error={errors.identifierValue?.message}
            >
              <input
                {...register("identifierValue")}
                type="text"
                placeholder="mis. 123456789"
                className={`${cx(!!errors.identifierValue)} font-mono`}
                autoComplete="off"
              />
            </Field>
          </Section>

          <SubmitButton method={method} loading={loading} />
        </form>
      )}

      {/* Raw JSON mode */}
      {mode === "raw" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Raw JSON Payload</span>
            <button
              type="button"
              onClick={syncRaw}
              className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium transition-colors"
            >
              ↩ Sync dari form
            </button>
          </div>
          <textarea
            value={rawJson}
            onChange={(e) => {
              setRawJson(e.target.value);
              setRawError(null);
            }}
            rows={18}
            placeholder='{"resourceType": "Medication", ...}'
            className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
              rawError
                ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                : "border-slate-200 focus:ring-emerald-400/40 focus:border-emerald-400"
            }`}
            spellCheck={false}
            aria-label="Raw JSON payload"
          />
          {rawError && (
            <p className="text-[11px] text-red-600 flex items-center gap-1" role="alert">
              <ErrorIcon />
              {rawError}
            </p>
          )}
          <button
            type="button"
            onClick={handleRawSubmit}
            disabled={loading}
            className={submitButtonCls(method, loading)}
          >
            {loading ? <LoadingSpinner /> : <>{method} /Medication</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Submit Button
// ─────────────────────────────────────────────
function submitButtonCls(method: HttpMethod, loading: boolean) {
  if (loading)
    return "flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold bg-slate-100 text-slate-400 cursor-not-allowed";
  const colors: Record<string, string> = {
    GET: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200",
    POST: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200",
    PUT: "bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-200",
    PATCH:
      "bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-200",
  };
  return `flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${colors[method] ?? "bg-slate-600 hover:bg-slate-700 text-white"}`;
}

function LoadingSpinner() {
  return (
    <>
      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      <span>Mengirim...</span>
    </>
  );
}

function SubmitButton({
  method,
  loading,
}: {
  method: HttpMethod;
  loading: boolean;
}) {
  return (
    <button type="submit" disabled={loading} className={submitButtonCls(method, loading)}>
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <span className="font-mono font-bold text-xs">{method}</span>
          <span>/Medication</span>
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// Komponen utama
// ─────────────────────────────────────────────
export default function MedicationForm({
  method,
  loading,
  onSubmit,
  autofillRaw,
}: MedicationFormProps) {
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
