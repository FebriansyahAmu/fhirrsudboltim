/**
 * components/modules/allergy-intolerance/AllergyIntoleranceForm.tsx
 *
 * Form input untuk resource AllergyIntolerance.
 * Mendukung dua mode:
 *   - Form : field-by-field dengan validasi Yup + react-hook-form
 *   - Raw JSON : edit payload langsung
 *
 * Pola komponen konsisten dengan ClinicalImpressionForm.tsx.
 *
 * Catatan khusus AllergyIntolerance:
 *   - `identifier.system` menggunakan Org_id dari env — tidak diinput user
 *   - `category` adalah array di FHIR, tapi form hanya izinkan 1 pilihan
 *     untuk menyederhanakan UX (bisa dikembangkan ke multi-select kemudian)
 *   - `recorder` bisa berupa UUID atau kode praktisi (e.g. "N10000001")
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useState } from "react";

import {
  allergyIntoleranceFormSchema,
  allergyIntoleranceGetSchema,
  type AllergyIntoleranceFormValues,
  type AllergyIntoleranceGetValues,
} from "@/app/lib/schemas/allergy-intolerance.schema";
import type {
  AllergyIntolerancePayload,
  AllergyIntoleranceCategory,
} from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface AllergyIntoleranceFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: AllergyIntolerancePayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
}

// ─────────────────────────────────────────────
// Shared UI primitives
// Identik dengan modul lain — tetap di sini agar form self-contained
// dan tidak ada coupling ke komponen global yang mungkin berubah.
// ─────────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

/** Label + children + pesan error yang accessible */
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

/** Divider dengan judul section di tengah */
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

/** Ikon error — inline SVG agar tidak perlu import library icon */
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

