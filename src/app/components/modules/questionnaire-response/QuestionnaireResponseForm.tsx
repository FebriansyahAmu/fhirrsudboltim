/**
 * components/modules/questionnaire-response/QuestionnaireResponseForm.tsx
 *
 * Form input untuk resource QuestionnaireResponse (Questionnaire Q0007).
 * Mendukung dua mode: Form (field-by-field) dan Raw JSON.
 *
 * Pola konsisten dengan modul lain di codebase ini.
 *
 * Catatan desain khusus Q0007:
 *   - Form menampilkan pertanyaan tetap sesuai struktur Q0007 Satu Sehat.
 *   - Pertanyaan administrasi, farmasetik, dan 3.1 menggunakan toggle "Sesuai/Tidak Sesuai".
 *   - Pertanyaan 3.2–3.5 menggunakan toggle boolean (Ada/Tidak Ada).
 *   - Item 4 adalah referensi UUID ke MedicationRequest.
 *   - buildPayload() mengkonversi form values ke struktur nested FHIR.
 */

"use client";

import { useForm, Controller, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useState } from "react";

/** Payload yang di-autofill dari panel SIMGOS (Raw JSON). */
type AutofillRaw = { json: string; nonce: number } | null;

import {
  questionnaireResponseFormSchema,
  questionnaireResponseGetSchema,
  type QuestionnaireResponseFormValues,
  type QuestionnaireResponseGetValues,
} from "@/app/lib/schemas/questionnaire-response.schema";
import type {
  QuestionnaireResponsePayload,
  QUESTIONNAIRE_CODING_ANSWERS,
} from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Konstanta Q0007
// ─────────────────────────────────────────────

/** URL Questionnaire Q0007 — fixed, tidak berubah */
const Q0007_URL = "https://fhir.kemkes.go.id/Questionnaire/Q0007";

/** Sistem kode terminologi klinis Kemkes */
const CLINICAL_TERM_SYSTEM =
  "http://terminology.kemkes.go.id/CodeSystem/clinical-term";

/**
 * Konversi nilai form ("sesuai"/"tidak_sesuai") ke kode FHIR.
 * Digunakan di buildPayload() untuk semua item valueCoding.
 */
const CODING_MAP = {
  sesuai: { system: CLINICAL_TERM_SYSTEM, code: "OV000052", display: "Sesuai" },
  tidak_sesuai: {
    system: CLINICAL_TERM_SYSTEM,
    code: "OV000053",
    display: "Tidak Sesuai",
  },
} as const;

type CodingKey = keyof typeof CODING_MAP;

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface QuestionnaireResponseFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: QuestionnaireResponsePayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
  /** Bila di-set (nonce berubah), form beralih ke Raw JSON & terisi payload. */
  autofillRaw?: AutofillRaw;
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
          /QuestionnaireResponse
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// CodingToggle — Sesuai / Tidak Sesuai
// Komponen khusus untuk pertanyaan valueCoding Q0007.
// Lebih intuitif dari dropdown untuk jawaban biner.
// ─────────────────────────────────────────────

interface CodingToggleProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  linkId: string;
  questionText: string;
}

