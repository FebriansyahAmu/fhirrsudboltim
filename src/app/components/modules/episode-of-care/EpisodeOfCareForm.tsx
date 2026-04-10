/**
 * components/modules/episode-of-care/EpisodeOfCareForm.tsx
 *
 * Form input untuk resource EpisodeOfCare.
 * Mendukung dua mode: Form (field-by-field) dan Raw JSON.
 *
 * Pola konsisten dengan AllergyIntoleranceForm.tsx dan ClinicalImpressionForm.tsx.
 *
 * Catatan khusus EpisodeOfCare:
 *   - statusHistory dan diagnosis adalah array dinamis yang bisa ditambah/hapus
 *     menggunakan react-hook-form `useFieldArray`.
 *   - managingOrganization menggunakan Org_id dari env (tidak diinput user).
 *   - careManager ID bisa berupa UUID atau format "N10000001".
 *   - period end opsional — boleh kosong jika episode masih berjalan.
 */

"use client";

import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useState } from "react";

import {
  episodeOfCareFormSchema,
  episodeOfCareGetSchema,
  type EpisodeOfCareFormValues,
  type EpisodeOfCareGetValues,
} from "@/app/lib/schemas/episode-of-care.schema";
import type {
  EpisodeOfCarePayload,
  EpisodeOfCareStatus,
  EpisodeOfCareStatusHistory,
  EpisodeOfCareDiagnosis,
} from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface EpisodeOfCareFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: EpisodeOfCarePayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
}

// ─────────────────────────────────────────────
// UI Primitives — konsisten dengan modul lain
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
// Submit Button
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
          /EpisodeOfCare
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// Diagnosis Role options — dari HL7 diagnosis-role CodeSystem
// ─────────────────────────────────────────────

