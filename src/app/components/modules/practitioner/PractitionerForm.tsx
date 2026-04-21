/**
 * components/modules/practitioner/PractitionerForm.tsx
 *
 * Form pencarian Practitioner — method GET.
 *
 * Parameter GET yang didukung:
 *   - practitionerId : UUID → ambil langsung via path param
 *   - nik            : NIK dokter → identifier=https://fhir.kemkes.go.id/id/nik|{nik}
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import {
  practitionerGetSchema,
  type PractitionerGetValues,
} from "@/app/lib/schemas/practitioner.schema";
import type { HttpMethod } from "@/app/lib/types/api";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface PractitionerFormProps {
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

const NIK_SYSTEM = "https://fhir.kemkes.go.id/id/nik";

const inputBase =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 transition-all duration-150";
const inputErr =
  "w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-300/40 focus:border-red-400 transition-all duration-150";

function ic(hasError: boolean) {
  return hasError ? inputErr : inputBase;
}

// ─────────────────────────────────────────────
// GET Form
// ─────────────────────────────────────────────

function GetForm({ loading, onSubmit }: { loading: boolean; onSubmit: PractitionerFormProps["onSubmit"] }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PractitionerGetValues>({
    resolver: yupResolver(practitionerGetSchema) as Resolver<PractitionerGetValues>,
    defaultValues: { practitionerId: "", nik: "" },
  });

  const handleGet = (data: PractitionerGetValues) => {
    if (data.practitionerId) {
      onSubmit({ resourceId: data.practitionerId });
      return;
    }

    onSubmit({
      queryParams: {
        identifier: data.nik ? `${NIK_SYSTEM}|${data.nik}` : undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(handleGet)} className="space-y-5" noValidate>
      {/* Hint */}
      <div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-blue-50 border border-blue-100">
        <span className="text-base leading-none shrink-0 mt-0.5">💡</span>
        <p className="text-[11px] text-blue-700 leading-relaxed">
          Isi <strong>Practitioner ID</strong> untuk ambil langsung, atau cari
          menggunakan <strong>NIK</strong> dokter. Minimal satu parameter harus diisi.
        </p>
      </div>

      {/* Identifikasi langsung */}
      <Section title="Identifikasi Langsung">
        <Field
          label="Practitioner ID"
          hint="UUID — ambil langsung tanpa filter lain"
          error={errors.practitionerId?.message}
        >
          <input
            {...register("practitionerId")}
            className={ic(!!errors.practitionerId)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </Section>

      {/* Filter pencarian */}
      <Section title="Filter Pencarian">
        <Field
          label="NIK Dokter"
          hint="16 digit — identifier NIK Satu Sehat"
          error={errors.nik?.message}
        >
          <div className="flex">
            <span
              className="flex items-center px-2.5 bg-indigo-50 border border-r-0 border-indigo-200 rounded-l-xl text-[10px] text-indigo-600 font-mono whitespace-nowrap"
              title={`${NIK_SYSTEM}|`}
            >
              fhir.kemkes…/nik|
            </span>
            <input
              {...register("nik")}
              className={`${ic(!!errors.nik)} rounded-l-none border-l-0 font-mono`}
              placeholder="7174045602810002"
              inputMode="numeric"
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Dikirim sebagai{" "}
            <code className="font-mono bg-slate-100 px-1 rounded">
              identifier={NIK_SYSTEM}|&#123;nik&#125;
            </code>
          </p>
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
              Cari Practitioner
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

export default function PractitionerForm({ method, loading, onSubmit }: PractitionerFormProps) {
  if (method === "GET") {
    return <GetForm loading={loading} onSubmit={onSubmit} />;
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <span className="text-3xl">🚧</span>
      <p className="text-sm font-semibold text-slate-600">Form {method} belum tersedia</p>
      <p className="text-xs text-slate-400">Practitioner saat ini mendukung pencarian via GET.</p>
    </div>
  );
}
