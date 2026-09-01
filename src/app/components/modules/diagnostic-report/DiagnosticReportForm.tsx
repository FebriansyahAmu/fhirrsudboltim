"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useState } from "react";

import {
  diagnosticReportFormSchema,
  diagnosticReportGetSchema,
  type DiagnosticReportFormValues,
  type DiagnosticReportGetValues,
} from "@/app/lib/schemas/diagnostic-report.schema";
import type { DiagnosticReportPayload, FhirReference } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

/** Payload yang di-autofill dari panel SIMGOS (Raw JSON). */
type AutofillRaw = { json: string; nonce: number } | null;

interface DiagnosticReportFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: DiagnosticReportPayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
  autofillRaw?: AutofillRaw;
}

const CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/v2-0074";
const CODE_SYSTEM = "http://loinc.org";

/** Pisah daftar UUID (baris/koma/spasi) → array id bersih. */
function parseIds(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

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
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40 focus:border-fuchsia-400 transition-all duration-150";
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
  } = useForm<DiagnosticReportGetValues>({
    resolver: yupResolver(
      diagnosticReportGetSchema,
    ) as unknown as Resolver<DiagnosticReportGetValues>,
  });

  const onValid = (data: DiagnosticReportGetValues) => {
    onSubmit({
      resourceId: data.diagnosticReportId || undefined,
      queryParams: {
        subject: data.patientId || undefined,
        encounter: data.encounterId || undefined,
        specimen: data.specimenId || undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID DiagnosticReport"
          hint="Opsional — kosongkan untuk pencarian"
          error={errors.diagnosticReportId?.message}
        >
          <input
            {...register("diagnosticReportId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${cx(!!errors.diagnosticReportId)} font-mono`}
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              placeholder="UUID kunjungan"
              className={`${cx(!!errors.encounterId)} font-mono`}
              autoComplete="off"
            />
          </Field>
          <Field label="Specimen ID" error={errors.specimenId?.message}>
            <input
              {...register("specimenId")}
              type="text"
              placeholder="UUID spesimen"
              className={`${cx(!!errors.specimenId)} font-mono`}
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
  onSubmit: (params: {
    payload: DiagnosticReportPayload;
    resourceId?: string;
  }) => void;
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
  } = useForm<DiagnosticReportFormValues>({
    resolver: yupResolver(
      diagnosticReportFormSchema,
    ) as unknown as Resolver<DiagnosticReportFormValues>,
    defaultValues: {
      status: "final",
      categoryCode: "CH",
      categoryDisplay: "Chemistry",
      codeSystem: CODE_SYSTEM,
      codeCode: "",
      codeDisplay: "",
      subjectPatientId: "",
      subjectDisplay: "",
      encounterId: "",
      resultObservationIds: "",
      basedOnServiceRequestId: "",
      specimenId: "",
      performerPractitionerId: "",
      performerOrganizationId: "",
      effectiveDateTime: new Date().toISOString().slice(0, 16),
      issued: "",
      conclusion: "",
      diagnosticReportId: "",
    },
  });

  const buildPayload = (
    data: DiagnosticReportFormValues,
  ): DiagnosticReportPayload => {
    const payload: DiagnosticReportPayload = {
      resourceType: "DiagnosticReport",
      status: data.status,
      category: [
        {
          coding: [
            {
              system: CATEGORY_SYSTEM,
              code: data.categoryCode,
              display: data.categoryDisplay,
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: data.codeSystem,
            code: data.codeCode,
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
      issued: new Date(data.issued || data.effectiveDateTime).toISOString(),
    };

    const results = parseIds(data.resultObservationIds);
    if (results.length) {
      payload.result = results.map((id) => ({
        reference: `Observation/${id}`,
      }));
    }

    const performer: FhirReference[] = [];
    if (data.performerPractitionerId)
      performer.push({ reference: `Practitioner/${data.performerPractitionerId}` });
    if (data.performerOrganizationId)
      performer.push({ reference: `Organization/${data.performerOrganizationId}` });
    if (performer.length) payload.performer = performer;

    if (data.basedOnServiceRequestId) {
      payload.basedOn = [
        { reference: `ServiceRequest/${data.basedOnServiceRequestId}` },
      ];
    }
    if (data.specimenId) {
      payload.specimen = [{ reference: `Specimen/${data.specimenId}` }];
    }
    if (data.conclusion && data.conclusion.trim()) {
      payload.conclusion = data.conclusion.trim();
    }

    return payload;
  };

  const onValidForm = (data: DiagnosticReportFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.diagnosticReportId || undefined : undefined,
    });
  };

  const handleRawSubmit = () => {
    const parsed = safeJsonParse(rawJson);
    if (!parsed) {
      setRawError("JSON tidak valid. Periksa format payload Anda.");
      return;
    }
    setRawError(null);
    onSubmit({ payload: parsed as DiagnosticReportPayload });
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

      <p className="rounded-xl bg-fuchsia-50/60 border border-fuchsia-100 px-3 py-2 text-[11px] text-fuchsia-800">
        Laporan merangkum hasil <span className="font-semibold">Observation</span>{" "}
        dalam konteks <span className="font-semibold">Encounter</span> — keduanya
        harus sudah terkirim. Untuk daftar hasil (<span className="font-mono">result[]</span>){" "}
        lengkap beserta <span className="font-semibold">basedOn</span> /
        <span className="font-semibold"> specimen</span>, pakai{" "}
        <span className="font-semibold">Autofill</span> dari panel SIMGOS atau mode{" "}
        <span className="font-mono">Raw JSON</span>.
      </p>

      {/* Form mode */}
      {mode === "form" && (
        <form onSubmit={handleSubmit(onValidForm)} noValidate className="space-y-4">
          {needsId && (
            <Section title="Identifikasi">
              <Field
                label="ID DiagnosticReport"
                required
                error={errors.diagnosticReportId?.message}
              >
                <input
                  {...register("diagnosticReportId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${cx(!!errors.diagnosticReportId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          <Section title="Informasi Laporan">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" required error={errors.status?.message}>
                <select {...register("status")} className={cx(!!errors.status)}>
                  <option value="final">final</option>
                  <option value="preliminary">preliminary</option>
                  <option value="partial">partial</option>
                  <option value="registered">registered</option>
                  <option value="amended">amended</option>
                  <option value="corrected">corrected</option>
                  <option value="appended">appended</option>
                  <option value="cancelled">cancelled</option>
                  <option value="entered-in-error">entered-in-error</option>
                  <option value="unknown">unknown</option>
                </select>
              </Field>
              <Field
                label="Waktu Pemeriksaan"
                required
                hint="effectiveDateTime"
                error={errors.effectiveDateTime?.message}
              >
                <input
                  {...register("effectiveDateTime")}
                  type="datetime-local"
                  className={cx(!!errors.effectiveDateTime)}
                />
              </Field>
            </div>
            <Field label="Waktu Terbit" hint="issued — opsional" error={errors.issued?.message}>
              <input
                {...register("issued")}
                type="datetime-local"
                className={cx(!!errors.issued)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Kode Kategori"
                required
                hint="v2-0074"
                error={errors.categoryCode?.message}
              >
                <input
                  {...register("categoryCode")}
                  type="text"
                  placeholder="CH"
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
                  placeholder="Chemistry"
                  className={cx(!!errors.categoryDisplay)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Pemeriksaan (code)">
            <Field label="System" required error={errors.codeSystem?.message}>
              <input
                {...register("codeSystem")}
                type="text"
                placeholder="http://loinc.org"
                className={`${cx(!!errors.codeSystem)} font-mono`}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Kode" required error={errors.codeCode?.message}>
                <input
                  {...register("codeCode")}
                  type="text"
                  placeholder="2345-7"
                  className={`${cx(!!errors.codeCode)} font-mono`}
                  autoComplete="off"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Nama Pemeriksaan" required error={errors.codeDisplay?.message}>
                  <input
                    {...register("codeDisplay")}
                    type="text"
                    placeholder="Glucose [Mass/volume] in Serum or Plasma"
                    className={cx(!!errors.codeDisplay)}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Hasil (result[]) — Observation harus terkirim dulu">
            <Field
              label="Observation ID"
              hint="satu UUID per baris"
              error={errors.resultObservationIds?.message}
            >
              <textarea
                {...register("resultObservationIds")}
                rows={3}
                placeholder={"60eb9416-e091-4b1b-a9a5-dee00a6f32d9\n16163ac6-641e-411b-a4cc-e1f7737236dc"}
                className={`${cx(!!errors.resultObservationIds)} font-mono resize-none`}
                spellCheck={false}
                autoComplete="off"
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
                  placeholder="UUID kunjungan"
                  className={`${cx(!!errors.encounterId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="ServiceRequest ID"
                hint="basedOn — opsional"
                error={errors.basedOnServiceRequestId?.message}
              >
                <div className="flex">
                  <RefPrefix text="ServiceRequest/" />
                  <input
                    {...register("basedOnServiceRequestId")}
                    type="text"
                    placeholder="Opsional"
                    className={`${cx(!!errors.basedOnServiceRequestId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
              <Field
                label="Specimen ID"
                hint="Opsional"
                error={errors.specimenId?.message}
              >
                <div className="flex">
                  <RefPrefix text="Specimen/" />
                  <input
                    {...register("specimenId")}
                    type="text"
                    placeholder="Opsional"
                    className={`${cx(!!errors.specimenId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Practitioner ID"
                hint="Pelaksana — opsional"
                error={errors.performerPractitionerId?.message}
              >
                <div className="flex">
                  <RefPrefix text="Practitioner/" />
                  <input
                    {...register("performerPractitionerId")}
                    type="text"
                    placeholder="Opsional"
                    className={`${cx(!!errors.performerPractitionerId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
              <Field
                label="Organization ID"
                hint="Lab/fasilitas — opsional"
                error={errors.performerOrganizationId?.message}
              >
                <div className="flex">
                  <RefPrefix text="Organization/" />
                  <input
                    {...register("performerOrganizationId")}
                    type="text"
                    placeholder="Opsional"
                    className={`${cx(!!errors.performerOrganizationId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
            </div>
            <Field label="Kesimpulan" hint="conclusion — opsional" error={errors.conclusion?.message}>
              <textarea
                {...register("conclusion")}
                rows={2}
                placeholder="Opsional"
                className={`${cx(!!errors.conclusion)} resize-none`}
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
              className="text-[11px] text-fuchsia-700 hover:text-fuchsia-900 font-medium transition-colors"
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
            placeholder='{"resourceType": "DiagnosticReport", ...}'
            className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
              rawError
                ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                : "border-slate-200 focus:ring-fuchsia-400/40 focus:border-fuchsia-400"
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
            {loading ? <LoadingSpinner /> : <>{method} /DiagnosticReport</>}
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
    POST: "bg-fuchsia-600 hover:bg-fuchsia-700 text-white shadow-sm shadow-fuchsia-200",
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
          <span>/DiagnosticReport</span>
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// Komponen utama
// ─────────────────────────────────────────────
export default function DiagnosticReportForm({
  method,
  loading,
  onSubmit,
  autofillRaw,
}: DiagnosticReportFormProps) {
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