function CodingToggle({
  value,
  onChange,
  error,
  linkId,
  questionText,
}: CodingToggleProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5 px-3 bg-slate-50 rounded-xl border border-slate-100">
      {/* Teks pertanyaan */}
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded-lg font-mono shrink-0 mt-0.5">
          {linkId}
        </span>
        <p className="text-[12px] text-slate-700 leading-relaxed">
          {questionText}
        </p>
      </div>

      {/* Toggle button group */}
      <div
        className="flex gap-1 shrink-0 self-start sm:self-center"
        role="group"
        aria-label={`Jawaban ${linkId}`}
      >
        <button
          type="button"
          onClick={() => onChange("sesuai")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
            value === "sesuai"
              ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
              : "bg-white border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600"
          }`}
        >
          ✓ Sesuai
        </button>
        <button
          type="button"
          onClick={() => onChange("tidak_sesuai")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
            value === "tidak_sesuai"
              ? "bg-red-500 text-white shadow-sm shadow-red-200"
              : "bg-white border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600"
          }`}
        >
          ✗ Tidak Sesuai
        </button>
      </div>

      {/* Error inline */}
      {error && (
        <p
          className="flex items-center gap-1 text-[11px] text-red-600 sm:hidden"
          role="alert"
        >
          <ErrorIcon />
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// BooleanToggle — Ada / Tidak Ada
// Komponen untuk pertanyaan valueBoolean item 3.2–3.5.
// ─────────────────────────────────────────────

interface BooleanToggleProps {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  error?: string;
  linkId: string;
  questionText: string;
}

function BooleanToggle({
  value,
  onChange,
  error,
  linkId,
  questionText,
}: BooleanToggleProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5 px-3 bg-slate-50 rounded-xl border border-slate-100">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded-lg font-mono shrink-0 mt-0.5">
          {linkId}
        </span>
        <p className="text-[12px] text-slate-700 leading-relaxed">
          {questionText}
        </p>
      </div>

      <div
        className="flex gap-1 shrink-0 self-start sm:self-center"
        role="group"
        aria-label={`Jawaban ${linkId}`}
      >
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
            value === true
              ? "bg-amber-500 text-white shadow-sm shadow-amber-200"
              : "bg-white border border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600"
          }`}
        >
          Ya, Ada
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
            value === false
              ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
              : "bg-white border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600"
          }`}
        >
          Tidak Ada
        </button>
      </div>

      {error && (
        <p
          className="flex items-center gap-1 text-[11px] text-red-600 sm:hidden"
          role="alert"
        >
          <ErrorIcon />
          {error}
        </p>
      )}
    </div>
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
  } = useForm<QuestionnaireResponseGetValues>({
    resolver: yupResolver(questionnaireResponseGetSchema) as unknown as Resolver<QuestionnaireResponseGetValues>,
  });

  const onValid = (data: QuestionnaireResponseGetValues) => {
    onSubmit({
      resourceId: data.questionnaireResponseId || undefined,
      queryParams: {
        patient: data.patientId ? `Patient/${data.patientId}` : undefined,
        status: data.status || undefined,
        questionnaire: Q0007_URL,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID QuestionnaireResponse"
          hint="Opsional — kosongkan untuk list"
          error={errors.questionnaireResponseId?.message}
        >
          <input
            {...register("questionnaireResponseId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${ic(!!errors.questionnaireResponseId)} font-mono`}
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
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="amended">Amended</option>
              <option value="entered-in-error">Entered in Error</option>
              <option value="stopped">Stopped</option>
            </select>
          </Field>
        </div>

        {/* Info: selalu filter dengan Q0007 */}
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
            Query otomatis menambahkan filter{" "}
            <code className="font-mono bg-blue-100 px-1 rounded text-[10px]">
              questionnaire=Q0007
            </code>
          </p>
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
  autofillRaw,
}: {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload: QuestionnaireResponsePayload;
    resourceId?: string;
  }) => void;
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
    control,
    getValues,
    formState: { errors },
  } = useForm<QuestionnaireResponseFormValues>({
    resolver: yupResolver(questionnaireResponseFormSchema) as unknown as Resolver<QuestionnaireResponseFormValues>,
    defaultValues: {
      questionnaireResponseId: "",
      status: "completed",
      authored: new Date().toISOString().slice(0, 16),
      patientId: "",
      patientDisplay: "",
      encounterId: "",
      authorPractitionerId: "",
      authorDisplay: "",
      // Semua item administrasi & farmasetik default "sesuai"
      item_1_1: "sesuai",
      item_1_2: "sesuai",
      item_1_3: "sesuai",
      item_1_4: "sesuai",
      item_2_1: "sesuai",
      item_2_2: "sesuai",
      item_2_3: "sesuai",
      item_2_4: "sesuai",
      item_3_1: "sesuai",
      // Item klinis boolean default false (tidak ada masalah)
      item_3_2: false,
      item_3_3: false,
      item_3_4: false,
      item_3_5: false,
      item_4_medicationRequestId: "",
    },
  });

  /**
   * Konversi form values ke struktur payload FHIR R4.
   * Membangun item nested sesuai struktur Q0007.
   */
  const buildPayload = (
    data: QuestionnaireResponseFormValues,
  ): QuestionnaireResponsePayload => {
    /**
     * Helper: buat answer valueCoding dari key form.
     * Mengkonversi "sesuai"/"tidak_sesuai" ke kode FHIR.
     */
    const makeCodingAnswer = (key: CodingKey) => ({
      valueCoding: CODING_MAP[key],
    });

    return {
      resourceType: "QuestionnaireResponse",
      questionnaire: Q0007_URL,
      status: data.status as QuestionnaireResponsePayload["status"],
      subject: {
        reference: `Patient/${data.patientId}`,
        display: data.patientDisplay,
      },
      encounter: {
        reference: `Encounter/${data.encounterId}`,
      },
      authored: new Date(data.authored).toISOString(),
      author: {
        reference: `Practitioner/${data.authorPractitionerId}`,
        display: data.authorDisplay,
      },
      // source = subject (pasien sebagai sumber informasi)
      source: {
        reference: `Patient/${data.patientId}`,
      },
      item: [
        // ── Grup 1: Persyaratan Administrasi ──
        {
          linkId: "1",
          text: "Persyaratan Administrasi",
          item: [
            {
              linkId: "1.1",
              text: "Apakah nama, umur, jenis kelamin, berat badan dan tinggi badan pasien sudah sesuai?",
              answer: [makeCodingAnswer(data.item_1_1 as CodingKey)],
            },
            {
              linkId: "1.2",
              text: "Apakah nama, nomor ijin, alamat dan paraf dokter sudah sesuai?",
              answer: [makeCodingAnswer(data.item_1_2 as CodingKey)],
            },
            {
              linkId: "1.3",
              text: "Apakah tanggal resep sudah sesuai?",
              answer: [makeCodingAnswer(data.item_1_3 as CodingKey)],
            },
            {
              linkId: "1.4",
              text: "Apakah ruangan/unit asal resep sudah sesuai?",
              answer: [makeCodingAnswer(data.item_1_4 as CodingKey)],
            },
          ],
        },
        // ── Grup 2: Persyaratan Farmasetik ──
        {
          linkId: "2",
          text: "Persyaratan Farmasetik",
          item: [
            {
              linkId: "2.1",
              text: "Apakah nama obat, bentuk dan kekuatan sediaan sudah sesuai?",
              answer: [makeCodingAnswer(data.item_2_1 as CodingKey)],
            },
            {
              linkId: "2.2",
              text: "Apakah dosis dan jumlah obat sudah sesuai?",
              answer: [makeCodingAnswer(data.item_2_2 as CodingKey)],
            },
            {
              linkId: "2.3",
              text: "Apakah stabilitas obat sudah sesuai?",
              answer: [makeCodingAnswer(data.item_2_3 as CodingKey)],
            },
            {
              linkId: "2.4",
              text: "Apakah aturan dan cara penggunaan obat sudah sesuai?",
              answer: [makeCodingAnswer(data.item_2_4 as CodingKey)],
            },
          ],
        },
        // ── Grup 3: Persyaratan Klinis ──
        {
          linkId: "3",
          text: "Persyaratan Klinis",
          item: [
            {
              linkId: "3.1",
              text: "Apakah ketepatan indikasi, dosis, dan waktu penggunaan obat sudah sesuai?",
              answer: [makeCodingAnswer(data.item_3_1 as CodingKey)],
            },
            {
              linkId: "3.2",
              text: "Apakah terdapat duplikasi pengobatan?",
              answer: [{ valueBoolean: data.item_3_2 }],
            },
            {
              linkId: "3.3",
              text: "Apakah terdapat alergi dan reaksi obat yang tidak dikehendaki (ROTD)?",
              answer: [{ valueBoolean: data.item_3_3 }],
            },
            {
              linkId: "3.4",
              text: "Apakah terdapat kontraindikasi pengobatan?",
              answer: [{ valueBoolean: data.item_3_4 }],
            },
            {
              linkId: "3.5",
              text: "Apakah terdapat dampak interaksi obat?",
              answer: [{ valueBoolean: data.item_3_5 }],
            },
          ],
        },
        // ── Item 4: Referensi MedicationRequest ──
        {
          linkId: "4",
          text: "Resep yang dilakukan pengkajian resep",
          answer: [
            {
              valueReference: {
                reference: `MedicationRequest/${data.item_4_medicationRequestId}`,
              },
            },
          ],
        },
      ],
    };
  };

  const onValidForm = (data: QuestionnaireResponseFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId
        ? data.questionnaireResponseId || undefined
        : undefined,
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
    onSubmit({ payload: parsed as QuestionnaireResponsePayload });
  };

  const syncRaw = () => {
    const values = getValues();
    setRawJson(safeJsonStringify(buildPayload(values)));
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
          className="space-y-5"
        >
          {/* ID resource — hanya untuk PUT/PATCH */}
          {needsId && (
            <Section title="Identifikasi">
              <Field
                label="ID QuestionnaireResponse"
                required
                error={errors.questionnaireResponseId?.message}
              >
                <input
                  {...register("questionnaireResponseId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.questionnaireResponseId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          {/* Header */}
          <Section title="Header">
            {/* Info questionnaire — read only */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Questionnaire
              </span>
              <code className="text-[11px] font-mono text-slate-600 truncate">
                {Q0007_URL}
              </code>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Status" required error={errors.status?.message}>
                <select {...register("status")} className={ic(!!errors.status)}>
                  <option value="completed">Completed</option>
                  <option value="in-progress">In Progress</option>
                  <option value="amended">Amended</option>
                  <option value="entered-in-error">Entered in Error</option>
                  <option value="stopped">Stopped</option>
                </select>
              </Field>
              <Field
                label="Tanggal Pengisian"
                required
                hint="authored"
                error={errors.authored?.message}
              >
                <input
                  {...register("authored")}
                  type="datetime-local"
                  className={ic(!!errors.authored)}
                />
              </Field>
            </div>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Apoteker (Practitioner ID)"
                required
                hint="author"
                error={errors.authorPractitionerId?.message}
              >
                <div className="flex">
                  <RefPrefix label="Practitioner/" />
                  <input
                    {...register("authorPractitionerId")}
                    type="text"
                    placeholder="10009880728"
                    className={`${ic(!!errors.authorPractitionerId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
              <Field
                label="Nama Apoteker"
                required
                error={errors.authorDisplay?.message}
              >
                <input
                  {...register("authorDisplay")}
                  type="text"
                  placeholder="Apoteker A"
                  className={ic(!!errors.authorDisplay)}
                />
              </Field>
            </div>
          </Section>

          {/* ── Grup 1: Persyaratan Administrasi ── */}
          <Section title="1 — Persyaratan Administrasi">
            <div className="space-y-2">
              {[
                {
                  name: "item_1_1" as const,
                  linkId: "1.1",
                  text: "Apakah nama, umur, jenis kelamin, berat badan dan tinggi badan pasien sudah sesuai?",
                },
                {
                  name: "item_1_2" as const,
                  linkId: "1.2",
                  text: "Apakah nama, nomor ijin, alamat dan paraf dokter sudah sesuai?",
                },
                {
                  name: "item_1_3" as const,
                  linkId: "1.3",
                  text: "Apakah tanggal resep sudah sesuai?",
                },
                {
                  name: "item_1_4" as const,
                  linkId: "1.4",
                  text: "Apakah ruangan/unit asal resep sudah sesuai?",
                },
              ].map(({ name, linkId, text }) => (
                <Controller
                  key={name}
                  name={name}
                  control={control}
                  render={({ field }) => (
                    <CodingToggle
                      value={field.value as string}
                      onChange={field.onChange}
                      error={errors[name]?.message}
                      linkId={linkId}
                      questionText={text}
                    />
                  )}
                />
              ))}
            </div>
          </Section>

          {/* ── Grup 2: Persyaratan Farmasetik ── */}
          <Section title="2 — Persyaratan Farmasetik">
            <div className="space-y-2">
              {[
                {
                  name: "item_2_1" as const,
                  linkId: "2.1",
                  text: "Apakah nama obat, bentuk dan kekuatan sediaan sudah sesuai?",
                },
                {
                  name: "item_2_2" as const,
                  linkId: "2.2",
                  text: "Apakah dosis dan jumlah obat sudah sesuai?",
                },
                {
                  name: "item_2_3" as const,
                  linkId: "2.3",
                  text: "Apakah stabilitas obat sudah sesuai?",
                },
                {
                  name: "item_2_4" as const,
                  linkId: "2.4",
                  text: "Apakah aturan dan cara penggunaan obat sudah sesuai?",
                },
              ].map(({ name, linkId, text }) => (
                <Controller
                  key={name}
                  name={name}
                  control={control}
                  render={({ field }) => (
                    <CodingToggle
                      value={field.value as string}
                      onChange={field.onChange}
                      error={errors[name]?.message}
                      linkId={linkId}
                      questionText={text}
                    />
                  )}
                />
              ))}
            </div>
          </Section>

          {/* ── Grup 3: Persyaratan Klinis ── */}
          <Section title="3 — Persyaratan Klinis">
            <div className="space-y-2">
              {/* 3.1 — valueCoding (Sesuai/Tidak Sesuai) */}
              <Controller
                name="item_3_1"
                control={control}
                render={({ field }) => (
                  <CodingToggle
                    value={field.value as string}
                    onChange={field.onChange}
                    error={errors.item_3_1?.message}
                    linkId="3.1"
                    questionText="Apakah ketepatan indikasi, dosis, dan waktu penggunaan obat sudah sesuai?"
                  />
                )}
              />

              {/* 3.2–3.5 — valueBoolean (Ada/Tidak Ada) */}
              {[
                {
                  name: "item_3_2" as const,
                  linkId: "3.2",
                  text: "Apakah terdapat duplikasi pengobatan?",
                },
                {
                  name: "item_3_3" as const,
                  linkId: "3.3",
                  text: "Apakah terdapat alergi dan reaksi obat yang tidak dikehendaki (ROTD)?",
                },
                {
                  name: "item_3_4" as const,
                  linkId: "3.4",
                  text: "Apakah terdapat kontraindikasi pengobatan?",
                },
                {
                  name: "item_3_5" as const,
                  linkId: "3.5",
                  text: "Apakah terdapat dampak interaksi obat?",
                },
              ].map(({ name, linkId, text }) => (
                <Controller
                  key={name}
                  name={name}
                  control={control}
                  render={({ field }) => (
                    <BooleanToggle
                      value={field.value as boolean | undefined}
                      onChange={field.onChange}
                      error={errors[name]?.message}
                      linkId={linkId}
                      questionText={text}
                    />
                  )}
                />
              ))}
            </div>
          </Section>

          {/* ── Item 4: MedicationRequest ── */}
          <Section title="4 — Resep yang Dikaji">
            <Field
              label="MedicationRequest ID"
              required
              hint="Resep yang dilakukan pengkajian"
              error={errors.item_4_medicationRequestId?.message}
            >
              <div className="flex">
                <RefPrefix label="MedicationRequest/" />
                <input
                  {...register("item_4_medicationRequestId")}
                  type="text"
                  placeholder="UUID"
                  className={`${ic(!!errors.item_4_medicationRequestId)} rounded-l-none border-l-0 font-mono`}
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
              rows={24}
              placeholder='{"resourceType": "QuestionnaireResponse", ...}'
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
                rawError
                  ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                  : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
              }`}
              spellCheck={false}
              aria-label="Raw JSON payload QuestionnaireResponse"
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
                  /QuestionnaireResponse
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

export default function QuestionnaireResponseForm({
  method,
  loading,
  onSubmit,
  autofillRaw,
}: QuestionnaireResponseFormProps) {
  if (method === "GET") {
    return <GetForm loading={loading} onSubmit={(p) => onSubmit(p)} />;
  }
  return (
    <MutationForm
      method={method}
      loading={loading}
      onSubmit={(p) => onSubmit(p)}
      autofillRaw={autofillRaw}
    />
  );
}