const DIAGNOSIS_ROLE_OPTIONS = [
  { code: "AD", display: "Admission Diagnosis" },
  { code: "DD", display: "Discharged Diagnosis" },
  { code: "CC", display: "Chief Complaint" },
  { code: "CM", display: "Comorbidity Diagnosis" },
  { code: "pre-op", display: "Pre-op Diagnosis" },
  { code: "post-op", display: "Post-op Diagnosis" },
  { code: "billing", display: "Billing" },
];

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
  } = useForm<EpisodeOfCareGetValues>({
    resolver: yupResolver(
      episodeOfCareGetSchema,
    ) as unknown as Resolver<EpisodeOfCareGetValues>,
  });

  const onValid = (data: EpisodeOfCareGetValues) => {
    onSubmit({
      resourceId: data.episodeOfCareId || undefined,
      queryParams: {
        patient: data.patientId ? `Patient/${data.patientId}` : undefined,
        status: data.status || undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID EpisodeOfCare"
          hint="Opsional — kosongkan untuk list"
          error={errors.episodeOfCareId?.message}
        >
          <input
            {...register("episodeOfCareId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${ic(!!errors.episodeOfCareId)} font-mono`}
            autoComplete="off"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Patient ID" error={errors.patientId?.message}>
            <input
              {...register("patientId")}
              type="text"
              placeholder="UUID pasien"
              className={`${ic(!!errors.patientId)} font-mono`}
              autoComplete="off"
            />
          </Field>
          <Field label="Status" error={errors.status?.message}>
            <select {...register("status")} className={ic(!!errors.status)}>
              <option value="">Semua status</option>
              <option value="planned">Planned</option>
              <option value="waitlist">Waitlist</option>
              <option value="active">Active</option>
              <option value="onhold">On Hold</option>
              <option value="finished">Finished</option>
              <option value="cancelled">Cancelled</option>
              <option value="entered-in-error">Entered in Error</option>
            </select>
          </Field>
        </div>
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
}: {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload: EpisodeOfCarePayload;
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
    control,
    formState: { errors },
  } = useForm<EpisodeOfCareFormValues>({
    resolver: yupResolver(
      episodeOfCareFormSchema,
    ) as unknown as Resolver<EpisodeOfCareFormValues>,
    defaultValues: {
      episodeOfCareId: "",
      identifierValue: "EOC12345",
      status: "finished",
      // statusHistory: dua entri default sesuai payload contoh
      statusHistory: [
        {
          status: "active",
          periodStart: "2022-01-01",
          periodEnd: "2022-06-30",
        },
        {
          status: "finished",
          periodStart: "2022-06-30",
          periodEnd: "2022-06-30",
        },
      ],
      typeCode: "TB-SO",
      typeDisplay: "Tuberkulosis Sensitif Obat",
      // diagnosis: satu entri default
      diagnosis: [
        {
          conditionId: "",
          conditionDisplay:
            "Tuberculosis of lung, confirmed by sputum microscopy with or without culture",
          roleCode: "DD",
          roleDisplay: "Discharged Diagnosis",
          rank: 1,
        },
      ],
      patientId: "",
      patientDisplay: "",
      periodStart: "2012-01-01",
      periodEnd: "2012-06-30",
      careManagerId: "",
      careManagerDisplay: "",
    },
  });

  /**
   * useFieldArray — mengelola statusHistory sebagai array dinamis.
   * Setiap append/remove memicu re-render hanya pada field yang berubah.
   */
  const {
    fields: statusHistoryFields,
    append: appendStatus,
    remove: removeStatus,
  } = useFieldArray({ control, name: "statusHistory" });

  /**
   * useFieldArray — mengelola diagnosis sebagai array dinamis.
   */
  const {
    fields: diagnosisFields,
    append: appendDiagnosis,
    remove: removeDiagnosis,
  } = useFieldArray({ control, name: "diagnosis" });

  /** Bangun payload FHIR R4 dari nilai form yang sudah tervalidasi */
  const buildPayload = (
    data: EpisodeOfCareFormValues,
  ): EpisodeOfCarePayload => {
    const orgId = process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET";

    // Map statusHistory dari form values ke format FHIR
    const statusHistory: EpisodeOfCareStatusHistory[] = (
      data.statusHistory ?? []
    ).map((sh) => ({
      status: sh.status as EpisodeOfCareStatus,
      period: {
        start: sh.periodStart,
        end: sh.periodEnd || undefined,
      },
    }));

    // Map diagnosis dari form values ke format FHIR
    const diagnosis: EpisodeOfCareDiagnosis[] = (data.diagnosis ?? []).map(
      (d) => ({
        condition: {
          reference: `Condition/${d.conditionId}`,
          display: d.conditionDisplay,
        },
        role: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/diagnosis-role",
              code: d.roleCode,
              display: d.roleDisplay,
            },
          ],
        },
        rank: d.rank,
      }),
    );

    return {
      resourceType: "EpisodeOfCare",
      identifier: [
        {
          system: `http://sys-ids.kemkes.go.id/episode-of-care/${orgId}`,
          value: data.identifierValue,
        },
      ],
      status: data.status as EpisodeOfCareStatus,
      statusHistory,
      type: [
        {
          coding: [
            {
              system:
                "http://terminology.kemkes.go.id/CodeSystem/episodeofcare-type",
              code: data.typeCode,
              display: data.typeDisplay,
            },
          ],
        },
      ],
      diagnosis,
      patient: {
        reference: `Patient/${data.patientId}`,
        display: data.patientDisplay,
      },
      managingOrganization: {
        reference: `Organization/${orgId}`,
      },
      period: {
        start: data.periodStart,
        end: data.periodEnd || undefined,
      },
      careManager: {
        reference: `Practitioner/${data.careManagerId}`,
        display: data.careManagerDisplay || undefined,
      },
    };
  };

  const onValidForm = (data: EpisodeOfCareFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.episodeOfCareId || undefined : undefined,
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
    onSubmit({ payload: parsed as EpisodeOfCarePayload });
  };

  const syncRaw = () => {
    const values = getValues();
    // Preview dari nilai form saat ini (sebelum validasi)
    setRawJson(
      safeJsonStringify(buildPayload(values as EpisodeOfCareFormValues)),
    );
  };

  // Error accessor shorthand untuk nested array
  const shErrors = errors.statusHistory;
  const dgErrors = errors.diagnosis;

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
          {/* ID resource — hanya PUT/PATCH */}
          {needsId && (
            <Section title="Identifikasi">
              <Field
                label="ID EpisodeOfCare"
                required
                error={errors.episodeOfCareId?.message}
              >
                <input
                  {...register("episodeOfCareId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.episodeOfCareId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          {/* Identifier + Status */}
          <Section title="Identifier & Status">
            <Field
              label="Nomor Identifier"
              required
              hint="Nomor episode dari sistem fasilitas"
              error={errors.identifierValue?.message}
            >
              <div className="flex">
                <span
                  className="flex items-center px-2.5 bg-amber-50 border border-r-0 border-amber-200 rounded-l-xl text-[10px] text-amber-600 font-mono whitespace-nowrap max-w-45 truncate"
                  title="sys-ids.kemkes.go.id/episode-of-care/{ORG_ID}"
                >
                  sys-ids.kemkes.go.id/episode-of-care/…
                </span>
                <input
                  {...register("identifierValue")}
                  type="text"
                  placeholder="EOC12345"
                  className={`${ic(!!errors.identifierValue)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>

            <Field
              label="Status Saat Ini"
              required
              error={errors.status?.message}
            >
              <select {...register("status")} className={ic(!!errors.status)}>
                <option value="planned">Planned</option>
                <option value="waitlist">Waitlist</option>
                <option value="active">Active</option>
                <option value="onhold">On Hold</option>
                <option value="finished">Finished</option>
                <option value="cancelled">Cancelled</option>
                <option value="entered-in-error">Entered in Error</option>
              </select>
            </Field>
          </Section>

          {/* Status History — array dinamis */}
          <Section title="Riwayat Status">
            <div className="space-y-3">
              {statusHistoryFields.map((field, index) => (
                <div
                  key={field.id}
                  className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-3"
                >
                  {/* Header baris */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Riwayat #{index + 1}
                    </span>
                    {/* Tombol hapus — nonaktif jika hanya 1 item (minimal 1 diperlukan) */}
                    <button
                      type="button"
                      onClick={() => removeStatus(index)}
                      disabled={statusHistoryFields.length <= 1}
                      className="text-[11px] text-red-400 hover:text-red-600 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      Hapus
                    </button>
                  </div>

                  <Field
                    label="Status"
                    required
                    error={shErrors?.[index]?.status?.message}
                  >
                    <select
                      {...register(`statusHistory.${index}.status`)}
                      className={ic(!!shErrors?.[index]?.status)}
                    >
                      <option value="planned">Planned</option>
                      <option value="waitlist">Waitlist</option>
                      <option value="active">Active</option>
                      <option value="onhold">On Hold</option>
                      <option value="finished">Finished</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="entered-in-error">Entered in Error</option>
                    </select>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Tanggal Mulai"
                      required
                      error={shErrors?.[index]?.periodStart?.message}
                    >
                      <input
                        {...register(`statusHistory.${index}.periodStart`)}
                        type="date"
                        className={ic(!!shErrors?.[index]?.periodStart)}
                      />
                    </Field>
                    <Field
                      label="Tanggal Akhir"
                      hint="Opsional"
                      error={shErrors?.[index]?.periodEnd?.message}
                    >
                      <input
                        {...register(`statusHistory.${index}.periodEnd`)}
                        type="date"
                        className={ic(!!shErrors?.[index]?.periodEnd)}
                      />
                    </Field>
                  </div>
                </div>
              ))}

              {/* Root-level error untuk array statusHistory */}
              {errors.statusHistory?.root?.message && (
                <p
                  className="flex items-center gap-1 text-[11px] text-red-600"
                  role="alert"
                >
                  <ErrorIcon />
                  {errors.statusHistory.root.message}
                </p>
              )}

              <button
                type="button"
                onClick={() =>
                  appendStatus({
                    status: "active",
                    periodStart: "",
                    periodEnd: "",
                  })
                }
                className="flex items-center gap-1.5 text-[12px] text-teal-600 hover:text-teal-800 font-semibold transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle
                    cx="7"
                    cy="7"
                    r="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M7 4V10M4 7H10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Tambah Riwayat Status
              </button>
            </div>
          </Section>

          {/* Tipe Episode */}
          <Section title="Tipe Episode">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Kode Tipe"
                required
                error={errors.typeCode?.message}
              >
                <input
                  {...register("typeCode")}
                  type="text"
                  placeholder="TB-SO"
                  className={`${ic(!!errors.typeCode)} font-mono`}
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Display Tipe"
                required
                error={errors.typeDisplay?.message}
              >
                <input
                  {...register("typeDisplay")}
                  type="text"
                  placeholder="Tuberkulosis Sensitif Obat"
                  className={ic(!!errors.typeDisplay)}
                />
              </Field>
            </div>
            <p className="text-[10px] text-slate-400">
              Sistem:
              http://terminology.kemkes.go.id/CodeSystem/episodeofcare-type
            </p>
          </Section>

          {/* Diagnosis — array dinamis */}
          <Section title="Diagnosis">
            <div className="space-y-3">
              {diagnosisFields.map((field, index) => (
                <div
                  key={field.id}
                  className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Diagnosis #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDiagnosis(index)}
                      disabled={diagnosisFields.length <= 1}
                      className="text-[11px] text-red-400 hover:text-red-600 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      Hapus
                    </button>
                  </div>

                  <Field
                    label="Condition ID"
                    required
                    error={dgErrors?.[index]?.conditionId?.message}
                  >
                    <div className="flex">
                      <RefPrefix label="Condition/" />
                      <input
                        {...register(`diagnosis.${index}.conditionId`)}
                        type="text"
                        placeholder="UUID"
                        className={`${ic(!!dgErrors?.[index]?.conditionId)} rounded-l-none border-l-0 font-mono`}
                        autoComplete="off"
                      />
                    </div>
                  </Field>

                  <Field
                    label="Display Kondisi"
                    required
                    error={dgErrors?.[index]?.conditionDisplay?.message}
                  >
                    <input
                      {...register(`diagnosis.${index}.conditionDisplay`)}
                      type="text"
                      placeholder="Nama diagnosis / kondisi"
                      className={ic(!!dgErrors?.[index]?.conditionDisplay)}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field
                      label="Kode Peran"
                      required
                      error={dgErrors?.[index]?.roleCode?.message}
                    >
                      <select
                        {...register(`diagnosis.${index}.roleCode`)}
                        className={ic(!!dgErrors?.[index]?.roleCode)}
                        onChange={(e) => {
                          // Auto-isi roleDisplay berdasarkan kode yang dipilih
                          const found = DIAGNOSIS_ROLE_OPTIONS.find(
                            (o) => o.code === e.target.value,
                          );
                          if (found) {
                            // register tidak expose setValue — gunakan native approach
                            const el = e.target
                              .closest("form")
                              ?.querySelector(
                                `[name="diagnosis.${index}.roleDisplay"]`,
                              ) as HTMLInputElement | null;
                            if (el) el.value = found.display;
                          }
                        }}
                      >
                        {DIAGNOSIS_ROLE_OPTIONS.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.code} — {o.display}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="Display Peran"
                      required
                      error={dgErrors?.[index]?.roleDisplay?.message}
                    >
                      <input
                        {...register(`diagnosis.${index}.roleDisplay`)}
                        type="text"
                        placeholder="Discharged Diagnosis"
                        className={ic(!!dgErrors?.[index]?.roleDisplay)}
                      />
                    </Field>

                    <Field
                      label="Rank"
                      required
                      hint="1 = primer"
                      error={dgErrors?.[index]?.rank?.message}
                    >
                      <input
                        {...register(`diagnosis.${index}.rank`, {
                          valueAsNumber: true,
                        })}
                        type="number"
                        min={1}
                        max={99}
                        placeholder="1"
                        className={ic(!!dgErrors?.[index]?.rank)}
                      />
                    </Field>
                  </div>
                </div>
              ))}

              {errors.diagnosis?.root?.message && (
                <p
                  className="flex items-center gap-1 text-[11px] text-red-600"
                  role="alert"
                >
                  <ErrorIcon />
                  {errors.diagnosis.root.message}
                </p>
              )}

              <button
                type="button"
                onClick={() =>
                  appendDiagnosis({
                    conditionId: "",
                    conditionDisplay: "",
                    roleCode: "DD",
                    roleDisplay: "Discharged Diagnosis",
                    rank: diagnosisFields.length + 1,
                  })
                }
                className="flex items-center gap-1.5 text-[12px] text-teal-600 hover:text-teal-800 font-semibold transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle
                    cx="7"
                    cy="7"
                    r="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M7 4V10M4 7H10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Tambah Diagnosis
              </button>
            </div>
          </Section>

          {/* Referensi Pasien */}
          <Section title="Pasien">
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
                    className={`${ic(!!errors.patientId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
              <Field
                label="Nama Pasien"
                required
                error={errors.patientDisplay?.message}
              >
                <input
                  {...register("patientDisplay")}
                  type="text"
                  placeholder="Nama lengkap pasien"
                  className={ic(!!errors.patientDisplay)}
                />
              </Field>
            </div>
          </Section>

          {/* Periode & Care Manager */}
          <Section title="Periode & Care Manager">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Periode Mulai"
                required
                error={errors.periodStart?.message}
              >
                <input
                  {...register("periodStart")}
                  type="date"
                  className={ic(!!errors.periodStart)}
                />
              </Field>
              <Field
                label="Periode Akhir"
                hint="Opsional"
                error={errors.periodEnd?.message}
              >
                <input
                  {...register("periodEnd")}
                  type="date"
                  className={ic(!!errors.periodEnd)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Care Manager ID"
                required
                hint="UUID atau N10000001"
                error={errors.careManagerId?.message}
              >
                <div className="flex">
                  <RefPrefix label="Practitioner/" />
                  <input
                    {...register("careManagerId")}
                    type="text"
                    placeholder="UUID atau N10000001"
                    className={`${ic(!!errors.careManagerId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
              <Field
                label="Nama Care Manager"
                hint="Opsional"
                error={errors.careManagerDisplay?.message}
              >
                <input
                  {...register("careManagerDisplay")}
                  type="text"
                  placeholder="Dokter Bronsig"
                  className={ic(!!errors.careManagerDisplay)}
                />
              </Field>
            </div>

            {/* Info managingOrganization — otomatis dari env */}
            <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="shrink-0 mt-0.5 text-blue-500"
              >
                <circle
                  cx="7"
                  cy="7"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path
                  d="M7 6V10"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
                <circle cx="7" cy="4.5" r="0.6" fill="currentColor" />
              </svg>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                <span className="font-semibold">managingOrganization</span>{" "}
                diisi otomatis dari{" "}
                <code className="font-mono bg-blue-100 px-1 rounded">
                  NEXT_PUBLIC_SATU_SEHAT_ORG_ID
                </code>
              </p>
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
              rows={22}
              placeholder='{"resourceType": "EpisodeOfCare", ...}'
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
                rawError
                  ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                  : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
              }`}
              spellCheck={false}
              aria-label="Raw JSON payload EpisodeOfCare"
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
                  /EpisodeOfCare
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

export default function EpisodeOfCareForm({
  method,
  loading,
  onSubmit,
}: EpisodeOfCareFormProps) {
  if (method === "GET") {
    return <GetForm loading={loading} onSubmit={(p) => onSubmit(p)} />;
  }
  return (
    <MutationForm
      method={method}
      loading={loading}
      onSubmit={(p) => onSubmit(p)}
    />
  );
}
