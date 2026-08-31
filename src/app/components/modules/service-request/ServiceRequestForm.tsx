/**
 * components/modules/service-request/ServiceRequestForm.tsx
 *
 * Form input untuk resource ServiceRequest (permintaan radiologi).
 * Mendukung dua mode:
 *   - Form : field-by-field dengan validasi Yup + react-hook-form
 *   - Raw JSON : edit payload langsung
 *
 * Fitur fleksibilitas:
 *   - Preset prosedur (USG Ginjal, CT Scan, MRI, dll.) — auto-fill LOINC + KPTL + Modality
 *   - Semua field coding bisa diedit manual setelah preset dipilih
 *   - Preset ICD-10 diagnosis — bisa custom atau dilewati (none)
 *   - Body site dari preset atau custom SNOMED
 *   - Supporting info (Observation, AllergyIntolerance, Procedure) — opsional
 *
 * Pola konsisten dengan EncounterForm.tsx.
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useState, useEffect } from "react";

import {
  serviceRequestFormSchema,
  serviceRequestGetSchema,
  IMAGING_PRESETS,
  ICD10_PRESETS,
  MODALITY_CODES,
  SERVICE_REQUEST_STATUS_VALUES,
  SERVICE_REQUEST_INTENT_VALUES,
  SERVICE_REQUEST_PRIORITY_VALUES,
  type ServiceRequestFormValues,
  type ServiceRequestGetValues,
  type ImagingPresetKey,
  type Icd10PresetKey,
} from "@/app/lib/schemas/service-request.schema";
import type { ServiceRequestPayload } from "@/app/lib/types/fhir";
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

interface ServiceRequestFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: ServiceRequestPayload;
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

function RefPrefix({ label }: { label: string }) {
  return (
    <span className="flex items-center px-2.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-[11px] text-slate-400 font-mono whitespace-nowrap">
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────
// Input class helpers
// ─────────────────────────────────────────────

const inputBase =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 transition-all duration-150";

const inputErr =
  "w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-300/40 focus:border-red-400 transition-all duration-150";

function ic(hasError: boolean) {
  return hasError ? inputErr : inputBase;
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
          <span>/ServiceRequest</span>
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
  } = useForm<ServiceRequestGetValues>({
    resolver: yupResolver(
      serviceRequestGetSchema,
    ) as unknown as Resolver<ServiceRequestGetValues>,
  });

  const onValid = (data: ServiceRequestGetValues) => {
    onSubmit({
      resourceId: data.serviceRequestId || undefined,
      queryParams: {
        subject: data.patientId ? `Patient/${data.patientId}` : undefined,
        status: data.status || undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID ServiceRequest"
          hint="Opsional — kosongkan untuk list"
          error={errors.serviceRequestId?.message}
        >
          <input
            {...register("serviceRequestId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${ic(!!errors.serviceRequestId)} font-mono`}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Patient ID"
          hint="Opsional — filter berdasarkan pasien"
          error={errors.patientId?.message}
        >
          <div className="flex">
            <RefPrefix label="Patient/" />
            <input
              {...register("patientId")}
              type="text"
              placeholder="ID pasien"
              className={`${ic(!!errors.patientId)} rounded-l-none border-l-0 font-mono`}
              autoComplete="off"
            />
          </div>
        </Field>

        <Field label="Status" error={errors.status?.message}>
          <select {...register("status")} className={ic(!!errors.status)}>
            <option value="">Semua status</option>
            {SERVICE_REQUEST_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <SubmitButton method="GET" loading={loading} />
    </form>
  );
}

// ─────────────────────────────────────────────
// Helper: generate nomor ServiceRequest / ACSN
// Format: RAD{YY}{MM}{DD}1{seq3}
// Contoh 20-Apr-2026 seq 1 → RAD2604201001
// ─────────────────────────────────────────────
function buildSRCode(seq = 1): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `RAD${yy}${mm}${dd}1${String(seq).padStart(3, "0")}`;
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
  onSubmit: (params: {
    payload: ServiceRequestPayload;
    resourceId?: string;
  }) => void;
  autofillRaw?: AutofillRaw | null;
}) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);
  const [srSeq, setSrSeq] = useState(1);

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
  const orgId = process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET";

  const now = new Date().toISOString().slice(0, 16);
  const defaultPreset = "usg_ginjal" as ImagingPresetKey;
  const defaultImagingData = IMAGING_PRESETS[defaultPreset];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<ServiceRequestFormValues>({
    resolver: yupResolver(
      serviceRequestFormSchema,
    ) as unknown as Resolver<ServiceRequestFormValues>,
    defaultValues: {
      serviceRequestId: "",
      identifierValue: "00001B",
      acsnValue: "",
      status: "active",
      intent: "original-order",
      priority: "routine",
      procedurePreset: defaultPreset,
      loincCode: defaultImagingData.loinc.code,
      loincDisplay: defaultImagingData.loinc.display,
      kptlCode: defaultImagingData.kptl.code,
      kptlDisplay: defaultImagingData.kptl.display,
      procedureText: defaultImagingData.text,
      modalityCode: defaultImagingData.modalityCode,
      aeTitleDisplay: "US0001",
      patientId: "",
      encounterId: "",
      occurrenceDateTime: now,
      authoredOn: now,
      requesterId: "",
      requesterDisplay: "",
      performerId: "",
      performerDisplay: "",
      bodySitePreset: defaultPreset,
      bodySiteCode: defaultImagingData.bodySite.code,
      bodySiteDisplay: defaultImagingData.bodySite.display,
      diagnosisPreset: "none",
      diagnosisCode: "",
      diagnosisDisplay: "",
      observationId: "",
      allergyId: "",
      procedureId: "",
    },
  });

  const procedurePreset = watch("procedurePreset");
  const diagnosisPreset = watch("diagnosisPreset");

  // Auto-generate nomor SR & ACSN saat form pertama dibuka
  useEffect(() => {
    const code = buildSRCode(1);
    setValue("identifierValue", code, { shouldValidate: false });
    setValue("acsnValue", code, { shouldValidate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = () => {
    const next = srSeq + 1;
    setSrSeq(next);
    const code = buildSRCode(next);
    setValue("identifierValue", code, { shouldValidate: false });
    setValue("acsnValue", code, { shouldValidate: false });
  };

  // Auto-fill procedure fields saat preset berubah
  useEffect(() => {
    if (!procedurePreset || procedurePreset === "custom") return;
    const preset = IMAGING_PRESETS[procedurePreset as ImagingPresetKey];
    if (!preset) return;
    setValue("loincCode", preset.loinc.code, { shouldValidate: false });
    setValue("loincDisplay", preset.loinc.display, { shouldValidate: false });
    setValue("kptlCode", preset.kptl.code, { shouldValidate: false });
    setValue("kptlDisplay", preset.kptl.display, { shouldValidate: false });
    setValue("procedureText", preset.text, { shouldValidate: false });
    setValue("modalityCode", preset.modalityCode, { shouldValidate: false });
    // Sync body site juga
    setValue("bodySitePreset", procedurePreset, { shouldValidate: false });
    setValue("bodySiteCode", preset.bodySite.code, { shouldValidate: false });
    setValue("bodySiteDisplay", preset.bodySite.display, {
      shouldValidate: false,
    });
  }, [procedurePreset, setValue]);

  // Auto-fill diagnosis saat preset berubah
  useEffect(() => {
    if (
      !diagnosisPreset ||
      diagnosisPreset === "none" ||
      diagnosisPreset === "custom"
    )
      return;
    const preset = ICD10_PRESETS[diagnosisPreset as Icd10PresetKey];
    if (!preset) return;
    setValue("diagnosisCode", preset.code, { shouldValidate: false });
    setValue("diagnosisDisplay", preset.display, { shouldValidate: false });
  }, [diagnosisPreset, setValue]);

  /**
   * Bangun payload FHIR R4 dari nilai form yang sudah tervalidasi.
   */
  const buildPayload = (
    data: ServiceRequestFormValues,
  ): ServiceRequestPayload => {
    const supportingInfo: Array<{ reference: string }> = [];
    if (data.observationId?.trim()) {
      supportingInfo.push({
        reference: `Observation/${data.observationId.trim()}`,
      });
    }
    if (data.allergyId?.trim()) {
      supportingInfo.push({
        reference: `AllergyIntolerance/${data.allergyId.trim()}`,
      });
    }
    if (data.procedureId?.trim()) {
      supportingInfo.push({
        reference: `Procedure/${data.procedureId.trim()}`,
      });
    }

    const hasBodySite =
      data.bodySitePreset !== "none" &&
      data.bodySiteCode?.trim() &&
      data.bodySiteDisplay?.trim();

    const hasDiagnosis =
      data.diagnosisPreset !== "none" &&
      data.diagnosisCode?.trim() &&
      data.diagnosisDisplay?.trim();

    return {
      resourceType: "ServiceRequest",

      identifier: [
        {
          system: `http://sys-ids.kemkes.go.id/servicerequest/${orgId}`,
          value: data.identifierValue,
        },
        {
          use: "usual",
          type: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                code: "ACSN",
              },
            ],
          },
          system: `http://sys-ids.kemkes.go.id/acsn/${orgId}`,
          value: data.acsnValue,
        },
      ],

      status: data.status,
      intent: data.intent,
      priority: data.priority,

      category: [
        {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "363679005",
              display: "Imaging",
            },
          ],
        },
      ],

      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: data.loincCode,
            display: data.loincDisplay,
          },
          {
            system: "http://terminology.kemkes.go.id/CodeSystem/kptl",
            code: data.kptlCode,
            display: data.kptlDisplay,
          },
        ],
        text: data.procedureText,
      },

      orderDetail: [
        {
          coding: [
            {
              system: "http://dicom.nema.org/resources/ontology/DCM",
              code: data.modalityCode,
            },
          ],
          text: `Modality Code: ${data.modalityCode}`,
        },
        {
          coding: [
            {
              system: "http://sys-ids.kemkes.go.id/ae-title",
              display: data.aeTitleDisplay,
            },
          ],
        },
      ],

      subject: { reference: `Patient/${data.patientId}` },
      encounter: { reference: `Encounter/${data.encounterId}` },

      occurrenceDateTime: new Date(data.occurrenceDateTime).toISOString(),
      authoredOn: new Date(data.authoredOn).toISOString(),

      requester: {
        reference: `Practitioner/${data.requesterId}`,
        display: data.requesterDisplay,
      },

      performer: [
        {
          reference: `Practitioner/${data.performerId}`,
          display: data.performerDisplay,
        },
      ],

      ...(hasBodySite
        ? {
            bodySite: [
              {
                coding: [
                  {
                    system: "http://snomed.info/sct",
                    code: data.bodySiteCode!,
                    display: data.bodySiteDisplay!,
                  },
                ],
              },
            ],
          }
        : {}),

      ...(hasDiagnosis
        ? {
            reasonCode: [
              {
                coding: [
                  {
                    system: "http://hl7.org/fhir/sid/icd-10",
                    code: data.diagnosisCode!,
                    display: data.diagnosisDisplay!,
                  },
                ],
              },
            ],
          }
        : {}),

      ...(supportingInfo.length > 0 ? { supportingInfo } : {}),
    };
  };

  const onValidForm = (data: ServiceRequestFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.serviceRequestId || undefined : undefined,
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
    onSubmit({ payload: parsed as ServiceRequestPayload });
  };

  const syncRaw = () => {
    const values = getValues();
    try {
      const preview = buildPayload(values);
      setRawJson(safeJsonStringify(preview));
    } catch {
      setRawJson(safeJsonStringify(values));
    }
  };

  const showBodySiteFields = watch("bodySitePreset") !== "none";

  const showDiagnosisFields = watch("diagnosisPreset") !== "none";

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
                label="ID ServiceRequest"
                required
                error={errors.serviceRequestId?.message}
              >
                <input
                  {...register("serviceRequestId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.serviceRequestId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          {/* Identifier lokal */}
          <Section title="Identifier Lokal">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Nomor ServiceRequest"
                required
                hint="Nomor lokal dari sistem fasilitas"
                error={errors.identifierValue?.message}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="font-mono text-amber-700 truncate">
                      sys-ids/servicerequest/
                      <span className="font-bold text-amber-600">{orgId}</span>
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      {...register("identifierValue")}
                      type="text"
                      placeholder="RAD2610420001"
                      className={`${ic(!!errors.identifierValue)} font-mono flex-1`}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={handleGenerate}
                      title="Generate ulang nomor"
                      className="shrink-0 px-2 rounded border border-amber-300 bg-amber-50 text-amber-700 text-xs hover:bg-amber-100 active:scale-95 transition"
                    >
                      ↺
                    </button>
                  </div>
                </div>
              </Field>

              <Field
                label="Nomor ACSN"
                required
                hint="Accession Number"
                error={errors.acsnValue?.message}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="font-mono text-violet-700 truncate">
                      sys-ids/acsn/
                      <span className="font-bold text-violet-600">{orgId}</span>
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      {...register("acsnValue")}
                      type="text"
                      placeholder="RAD2610420001"
                      className={`${ic(!!errors.acsnValue)} font-mono flex-1`}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={handleGenerate}
                      title="Generate ulang nomor"
                      className="shrink-0 px-2 rounded border border-violet-300 bg-violet-50 text-violet-700 text-xs hover:bg-violet-100 active:scale-95 transition"
                    >
                      ↺
                    </button>
                  </div>
                </div>
              </Field>
            </div>
          </Section>

          {/* Status, Intent, Prioritas */}
          <Section title="Status & Intent">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Status" required error={errors.status?.message}>
                <select {...register("status")} className={ic(!!errors.status)}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="on-hold">On Hold</option>
                  <option value="revoked">Revoked</option>
                  <option value="completed">Completed</option>
                  <option value="entered-in-error">Entered in Error</option>
                  <option value="unknown">Unknown</option>
                </select>
              </Field>

              <Field label="Intent" required error={errors.intent?.message}>
                <select {...register("intent")} className={ic(!!errors.intent)}>
                  {SERVICE_REQUEST_INTENT_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Prioritas"
                required
                error={errors.priority?.message}
              >
                <select
                  {...register("priority")}
                  className={ic(!!errors.priority)}
                >
                  <option value="routine">Routine — Rutin</option>
                  <option value="urgent">Urgent — Mendesak</option>
                  <option value="asap">ASAP — Sesegera Mungkin</option>
                  <option value="stat">STAT — Segera</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* Prosedur Radiologi */}
          <Section title="Prosedur Radiologi">
            <Field
              label="Preset Prosedur"
              hint="Pilih preset untuk auto-isi kode LOINC, KPTL & Modalitas"
              error={errors.procedurePreset?.message}
            >
              <select
                {...register("procedurePreset")}
                className={ic(!!errors.procedurePreset)}
              >
                {(Object.keys(IMAGING_PRESETS) as ImagingPresetKey[]).map(
                  (key) => (
                    <option key={key} value={key}>
                      {IMAGING_PRESETS[key].label}
                    </option>
                  ),
                )}
              </select>
            </Field>

            {/* Kode LOINC */}
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
              <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">
                LOINC (Internasional)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Kode LOINC"
                  required
                  error={errors.loincCode?.message}
                >
                  <input
                    {...register("loincCode")}
                    type="text"
                    placeholder="38036-0"
                    className={`${ic(!!errors.loincCode)} font-mono`}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Nama LOINC"
                  required
                  error={errors.loincDisplay?.message}
                >
                  <input
                    {...register("loincDisplay")}
                    type="text"
                    placeholder="US Kidney"
                    className={ic(!!errors.loincDisplay)}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>

            {/* Kode KPTL */}
            <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-100 space-y-3">
              <span className="text-[10px] font-bold text-teal-500 uppercase tracking-wider">
                KPTL (Tarif Nasional Satu Sehat)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Kode KPTL"
                  required
                  error={errors.kptlCode?.message}
                >
                  <input
                    {...register("kptlCode")}
                    type="text"
                    placeholder="31537"
                    className={`${ic(!!errors.kptlCode)} font-mono`}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Nama KPTL"
                  required
                  error={errors.kptlDisplay?.message}
                >
                  <input
                    {...register("kptlDisplay")}
                    type="text"
                    placeholder="USG Ginjal"
                    className={ic(!!errors.kptlDisplay)}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>

            <Field
              label="Nama Prosedur"
              required
              error={errors.procedureText?.message}
            >
              <input
                {...register("procedureText")}
                type="text"
                placeholder="Pemeriksaan USG Ginjal"
                className={ic(!!errors.procedureText)}
                autoComplete="off"
              />
            </Field>
          </Section>

          {/* Modalitas & AE Title */}
          <Section title="Modalitas & Perangkat">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Modalitas"
                required
                hint="DICOM modality code"
                error={errors.modalityCode?.message}
              >
                <select
                  {...register("modalityCode")}
                  className={ic(!!errors.modalityCode)}
                >
                  {MODALITY_CODES.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="AE Title"
                required
                hint="ID perangkat radiologi"
                error={errors.aeTitleDisplay?.message}
              >
                <input
                  {...register("aeTitleDisplay")}
                  type="text"
                  placeholder="US0001"
                  className={`${ic(!!errors.aeTitleDisplay)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </div>
          </Section>

          {/* Pasien & Encounter */}
          <Section title="Pasien & Kunjungan">
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
                    placeholder="100000030009"
                    className={`${ic(!!errors.patientId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>

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
                    placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                    className={`${ic(!!errors.encounterId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
            </div>
          </Section>

          {/* Tanggal */}
          <Section title="Waktu">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Tanggal Order"
                required
                hint="authoredOn"
                error={errors.authoredOn?.message}
              >
                <input
                  {...register("authoredOn")}
                  type="datetime-local"
                  className={ic(!!errors.authoredOn)}
                />
              </Field>

              <Field
                label="Tanggal Pemeriksaan"
                required
                hint="occurrenceDateTime"
                error={errors.occurrenceDateTime?.message}
              >
                <input
                  {...register("occurrenceDateTime")}
                  type="datetime-local"
                  className={ic(!!errors.occurrenceDateTime)}
                />
              </Field>
            </div>
          </Section>

          {/* Dokter Pengirim */}
          <Section title="Dokter Pengirim (Requester)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Practitioner ID"
                required
                error={errors.requesterId?.message}
              >
                <div className="flex">
                  <RefPrefix label="Practitioner/" />
                  <input
                    {...register("requesterId")}
                    type="text"
                    placeholder="N10000001"
                    className={`${ic(!!errors.requesterId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>

              <Field
                label="Nama Dokter"
                required
                error={errors.requesterDisplay?.message}
              >
                <input
                  {...register("requesterDisplay")}
                  type="text"
                  placeholder="dr. Nama Dokter, Sp.PD"
                  className={ic(!!errors.requesterDisplay)}
                />
              </Field>
            </div>
          </Section>

          {/* Radiolog */}
          <Section title="Radiolog (Performer)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Practitioner ID"
                required
                error={errors.performerId?.message}
              >
                <div className="flex">
                  <RefPrefix label="Practitioner/" />
                  <input
                    {...register("performerId")}
                    type="text"
                    placeholder="N10000002"
                    className={`${ic(!!errors.performerId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>

              <Field
                label="Nama Radiolog"
                required
                error={errors.performerDisplay?.message}
              >
                <input
                  {...register("performerDisplay")}
                  type="text"
                  placeholder="dr. Radiolog, Sp.Rad"
                  className={ic(!!errors.performerDisplay)}
                />
              </Field>
            </div>
          </Section>

          {/* Body Site */}
          <Section title="Area Tubuh (bodySite)">
            <Field
              label="Preset Area Tubuh"
              hint="none = tidak disertakan dalam payload"
              error={errors.bodySitePreset?.message}
            >
              <select
                {...register("bodySitePreset")}
                className={ic(!!errors.bodySitePreset)}
                onChange={(e) => {
                  const key = e.target.value as
                    | ImagingPresetKey
                    | "none"
                    | "custom";
                  if (
                    key !== "none" &&
                    key !== "custom" &&
                    key in IMAGING_PRESETS
                  ) {
                    const preset = IMAGING_PRESETS[key as ImagingPresetKey];
                    setValue("bodySiteCode", preset.bodySite.code, {
                      shouldValidate: false,
                    });
                    setValue("bodySiteDisplay", preset.bodySite.display, {
                      shouldValidate: false,
                    });
                  }
                  if (key === "none" || key === "custom") {
                    setValue("bodySiteCode", "", { shouldValidate: false });
                    setValue("bodySiteDisplay", "", { shouldValidate: false });
                  }
                  register("bodySitePreset").onChange(e);
                }}
              >
                <option value="none">— Tidak disertakan —</option>
                {(Object.keys(IMAGING_PRESETS) as ImagingPresetKey[])
                  .filter((k) => k !== "custom")
                  .map((key) => (
                    <option key={key} value={key}>
                      {IMAGING_PRESETS[key].label} (
                      {IMAGING_PRESETS[key].bodySite.display})
                    </option>
                  ))}
                <option value="custom">Custom / Lainnya</option>
              </select>
            </Field>

            {showBodySiteFields && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Kode SNOMED"
                  hint="bodySite.coding.code"
                  error={errors.bodySiteCode?.message}
                >
                  <input
                    {...register("bodySiteCode")}
                    type="text"
                    placeholder="64033007"
                    className={`${ic(!!errors.bodySiteCode)} font-mono`}
                    autoComplete="off"
                  />
                </Field>

                <Field
                  label="Nama Area Tubuh"
                  error={errors.bodySiteDisplay?.message}
                >
                  <input
                    {...register("bodySiteDisplay")}
                    type="text"
                    placeholder="Kidney structure"
                    className={ic(!!errors.bodySiteDisplay)}
                    autoComplete="off"
                  />
                </Field>
              </div>
            )}
          </Section>

          {/* Diagnosis / Reason Code */}
          <Section title="Diagnosis (reasonCode — ICD-10)">
            <Field
              label="Preset Diagnosis"
              hint="none = tidak disertakan dalam payload"
              error={errors.diagnosisPreset?.message}
            >
              <select
                {...register("diagnosisPreset")}
                className={ic(!!errors.diagnosisPreset)}
              >
                <option value="none">— Tidak disertakan —</option>
                {(Object.keys(ICD10_PRESETS) as Icd10PresetKey[])
                  .filter((k) => k !== "none" && k !== "custom")
                  .map((key) => (
                    <option key={key} value={key}>
                      {ICD10_PRESETS[key].code} — {ICD10_PRESETS[key].display}
                    </option>
                  ))}
                <option value="custom">Custom / Kode ICD-10 Lainnya</option>
              </select>
            </Field>

            {showDiagnosisFields && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Kode ICD-10"
                  hint="reasonCode.coding.code"
                  error={errors.diagnosisCode?.message}
                >
                  <input
                    {...register("diagnosisCode")}
                    type="text"
                    placeholder="N18.5"
                    className={`${ic(!!errors.diagnosisCode)} font-mono`}
                    autoComplete="off"
                  />
                </Field>

                <Field
                  label="Nama Diagnosis"
                  error={errors.diagnosisDisplay?.message}
                >
                  <input
                    {...register("diagnosisDisplay")}
                    type="text"
                    placeholder="Chronic kidney disease, stage 5"
                    className={ic(!!errors.diagnosisDisplay)}
                    autoComplete="off"
                  />
                </Field>
              </div>
            )}
          </Section>

          {/* Supporting Info */}
          <Section title="Informasi Pendukung (Opsional)">
            <p className="text-[11px] text-slate-400">
              Isi jika ada referensi pendukung. Kosongkan untuk diabaikan.
            </p>

            <Field
              label="Observation ID"
              hint="Hasil observasi terkait"
              error={errors.observationId?.message}
            >
              <div className="flex">
                <RefPrefix label="Observation/" />
                <input
                  {...register("observationId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.observationId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>

            <Field
              label="AllergyIntolerance ID"
              hint="Alergi pasien terkait"
              error={errors.allergyId?.message}
            >
              <div className="flex">
                <RefPrefix label="AllergyIntolerance/" />
                <input
                  {...register("allergyId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.allergyId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>

            <Field
              label="Procedure ID"
              hint="Prosedur terkait"
              error={errors.procedureId?.message}
            >
              <div className="flex">
                <RefPrefix label="Procedure/" />
                <input
                  {...register("procedureId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.procedureId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
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
              rows={26}
              placeholder='{"resourceType": "ServiceRequest", ...}'
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
                rawError
                  ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                  : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
              }`}
              spellCheck={false}
              aria-label="Raw JSON payload ServiceRequest"
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
                  /ServiceRequest
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
// Komponen utama
// ─────────────────────────────────────────────

export default function ServiceRequestForm({
  method,
  loading,
  onSubmit,
  autofillRaw,
}: ServiceRequestFormProps) {
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
      autofillRaw={autofillRaw}
    />
  );
}
