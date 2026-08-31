/**
 * components/modules/specimen/SpecimenForm.tsx
 *
 * Form input untuk resource Specimen (spesimen laboratorium).
 * Mendukung dua mode:
 *   - Form : field-by-field dengan validasi Yup + react-hook-form
 *   - Raw JSON : edit payload langsung (juga dipakai untuk autofill dari SIMGOS)
 *
 * Catatan khusus Specimen:
 *   - `identifier.system` memakai Org_id dari env; `assigner` = Organization/Org_id
 *   - `request` WAJIB — spesimen mengikuti ServiceRequest yang sudah TERKIRIM
 *   - `collection.extension` CollectorOrganization diisi dari Org_id (opsional)
 *
 * Pola konsisten dengan AllergyIntoleranceForm.tsx.
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useState } from "react";

import {
  specimenFormSchema,
  specimenGetSchema,
  type SpecimenFormValues,
  type SpecimenGetValues,
} from "@/app/lib/schemas/specimen.schema";
import type { SpecimenPayload } from "@/app/lib/types/fhir";
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

interface SpecimenFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: SpecimenPayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
  autofillRaw?: AutofillRaw | null;
}

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
          <span>/Specimen</span>
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
  } = useForm<SpecimenGetValues>({
    resolver: yupResolver(specimenGetSchema) as unknown as Resolver<SpecimenGetValues>,
  });

  const onValid = (data: SpecimenGetValues) => {
    onSubmit({
      resourceId: data.specimenId || undefined,
      queryParams: {
        subject: data.patientId || undefined,
        request: data.requestId || undefined,
        collected: data.collected || undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID Specimen"
          hint="Opsional — kosongkan untuk pencarian"
          error={errors.specimenId?.message}
        >
          <input
            {...register("specimenId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${ic(!!errors.specimenId)} font-mono`}
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
          label="ServiceRequest ID"
          hint="request"
          error={errors.requestId?.message}
        >
          <input
            {...register("requestId")}
            type="text"
            placeholder="UUID ServiceRequest"
            className={`${ic(!!errors.requestId)} font-mono`}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Tanggal Diambil"
          hint="collected — YYYY-MM-DD"
          error={errors.collected?.message}
        >
          <input
            {...register("collected")}
            type="date"
            className={ic(!!errors.collected)}
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
  onSubmit: (params: { payload: SpecimenPayload; resourceId?: string }) => void;
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
  const now = new Date().toISOString().slice(0, 16);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<SpecimenFormValues>({
    resolver: yupResolver(
      specimenFormSchema,
    ) as unknown as Resolver<SpecimenFormValues>,
    defaultValues: {
      specimenId: "",
      identifierValue: "00001",
      status: "available",
      typeCode: "119297000",
      typeDisplay: "Blood specimen",
      subjectPatientId: "",
      subjectDisplay: "",
      requestServiceRequestId: "",
      collectedDateTime: now,
      receivedTime: now,
    },
  });

  const buildPayload = (data: SpecimenFormValues): SpecimenPayload => {
    const orgId = process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET";

    const payload: SpecimenPayload = {
      resourceType: "Specimen",
      identifier: [
        {
          system: `http://sys-ids.kemkes.go.id/specimen/${orgId}`,
          use: "official",
          value: data.identifierValue,
          assigner: { reference: `Organization/${orgId}` },
        },
      ],
      status: data.status,
      type: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: data.typeCode,
            display: data.typeDisplay,
          },
        ],
      },
      subject: {
        reference: `Patient/${data.subjectPatientId}`,
        display: data.subjectDisplay,
      },
      request: [
        { reference: `ServiceRequest/${data.requestServiceRequestId}` },
      ],
    };

    if (data.collectedDateTime) {
      payload.collection = {
        collectedDateTime: new Date(data.collectedDateTime).toISOString(),
        extension: [
          {
            url: "https://fhir.kemkes.go.id/r4/StructureDefinition/CollectorOrganization",
            valueReference: { reference: `Organization/${orgId}` },
          },
        ],
      };
    }

    if (data.receivedTime) {
      payload.receivedTime = new Date(data.receivedTime).toISOString();
    }

    return payload;
  };

  const onValidForm = (data: SpecimenFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.specimenId || undefined : undefined,
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
    onSubmit({ payload: parsed as SpecimenPayload });
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
              <Field label="ID Specimen" required error={errors.specimenId?.message}>
                <input
                  {...register("specimenId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.specimenId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          <Section title="Identitas Spesimen">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Nomor Spesimen"
                required
                hint="identifier"
                error={errors.identifierValue?.message}
              >
                <div className="flex">
                  <span
                    className="flex items-center px-2.5 bg-teal-50 border border-r-0 border-teal-200 rounded-l-xl text-[10px] text-teal-600 font-mono whitespace-nowrap max-w-45 truncate"
                    title="sys-ids.kemkes.go.id/specimen/{ORG_ID}"
                  >
                    …/specimen/…
                  </span>
                  <input
                    {...register("identifierValue")}
                    type="text"
                    placeholder="00001"
                    className={`${ic(!!errors.identifierValue)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>

              <Field label="Status" required error={errors.status?.message}>
                <select {...register("status")} className={ic(!!errors.status)}>
                  <option value="available">Available — tersedia</option>
                  <option value="unavailable">Unavailable — tidak tersedia</option>
                  <option value="unsatisfactory">
                    Unsatisfactory — tidak memenuhi syarat
                  </option>
                  <option value="entered-in-error">Entered in Error</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Jenis Spesimen (SNOMED CT)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Kode SNOMED" required error={errors.typeCode?.message}>
                <input
                  {...register("typeCode")}
                  type="text"
                  placeholder="119297000"
                  className={`${ic(!!errors.typeCode)} font-mono`}
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Nama Jenis"
                required
                error={errors.typeDisplay?.message}
              >
                <input
                  {...register("typeDisplay")}
                  type="text"
                  placeholder="Blood specimen"
                  className={ic(!!errors.typeDisplay)}
                />
              </Field>
            </div>
            <p className="text-[11px] text-slate-400">
              Umum: 119297000 Blood · 119294007 Dried blood · 122575003 Urine ·
              119334006 Sputum · 119339001 Stool
            </p>
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
              label="ServiceRequest ID"
              required
              hint="permintaan lab yang SUDAH terkirim"
              error={errors.requestServiceRequestId?.message}
            >
              <div className="flex">
                <RefPrefix label="ServiceRequest/" />
                <input
                  {...register("requestServiceRequestId")}
                  type="text"
                  placeholder="UUID ServiceRequest"
                  className={`${ic(!!errors.requestServiceRequestId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>
          </Section>

          <Section title="Waktu">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Waktu Pengambilan"
                hint="collectedDateTime — opsional"
                error={errors.collectedDateTime?.message}
              >
                <input
                  {...register("collectedDateTime")}
                  type="datetime-local"
                  className={ic(!!errors.collectedDateTime)}
                />
              </Field>

              <Field
                label="Waktu Diterima Lab"
                hint="receivedTime — opsional"
                error={errors.receivedTime?.message}
              >
                <input
                  {...register("receivedTime")}
                  type="datetime-local"
                  className={ic(!!errors.receivedTime)}
                />
              </Field>
            </div>
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
              placeholder='{"resourceType": "Specimen", ...}'
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
                rawError
                  ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                  : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
              }`}
              spellCheck={false}
              aria-label="Raw JSON payload Specimen"
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
                  /Specimen
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

export default function SpecimenForm({
  method,
  loading,
  onSubmit,
  autofillRaw,
}: SpecimenFormProps) {
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
