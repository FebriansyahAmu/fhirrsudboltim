"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useState } from "react";

import {
  observationFormSchema,
  observationGetSchema,
  type ObservationFormValues,
  type ObservationGetValues,
} from "@/app/lib/schemas/observation.schema";
import type { ObservationPayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

/** Payload yang di-autofill dari panel SIMGOS (Raw JSON). */
type AutofillRaw = { json: string; nonce: number } | null;

interface ObservationFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: ObservationPayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
  /** Bila di-set (nonce berubah), form beralih ke Raw JSON & terisi payload. */
  autofillRaw?: AutofillRaw;
}

const CODE_SYSTEM_URI: Record<string, string> = {
  loinc: "http://loinc.org",
  snomed: "http://snomed.info/sct",
};

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
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 transition-all duration-150";
const inputErrCls =
  "w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-300/40 focus:border-red-400 transition-all duration-150";
const cx = (err: boolean) => (err ? inputErrCls : inputCls);

// ─────────────────────────────────────────────
// GET Form
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
  } = useForm<ObservationGetValues>({
    resolver: yupResolver(
      observationGetSchema,
    ) as unknown as Resolver<ObservationGetValues>,
  });

  const onValid = (data: ObservationGetValues) => {
    onSubmit({
      resourceId: data.observationId || undefined,
      queryParams: {
        subject: data.patientId ? `Patient/${data.patientId}` : undefined,
        encounter: data.encounterId ? `Encounter/${data.encounterId}` : undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID Observation"
          hint="Opsional — kosongkan untuk pencarian"
          error={errors.observationId?.message}
        >
          <input
            {...register("observationId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${cx(!!errors.observationId)} font-mono`}
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Patient ID" error={errors.patientId?.message}>
            <input
              {...register("patientId")}
              type="text"
              placeholder="ID pasien"
              className={`${cx(!!errors.patientId)} font-mono`}
              autoComplete="off"
            />
          </Field>
          <Field label="Encounter ID" error={errors.encounterId?.message}>
            <input
              {...register("encounterId")}
              type="text"
              placeholder="UUID encounter"
              className={`${cx(!!errors.encounterId)} font-mono`}
              autoComplete="off"
            />
          </Field>
        </div>
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
  onSubmit: (params: { payload: ObservationPayload; resourceId?: string }) => void;
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
  } = useForm<ObservationFormValues>({
    resolver: yupResolver(
      observationFormSchema,
    ) as unknown as Resolver<ObservationFormValues>,
    defaultValues: {
      status: "final",
      categoryCode: "vital-signs",
      categoryDisplay: "Vital Signs",
      codeSystem: "loinc",
      codeValue: "8867-4",
      codeDisplay: "Heart rate",
      subjectPatientId: "",
      subjectDisplay: "",
      encounterId: "",
      performerId: "",
      effectiveDateTime: new Date().toISOString().slice(0, 16),
      valueNumber: "80",
      valueUnit: "beats/minute",
      valueUcumCode: "/min",
      valueString: "",
      observationId: "",
    },
  });

  const buildPayload = (data: ObservationFormValues): ObservationPayload => {
    const payload: ObservationPayload = {
      resourceType: "Observation",
      status: data.status,
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: data.categoryCode,
              display: data.categoryDisplay,
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: CODE_SYSTEM_URI[data.codeSystem] ?? "http://loinc.org",
            code: data.codeValue,
            display: data.codeDisplay,
          },
        ],
      },
      subject: {
        reference: `Patient/${data.subjectPatientId}`,
        ...(data.subjectDisplay ? { display: data.subjectDisplay } : {}),
      },
      encounter: { reference: `Encounter/${data.encounterId}` },
      effectiveDateTime: new Date(data.effectiveDateTime).toISOString(),
    };

    if (data.performerId) {
      payload.performer = [{ reference: `Practitioner/${data.performerId}` }];
    }

    // value[x]: angka → valueQuantity; jika kosong, teks → valueString.
    if (data.valueNumber && data.valueNumber.trim()) {
      payload.valueQuantity = {
        value: parseFloat(data.valueNumber),
        ...(data.valueUnit ? { unit: data.valueUnit } : {}),
        system: "http://unitsofmeasure.org",
        ...(data.valueUcumCode ? { code: data.valueUcumCode } : {}),
      };
    } else if (data.valueString && data.valueString.trim()) {
      payload.valueString = data.valueString;
    }

    return payload;
  };

  const onValidForm = (data: ObservationFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.observationId || undefined : undefined,
    });
  };

  const handleRawSubmit = () => {
    const parsed = safeJsonParse(rawJson);
    if (!parsed) {
      setRawError("JSON tidak valid. Periksa format payload Anda.");
      return;
    }
    setRawError(null);
    onSubmit({ payload: parsed as ObservationPayload });
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

      {/* Form mode */}
      {mode === "form" && (
        <form onSubmit={handleSubmit(onValidForm)} noValidate className="space-y-4">
          {needsId && (
            <Section title="Identifikasi">
              <Field label="ID Observation" required error={errors.observationId?.message}>
                <input
                  {...register("observationId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${cx(!!errors.observationId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          <Section title="Informasi Dasar">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" required error={errors.status?.message}>
                <select {...register("status")} className={cx(!!errors.status)}>
                  <option value="final">final</option>
                  <option value="preliminary">preliminary</option>
                  <option value="registered">registered</option>
                  <option value="amended">amended</option>
                  <option value="corrected">corrected</option>
                  <option value="cancelled">cancelled</option>
                  <option value="entered-in-error">entered-in-error</option>
                  <option value="unknown">unknown</option>
                </select>
              </Field>
              <Field
                label="Tanggal Efektif"
                required
                error={errors.effectiveDateTime?.message}
              >
                <input
                  {...register("effectiveDateTime")}
                  type="datetime-local"
                  className={cx(!!errors.effectiveDateTime)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kode Kategori" required error={errors.categoryCode?.message}>
                <input
                  {...register("categoryCode")}
                  type="text"
                  placeholder="vital-signs"
                  className={`${cx(!!errors.categoryCode)} font-mono`}
                />
              </Field>
              <Field
                label="Nama Kategori"
                required
                error={errors.categoryDisplay?.message}
              >
                <input
                  {...register("categoryDisplay")}
                  type="text"
                  placeholder="Vital Signs"
                  className={cx(!!errors.categoryDisplay)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Kode Observasi (LOINC / SNOMED)">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Sistem" required error={errors.codeSystem?.message}>
                <select {...register("codeSystem")} className={cx(!!errors.codeSystem)}>
                  <option value="loinc">LOINC</option>
                  <option value="snomed">SNOMED CT</option>
                </select>
              </Field>
              <Field label="Kode" required error={errors.codeValue?.message}>
                <input
                  {...register("codeValue")}
                  type="text"
                  placeholder="8867-4"
                  className={`${cx(!!errors.codeValue)} font-mono`}
                  autoComplete="off"
                />
              </Field>
              <Field label="Nama" required error={errors.codeDisplay?.message}>
                <input
                  {...register("codeDisplay")}
                  type="text"
                  placeholder="Heart rate"
                  className={cx(!!errors.codeDisplay)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Nilai (value[x])">
            <p className="text-[11px] text-slate-400 -mt-1">
              Isi angka → <code className="font-mono">valueQuantity</code>; kosongkan
              angka & isi teks → <code className="font-mono">valueString</code>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Nilai (angka)" error={errors.valueNumber?.message}>
                <input
                  {...register("valueNumber")}
                  type="text"
                  inputMode="decimal"
                  placeholder="80"
                  className={`${cx(!!errors.valueNumber)} font-mono`}
                  autoComplete="off"
                />
              </Field>
              <Field label="Satuan" error={errors.valueUnit?.message}>
                <input
                  {...register("valueUnit")}
                  type="text"
                  placeholder="beats/minute"
                  className={cx(!!errors.valueUnit)}
                />
              </Field>
              <Field label="Kode UCUM" error={errors.valueUcumCode?.message}>
                <input
                  {...register("valueUcumCode")}
                  type="text"
                  placeholder="/min"
                  className={`${cx(!!errors.valueUcumCode)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </div>
            <Field label="Nilai (teks)" error={errors.valueString?.message}>
              <input
                {...register("valueString")}
                type="text"
                placeholder="Alternatif bila bukan angka"
                className={cx(!!errors.valueString)}
              />
            </Field>
          </Section>

          <Section title="Referensi">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Patient ID" required error={errors.subjectPatientId?.message}>
                <div className="flex">
                  <RefPrefix text="Patient/" />
                  <input
                    {...register("subjectPatientId")}
                    type="text"
                    placeholder="ID"
                    className={`${cx(!!errors.subjectPatientId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
              <Field label="Nama Pasien" error={errors.subjectDisplay?.message}>
                <input
                  {...register("subjectDisplay")}
                  type="text"
                  placeholder="Opsional"
                  className={cx(!!errors.subjectDisplay)}
                />
              </Field>
            </div>
            <Field label="Encounter ID" required error={errors.encounterId?.message}>
              <div className="flex">
                <RefPrefix text="Encounter/" />
                <input
                  {...register("encounterId")}
                  type="text"
                  placeholder="UUID"
                  className={`${cx(!!errors.encounterId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>
            <Field
              label="Practitioner ID"
              hint="Pelaksana — opsional"
              error={errors.performerId?.message}
            >
              <div className="flex">
                <RefPrefix text="Practitioner/" />
                <input
                  {...register("performerId")}
                  type="text"
                  placeholder="Opsional"
                  className={`${cx(!!errors.performerId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
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
              className="text-[11px] text-teal-600 hover:text-teal-800 font-medium transition-colors"
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
            rows={16}
            placeholder='{"resourceType": "Observation", ...}'
            className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
              rawError
                ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
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
            {loading ? <LoadingSpinner /> : <>{method} /Observation</>}
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
    POST: "bg-teal-600 hover:bg-teal-700 text-white shadow-sm shadow-teal-200",
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
          <span>/Observation</span>
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// Komponen utama
// ─────────────────────────────────────────────
export default function ObservationForm({
  method,
  loading,
  onSubmit,
  autofillRaw,
}: ObservationFormProps) {
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