/** Prefix monospace untuk field referensi FHIR */
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
  label = "/AllergyIntolerance",
}: {
  method: HttpMethod;
  loading: boolean;
  label?: string;
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
          <span>{label}</span>
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
  } = useForm<AllergyIntoleranceGetValues>({
    resolver: yupResolver(
      allergyIntoleranceGetSchema,
    ) as unknown as Resolver<AllergyIntoleranceGetValues>,
  });

  const onValid = (data: AllergyIntoleranceGetValues) => {
    onSubmit({
      resourceId: data.allergyIntoleranceId || undefined,
      queryParams: {
        // Prefix "Patient/" sesuai spesifikasi FHIR search parameter
        patient: data.patientId ? `Patient/${data.patientId}` : undefined,
        "clinical-status": data.clinicalStatus || undefined,
        category: data.category || undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID AllergyIntolerance"
          hint="Opsional — kosongkan untuk list"
          error={errors.allergyIntoleranceId?.message}
        >
          <input
            {...register("allergyIntoleranceId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${ic(!!errors.allergyIntoleranceId)} font-mono`}
            autoComplete="off"
          />
        </Field>

        <Field label="Patient ID" error={errors.patientId?.message}>
          <input
            {...register("patientId")}
            type="text"
            placeholder="UUID pasien"
            className={`${ic(!!errors.patientId)} font-mono`}
            autoComplete="off"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Status Klinis" error={errors.clinicalStatus?.message}>
            <select
              {...register("clinicalStatus")}
              className={ic(!!errors.clinicalStatus)}
            >
              <option value="">Semua status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resolved">Resolved</option>
            </select>
          </Field>

          <Field label="Kategori" error={errors.category?.message}>
            <select {...register("category")} className={ic(!!errors.category)}>
              <option value="">Semua kategori</option>
              <option value="food">Food</option>
              <option value="medication">Medication</option>
              <option value="environment">Environment</option>
              <option value="biologic">Biologic</option>
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
    payload: AllergyIntolerancePayload;
    resourceId?: string;
  }) => void;
}) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

  /** PUT dan PATCH membutuhkan ID resource yang sudah ada */
  const needsId = method === "PUT" || method === "PATCH";

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<AllergyIntoleranceFormValues>({
    resolver: yupResolver(
      allergyIntoleranceFormSchema,
    ) as unknown as Resolver<AllergyIntoleranceFormValues>,
    defaultValues: {
      allergyIntoleranceId: "",
      identifierValue: "",
      clinicalStatusCode: "active",
      verificationStatusCode: "confirmed",
      category: "food",
      codeSnomed: "89811004",
      codeDisplay: "Gluten",
      codeText: "Alergi bahan gluten, khususnya ketika makan roti gandum",
      patientId: "",
      patientDisplay: "",
      encounterId: "",
      encounterDisplay: "",
      recordedDate: new Date().toISOString().slice(0, 16),
      recorderPractitionerId: "",
    },
  });

  /**
   * Bangun payload FHIR R4 dari nilai form yang sudah tervalidasi.
   *
   * Catatan: `identifier.system` menggunakan Org_id dari environment variable.
   * Ini dibaca dari `process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID` yang boleh
   * terekspos ke client karena bukan secret — hanya ID organisasi.
   * Secret (CLIENT_ID, CLIENT_SECRET) tetap di server melalui API Route.
   */
  const buildPayload = (
    data: AllergyIntoleranceFormValues,
  ): AllergyIntolerancePayload => {
    const orgId = process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET";

    return {
      resourceType: "AllergyIntolerance",

      // Identifier lokal fasilitas menggunakan Org_id
      identifier: [
        {
          system: `http://sys-ids.kemkes.go.id/allergy/${orgId}`,
          use: "official",
          value: data.identifierValue,
        },
      ],

      // Status klinis — sistem URI standar HL7
      clinicalStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
            code: data.clinicalStatusCode,
            display:
              data.clinicalStatusCode === "active"
                ? "Active"
                : data.clinicalStatusCode === "inactive"
                  ? "Inactive"
                  : "Resolved",
          },
        ],
      },

      // Status verifikasi — sistem URI standar HL7
      verificationStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
            code: data.verificationStatusCode,
            display:
              data.verificationStatusCode === "confirmed"
                ? "Confirmed"
                : data.verificationStatusCode === "unconfirmed"
                  ? "Unconfirmed"
                  : data.verificationStatusCode === "refuted"
                    ? "Refuted"
                    : "Entered in Error",
          },
        ],
      },

      // Kategori sebagai array (FHIR spec menggunakan array)
      category: [data.category as AllergyIntoleranceCategory],

      // Kode substansi alergen (SNOMED CT)
      code: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: data.codeSnomed,
            display: data.codeDisplay,
          },
        ],
        // Teks bebas keterangan alergi — opsional
        text: data.codeText || undefined,
      },

      // Referensi pasien
      patient: {
        reference: `Patient/${data.patientId}`,
        display: data.patientDisplay,
      },

      // Referensi encounter
      encounter: {
        reference: `Encounter/${data.encounterId}`,
        display: data.encounterDisplay || undefined,
      },

      // Tanggal pencatatan dalam format ISO 8601
      recordedDate: new Date(data.recordedDate).toISOString(),

      // Praktisi yang mencatat
      recorder: {
        reference: `Practitioner/${data.recorderPractitionerId}`,
      },
    };
  };

  const onValidForm = (data: AllergyIntoleranceFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.allergyIntoleranceId || undefined : undefined,
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
    onSubmit({ payload: parsed as AllergyIntolerancePayload });
  };

  /** Sinkronisasi nilai form saat ini ke textarea Raw JSON */
  const syncRaw = () => {
    const values = getValues();
    const orgId = process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET";

    // Preview payload — belum tervalidasi, hanya untuk referensi user
    const preview = {
      resourceType: "AllergyIntolerance",
      identifier: [
        {
          system: `http://sys-ids.kemkes.go.id/allergy/${orgId}`,
          use: "official",
          value: values.identifierValue,
        },
      ],
      clinicalStatus: {
        coding: [
          { system: "...", code: values.clinicalStatusCode, display: "" },
        ],
      },
      verificationStatus: {
        coding: [
          { system: "...", code: values.verificationStatusCode, display: "" },
        ],
      },
      category: [values.category],
      code: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: values.codeSnomed,
            display: values.codeDisplay,
          },
        ],
        text: values.codeText,
      },
      patient: {
        reference: `Patient/${values.patientId}`,
        display: values.patientDisplay,
      },
      encounter: {
        reference: `Encounter/${values.encounterId}`,
        display: values.encounterDisplay,
      },
      recordedDate: values.recordedDate,
      recorder: { reference: `Practitioner/${values.recorderPractitionerId}` },
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
                label="ID AllergyIntolerance"
                required
                error={errors.allergyIntoleranceId?.message}
              >
                <input
                  {...register("allergyIntoleranceId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.allergyIntoleranceId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          {/* Identifier lokal */}
          <Section title="Identifier Lokal">
            <Field
              label="Nomor Identifier"
              required
              hint="Nomor alergi dari sistem fasilitas"
              error={errors.identifierValue?.message}
            >
              <div className="flex">
                {/*
                 * Prefix URI menggunakan Org_id — ditampilkan sebagai info,
                 * tidak bisa diedit user karena sudah dikonfigurasi di env.
                 */}
                <span
                  className="flex items-center px-2.5 bg-amber-50 border border-r-0 border-amber-200 rounded-l-xl text-[10px] text-amber-600 font-mono whitespace-nowrap max-w-45 truncate"
                  title="sys-ids.kemkes.go.id/allergy/{ORG_ID}"
                >
                  sys-ids.kemkes.go.id/allergy/…
                </span>
                <input
                  {...register("identifierValue")}
                  type="text"
                  placeholder="98457729"
                  className={`${ic(!!errors.identifierValue)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>
          </Section>

          {/* Status */}
          <Section title="Status">
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
                  <option value="inactive">Inactive</option>
                  <option value="resolved">Resolved</option>
                </select>
              </Field>

              <Field
                label="Status Verifikasi"
                required
                error={errors.verificationStatusCode?.message}
              >
                <select
                  {...register("verificationStatusCode")}
                  className={ic(!!errors.verificationStatusCode)}
                >
                  <option value="unconfirmed">Unconfirmed</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="refuted">Refuted</option>
                  <option value="entered-in-error">Entered in Error</option>
                </select>
              </Field>
            </div>

            <Field
              label="Kategori Alergen"
              required
              error={errors.category?.message}
            >
              <select
                {...register("category")}
                className={ic(!!errors.category)}
              >
                <option value="food">Food — Makanan</option>
                <option value="medication">Medication — Obat-obatan</option>
                <option value="environment">Environment — Lingkungan</option>
                <option value="biologic">Biologic — Biologis</option>
              </select>
            </Field>
          </Section>

          {/* Kode substansi */}
          <Section title="Substansi Penyebab (SNOMED CT)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Kode SNOMED"
                required
                error={errors.codeSnomed?.message}
              >
                <input
                  {...register("codeSnomed")}
                  type="text"
                  placeholder="89811004"
                  className={`${ic(!!errors.codeSnomed)} font-mono`}
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Nama Substansi"
                required
                error={errors.codeDisplay?.message}
              >
                <input
                  {...register("codeDisplay")}
                  type="text"
                  placeholder="Gluten"
                  className={ic(!!errors.codeDisplay)}
                />
              </Field>
            </div>

            <Field
              label="Keterangan Alergi"
              hint="Opsional"
              error={errors.codeText?.message}
            >
              <textarea
                {...register("codeText")}
                rows={2}
                placeholder="Contoh: Alergi bahan gluten, khususnya ketika makan roti gandum"
                className={`${ic(!!errors.codeText)} resize-none`}
              />
            </Field>
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
                placeholder="Contoh: Kunjungan Budi Santoso di hari Selasa, 14 Juni 2022"
                className={ic(!!errors.encounterDisplay)}
              />
            </Field>
          </Section>

          {/* Pencatatan */}
          <Section title="Pencatatan">
            <Field
              label="Tanggal Dicatat"
              required
              hint="recordedDate"
              error={errors.recordedDate?.message}
            >
              <input
                {...register("recordedDate")}
                type="datetime-local"
                className={ic(!!errors.recordedDate)}
              />
            </Field>

            <Field
              label="Recorder (Practitioner ID)"
              required
              hint="UUID atau kode praktisi"
              error={errors.recorderPractitionerId?.message}
            >
              <div className="flex">
                <RefPrefix label="Practitioner/" />
                <input
                  {...register("recorderPractitionerId")}
                  type="text"
                  placeholder="UUID atau N10000001"
                  className={`${ic(!!errors.recorderPractitionerId)} rounded-l-none border-l-0 font-mono`}
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
              rows={20}
              placeholder='{"resourceType": "AllergyIntolerance", ...}'
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
                rawError
                  ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                  : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
              }`}
              spellCheck={false}
              aria-label="Raw JSON payload AllergyIntolerance"
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
                  /AllergyIntolerance
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

export default function AllergyIntoleranceForm({
  method,
  loading,
  onSubmit,
}: AllergyIntoleranceFormProps) {
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
