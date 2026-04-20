/**
 * components/modules/imaging-study/ImagingStudyForm.tsx
 *
 * Form pencarian ImagingStudy — fokus pada method GET.
 * Pola konsisten dengan modul lain di codebase ini.
 *
 * Parameter GET yang didukung:
 *   - imagingStudyId : UUID langsung (shortcut, abaikan filter lain)
 *   - patientId      : UUID → patient=Patient/{uuid}
 *   - encounterId    : UUID → encounter=Encounter/{uuid}
 *   - startedFrom    : tanggal → started=ge{date}
 *   - startedTo      : tanggal → started=le{date} (dikirim via encounterId param workaround)
 *   - status         : dropdown FHIR status
 *   - modality       : dropdown DICOM modality
 *   - identifier     : Study Instance UID atau accession number
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import {
  imagingStudyGetSchema,
  IMAGING_STUDY_STATUSES,
  DICOM_MODALITIES,
  type ImagingStudyGetValues,
} from "@/app/lib/schemas/imaging-study.schema";
import type { HttpMethod } from "@/app/lib/types/api";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface ImagingStudyFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
}

// ─────────────────────────────────────────────
// UI Primitives
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
        {required && <span className="text-red-400 font-bold" aria-hidden="true">*</span>}
        {hint && <span className="text-slate-400 font-normal text-[11px]">— {hint}</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-red-600" role="alert">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="shrink-0">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M5.5 3.5V5.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="5.5" cy="7.5" r="0.5" fill="currentColor" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

const inputBase =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 transition-all duration-150";
const inputErr =
  "w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-300/40 focus:border-red-400 transition-all duration-150";

function ic(hasError: boolean) {
  return hasError ? inputErr : inputBase;
}

// ─────────────────────────────────────────────
// Status label helper
// ─────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  registered: "Registered — Terdaftar",
  available: "Available — Tersedia",
  cancelled: "Cancelled — Dibatalkan",
  "entered-in-error": "Entered in Error — Input Salah",
  unknown: "Unknown — Tidak Diketahui",
};

// ─────────────────────────────────────────────
// GET Form
// ─────────────────────────────────────────────

function GetForm({ loading, onSubmit }: { loading: boolean; onSubmit: ImagingStudyFormProps["onSubmit"] }) {
  const orgId = process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ImagingStudyGetValues>({
    resolver: yupResolver(imagingStudyGetSchema) as Resolver<ImagingStudyGetValues>,
    defaultValues: {
      imagingStudyId: "",
      patientId: "",
      encounterId: "",
      startedFrom: "",
      startedTo: "",
      status: "",
      modality: "",
      accessionNumber: "",
    },
  });

  const handleGet = (data: ImagingStudyGetValues) => {
    // Jika ID langsung diisi, gunakan path param
    if (data.imagingStudyId) {
      onSubmit({ resourceId: data.imagingStudyId });
      return;
    }

    // Identifier dikirim dalam format FHIR token: system|value
    // Contoh: http://sys-ids.kemkes.go.id/acsn/10000004|MR.221102.062
    const identifierToken = data.accessionNumber
      ? `http://sys-ids.kemkes.go.id/acsn/${orgId}|${data.accessionNumber}`
      : undefined;

    const queryParams: Record<string, string | undefined> = {
      patient: data.patientId ? `Patient/${data.patientId}` : undefined,
      encounter: data.encounterId ? `Encounter/${data.encounterId}` : undefined,
      status: data.status || undefined,
      modality: data.modality || undefined,
      identifier: identifierToken,
      started: data.startedFrom ? `ge${data.startedFrom}` : undefined,
    };

    onSubmit({ queryParams });
  };

  return (
    <form onSubmit={handleSubmit(handleGet)} className="space-y-5" noValidate>
      {/* Hint card */}
      <div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-blue-50 border border-blue-100">
        <span className="text-base leading-none shrink-0 mt-0.5">💡</span>
        <p className="text-[11px] text-blue-700 leading-relaxed">
          Isi <strong>ImagingStudy ID</strong> untuk ambil langsung, atau gunakan filter
          di bawah untuk pencarian. Minimal satu parameter harus diisi.
        </p>
      </div>

      {/* Identifikasi langsung */}
      <Section title="Identifikasi Langsung">
        <Field
          label="ImagingStudy ID"
          hint="UUID — ambil langsung tanpa filter lain"
          error={errors.imagingStudyId?.message}
        >
          <input
            {...register("imagingStudyId")}
            className={ic(!!errors.imagingStudyId)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </Section>

      {/* Filter referensi */}
      <Section title="Filter Referensi">
        <Field label="Patient ID" hint="UUID pasien" error={errors.patientId?.message}>
          <div className="flex">
            <span className="flex items-center px-2.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-[11px] text-slate-400 font-mono whitespace-nowrap">
              Patient/
            </span>
            <input
              {...register("patientId")}
              className={`${ic(!!errors.patientId)} rounded-l-none`}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </Field>

        <Field label="Encounter ID" hint="UUID kunjungan terkait" error={errors.encounterId?.message}>
          <div className="flex">
            <span className="flex items-center px-2.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-[11px] text-slate-400 font-mono whitespace-nowrap">
              Encounter/
            </span>
            <input
              {...register("encounterId")}
              className={`${ic(!!errors.encounterId)} rounded-l-none`}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </Field>
      </Section>

      {/* Filter studi */}
      <Section title="Filter Studi">
        {/* Tanggal studi */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal Mulai" hint="started ≥" error={errors.startedFrom?.message}>
            <input
              {...register("startedFrom")}
              type="date"
              className={ic(!!errors.startedFrom)}
            />
          </Field>
          <Field label="Tanggal Akhir" hint="started ≤" error={errors.startedTo?.message}>
            <input
              {...register("startedTo")}
              type="date"
              className={ic(!!errors.startedTo)}
            />
          </Field>
        </div>

        {/* Status */}
        <Field label="Status" error={errors.status?.message}>
          <select {...register("status")} className={ic(!!errors.status)}>
            <option value="">Semua status</option>
            {IMAGING_STUDY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </Field>

        {/* Modality */}
        <Field label="Modality" hint="DICOM modality code" error={errors.modality?.message}>
          <select {...register("modality")} className={ic(!!errors.modality)}>
            <option value="">Semua modality</option>
            {DICOM_MODALITIES.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        {/* Accession Number */}
        <Field
          label="Accession Number"
          hint="nilai saja — sys-ids.kemkes.go.id/acsn/{orgId}|nilai"
          error={errors.accessionNumber?.message}
        >
          <div className="flex">
            <span
              className="flex items-center px-2.5 bg-sky-50 border border-r-0 border-sky-200 rounded-l-xl text-[10px] text-sky-600 font-mono whitespace-nowrap max-w-40 truncate"
              title={`http://sys-ids.kemkes.go.id/acsn/${orgId}|`}
            >
              sys-ids/acsn/…|
            </span>
            <input
              {...register("accessionNumber")}
              className={`${ic(!!errors.accessionNumber)} rounded-l-none border-l-0 font-mono`}
              placeholder="MR.221102.062"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </Field>
      </Section>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
            loading
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200"
          }`}
        >
          {loading ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20" strokeDashoffset="10" />
              </svg>
              Mencari...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Cari ImagingStudy
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => reset()}
          disabled={loading}
          className="px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────

export default function ImagingStudyForm({ method, loading, onSubmit }: ImagingStudyFormProps) {
  if (method === "GET") {
    return <GetForm loading={loading} onSubmit={onSubmit} />;
  }

  // Placeholder untuk method lain (belum diimplementasi)
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <span className="text-3xl">🚧</span>
      <p className="text-sm font-semibold text-slate-600">Form {method} belum tersedia</p>
      <p className="text-xs text-slate-400">
        ImagingStudy saat ini mendukung pencarian via GET.
      </p>
    </div>
  );
}
