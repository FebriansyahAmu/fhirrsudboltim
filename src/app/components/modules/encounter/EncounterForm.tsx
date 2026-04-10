/**
 * components/modules/encounter/EncounterForm.tsx
 *
 * Form input untuk resource Encounter.
 * Mendukung dua mode:
 *   - Form : field-by-field dengan validasi Yup + react-hook-form
 *   - Raw JSON : edit payload langsung
 *
 * Pola konsisten dengan AllergyIntoleranceForm.tsx.
 *
 * Catatan khusus Encounter:
 *   - `identifier.system` dan `serviceProvider.reference` menggunakan Org_id dari env
 *   - `statusHistory` di-generate otomatis dari status + periodStart (tidak diinput user)
 *   - `participant` form hanya mendukung 1 praktisi — gunakan Raw JSON untuk lebih
 *   - `class` display di-generate otomatis dari kode yang dipilih
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useState } from "react";

import {
  encounterFormSchema,
  encounterGetSchema,
  ENCOUNTER_CLASS_DISPLAY,
  PARTICIPANT_TYPE_DISPLAY,
  type EncounterFormValues,
  type EncounterGetValues,
} from "@/app/lib/schemas/encounter.schema";
import type { EncounterPayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface EncounterFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: EncounterPayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
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
          <span>/Encounter</span>
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
  } = useForm<EncounterGetValues>({
    resolver: yupResolver(
      encounterGetSchema,
    ) as unknown as Resolver<EncounterGetValues>,
  });

  const onValid = (data: EncounterGetValues) => {
    onSubmit({
      resourceId: data.encounterId || undefined,
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
          label="ID Encounter"
          hint="Opsional — kosongkan untuk list"
          error={errors.encounterId?.message}
        >
          <input
            {...register("encounterId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${ic(!!errors.encounterId)} font-mono`}
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
            <option value="planned">Planned</option>
            <option value="arrived">Arrived</option>
            <option value="triaged">Triaged</option>
            <option value="in-progress">In Progress</option>
            <option value="onleave">On Leave</option>
            <option value="finished">Finished</option>
            <option value="cancelled">Cancelled</option>
            <option value="entered-in-error">Entered in Error</option>
          </select>
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
}: {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload: EncounterPayload;
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
    setValue,
    getValues,
    formState: { errors },
  } = useForm<EncounterFormValues>({
    resolver: yupResolver(
      encounterFormSchema,
    ) as unknown as Resolver<EncounterFormValues>,
    defaultValues: {
      encounterId: "",
      identifierValue: generateEncounterNumber(),
      status: "arrived",
      classCode: "AMB",
      patientId: "",
      patientDisplay: "",
      participantTypeCode: "ATND",
      practitionerId: "",
      practitionerDisplay: "",
      periodStart: new Date().toISOString().slice(0, 16),
      periodEnd: "",
      locationId: "",
      locationDisplay: "",
    },
  });

  /**
   * Bangun payload FHIR R4 dari nilai form yang sudah tervalidasi.
   *
   * Catatan:
   * - `serviceProvider` menggunakan Org_id dari env (tidak diinput user)
   * - `statusHistory` di-generate dari status + periodStart
   * - `class.display` di-generate dari kode yang dipilih
   */
  const buildPayload = (data: EncounterFormValues): EncounterPayload => {
    const orgId = process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET";

    const periodStart = new Date(data.periodStart).toISOString();
    const periodEnd = data.periodEnd
      ? new Date(data.periodEnd).toISOString()
      : undefined;

    return {
      resourceType: "Encounter",

      identifier: [
        {
          system: `http://sys-ids.kemkes.go.id/encounter/${orgId}`,
          value: data.identifierValue,
        },
      ],

      status: data.status,

      class: {
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        code: data.classCode,
        display: ENCOUNTER_CLASS_DISPLAY[data.classCode],
      },

      subject: {
        reference: `Patient/${data.patientId}`,
        display: data.patientDisplay,
      },

      participant: [
        {
          type: [
            {
              coding: [
                {
                  system:
                    "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                  code: data.participantTypeCode,
                  display: PARTICIPANT_TYPE_DISPLAY[data.participantTypeCode],
                },
              ],
            },
          ],
          individual: {
            reference: `Practitioner/${data.practitionerId}`,
            display: data.practitionerDisplay,
          },
        },
      ],

      period: {
        start: periodStart,
        ...(periodEnd ? { end: periodEnd } : {}),
      },

      location: [
        {
          location: {
            reference: `Location/${data.locationId}`,
            display: data.locationDisplay,
          },
        },
      ],

      // statusHistory di-generate otomatis dari status dan period saat ini
      statusHistory: [
        {
          status: data.status,
          period: {
            start: periodStart,
            ...(periodEnd ? { end: periodEnd } : {}),
          },
        },
      ],

      serviceProvider: {
        reference: `Organization/${orgId}`,
      },
    };
  };

  const onValidForm = (data: EncounterFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.encounterId || undefined : undefined,
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
    onSubmit({ payload: parsed as EncounterPayload });
  };

  const syncRaw = () => {
    const values = getValues();
    const orgId = process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET";

    const preview = {
      resourceType: "Encounter",
      identifier: [
        {
          system: `http://sys-ids.kemkes.go.id/encounter/${orgId}`,
          value: values.identifierValue,
        },
      ],
      status: values.status,
      class: {
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        code: values.classCode,
        display: ENCOUNTER_CLASS_DISPLAY[values.classCode] ?? values.classCode,
      },
      subject: {
        reference: `Patient/${values.patientId}`,
        display: values.patientDisplay,
      },
      participant: [
        {
          type: [
            {
              coding: [
                {
                  system:
                    "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                  code: values.participantTypeCode,
                  display:
                    PARTICIPANT_TYPE_DISPLAY[values.participantTypeCode] ??
                    values.participantTypeCode,
                },
              ],
            },
          ],
          individual: {
            reference: `Practitioner/${values.practitionerId}`,
            display: values.practitionerDisplay,
          },
        },
      ],
      period: {
        start: values.periodStart,
        ...(values.periodEnd ? { end: values.periodEnd } : {}),
      },
      location: [
        {
          location: {
            reference: `Location/${values.locationId}`,
            display: values.locationDisplay,
          },
        },
      ],
      statusHistory: [
        {
          status: values.status,
          period: { start: values.periodStart },
        },
      ],
      serviceProvider: { reference: `Organization/${orgId}` },
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
                label="ID Encounter"
                required
                error={errors.encounterId?.message}
              >
                <input
                  {...register("encounterId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.encounterId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          {/* Identifier lokal */}
          <Section title="Identifier Lokal">
            <Field
              label="Nomor Encounter"
              required
              hint="Format YYMMDDNNNN — auto-generate berdasarkan tanggal + urutan"
              error={errors.identifierValue?.message}
            >
              <div className="flex">
                <span className="flex items-center px-2.5 bg-amber-50 border border-r-0 border-amber-200 rounded-l-xl text-[10px] text-amber-600 font-mono whitespace-nowrap max-w-40 truncate">
                  sys-ids/encounter/…
                </span>
                <input
                  {...register("identifierValue")}
                  type="text"
                  placeholder="2604110001"
                  className={`${ic(!!errors.identifierValue)} rounded-none border-l-0 border-r-0 font-mono`}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() =>
                    setValue("identifierValue", generateEncounterNumber(), {
                      shouldValidate: true,
                    })
                  }
                  title="Generate nomor encounter baru"
                  className="flex items-center px-2.5 bg-amber-50 hover:bg-amber-100 border border-l-0 border-amber-200 rounded-r-xl text-amber-600 hover:text-amber-800 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path
                      d="M2 6.5C2 4 4 2 6.5 2C8 2 9.4 2.7 10.3 3.8L11 5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M11 2V5H8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11 6.5C11 9 9 11 6.5 11C5 11 3.6 10.3 2.7 9.2L2 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </Field>
          </Section>

          {/* Status & Kelas */}
          <Section title="Status & Kelas Kunjungan">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Status" required error={errors.status?.message}>
                <select {...register("status")} className={ic(!!errors.status)}>
                  <option value="planned">Planned — Direncanakan</option>
                  <option value="arrived">Arrived — Tiba</option>
                  <option value="triaged">Triaged — Ditriage</option>
                  <option value="in-progress">In Progress — Berlangsung</option>
                  <option value="onleave">On Leave — Cuti/Keluar</option>
                  <option value="finished">Finished — Selesai</option>
                  <option value="cancelled">Cancelled — Dibatalkan</option>
                  <option value="entered-in-error">Entered in Error</option>
                </select>
              </Field>

              <Field
                label="Kelas Kunjungan"
                required
                hint="v3-ActCode"
                error={errors.classCode?.message}
              >
                <select
                  {...register("classCode")}
                  className={ic(!!errors.classCode)}
                >
                  <option value="AMB">AMB — Rawat Jalan</option>
                  <option value="IMP">IMP — Rawat Inap</option>
                  <option value="EMER">EMER — IGD / Gawat Darurat</option>
                  <option value="VR">VR — Telemedicine</option>
                  <option value="HH">HH — Home Care</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* Pasien */}
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
                    placeholder="100000030009"
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
                  placeholder="Budi Santoso"
                  className={ic(!!errors.patientDisplay)}
                />
              </Field>
            </div>
          </Section>

          {/* Praktisi */}
          <Section title="Praktisi (Participant)">
            <Field
              label="Tipe Partisipasi"
              required
              hint="v3-ParticipationType"
              error={errors.participantTypeCode?.message}
            >
              <select
                {...register("participantTypeCode")}
                className={ic(!!errors.participantTypeCode)}
              >
                <option value="ATND">ATND — Attender (Dokter pemeriksa)</option>
                <option value="CON">CON — Consultant</option>
                <option value="PPRF">PPRF — Primary Performer</option>
                <option value="PART">PART — Participant</option>
                <option value="SPRF">SPRF — Secondary Performer</option>
              </select>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Practitioner ID"
                required
                error={errors.practitionerId?.message}
              >
                <div className="flex">
                  <RefPrefix label="Practitioner/" />
                  <input
                    {...register("practitionerId")}
                    type="text"
                    placeholder="N10000001"
                    className={`${ic(!!errors.practitionerId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>

              <Field
                label="Nama Praktisi"
                required
                error={errors.practitionerDisplay?.message}
              >
                <input
                  {...register("practitionerDisplay")}
                  type="text"
                  placeholder="dr. Nama Dokter"
                  className={ic(!!errors.practitionerDisplay)}
                />
              </Field>
            </div>
          </Section>

          {/* Periode */}
          <Section title="Periode Kunjungan">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Waktu Mulai"
                required
                hint="period.start"
                error={errors.periodStart?.message}
              >
                <input
                  {...register("periodStart")}
                  type="datetime-local"
                  className={ic(!!errors.periodStart)}
                />
              </Field>

              <Field
                label="Waktu Selesai"
                hint="Opsional — period.end"
                error={errors.periodEnd?.message}
              >
                <input
                  {...register("periodEnd")}
                  type="datetime-local"
                  className={ic(!!errors.periodEnd)}
                />
              </Field>
            </div>
          </Section>

          {/* Lokasi */}
          <Section title="Lokasi Pelayanan">
            <Field
              label="Location ID"
              required
              hint="UUID lokasi dari Satu Sehat"
              error={errors.locationId?.message}
            >
              <div className="flex">
                <RefPrefix label="Location/" />
                <input
                  {...register("locationId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.locationId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>

            <Field
              label="Nama Lokasi"
              required
              error={errors.locationDisplay?.message}
            >
              <input
                {...register("locationDisplay")}
                type="text"
                placeholder="Ruang 1A, Poliklinik Bedah Rawat Jalan Terpadu, Lantai 2"
                className={ic(!!errors.locationDisplay)}
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
              rows={22}
              placeholder='{"resourceType": "Encounter", ...}'
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
                rawError
                  ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                  : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
              }`}
              spellCheck={false}
              aria-label="Raw JSON payload Encounter"
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
                  /Encounter
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
// Generator nomor encounter otomatis
// Format: YYMMDDNNNN — e.g. 2604110001
//   YY   = 2 digit tahun (26)
//   MM   = 2 digit bulan (04)
//   DD   = 2 digit tanggal (11)
//   NNNN = nomor urut hari ini, padded 4 digit (0001)
// Sequence disimpan di localStorage per tanggal; reset tiap hari.
// ─────────────────────────────────────────────

function generateEncounterNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateKey = `${yy}${mm}${dd}`;
  const storageKey = `encounter_seq_${dateKey}`;

  const prev = parseInt(localStorage.getItem(storageKey) ?? "0", 10);
  const next = prev + 1;
  localStorage.setItem(storageKey, String(next));

  return `${dateKey}${String(next).padStart(4, "0")}`;
}

// ─────────────────────────────────────────────
// Komponen utama
// ─────────────────────────────────────────────

export default function EncounterForm({
  method,
  loading,
  onSubmit,
}: EncounterFormProps) {
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
