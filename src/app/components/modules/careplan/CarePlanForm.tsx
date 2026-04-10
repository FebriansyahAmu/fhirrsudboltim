"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import type {
  CarePlanFormValues,
  CarePlanGetValues,
} from "@/app/lib/schemas/careplan.schemas";
import {
  carePlanFormSchema,
  carePlanGetSchema,
} from "@/app/lib/schemas/careplan.schemas";
import type { CarePlanPayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { useState } from "react";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

interface CarePlanFormProps {
  method: HttpMethod;
  onSubmit: (params: {
    payload?: CarePlanPayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
  loading: boolean;
}

// ─────────────────────────────────────────────
// Field & Section UI
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

const inputCls =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 transition-all duration-150";

const inputErrCls =
  "w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-300/40 focus:border-red-400 transition-all duration-150";

function getInputCls(hasError: boolean) {
  return hasError ? inputErrCls : inputCls;
}

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
  } = useForm<CarePlanGetValues>({
    resolver: yupResolver(
      carePlanGetSchema,
    ) as unknown as Resolver<CarePlanGetValues>,
  });

  const onValid = (data: CarePlanGetValues) => {
    onSubmit({
      resourceId: data.carePlanId || undefined,
      queryParams: {
        status: data.status || undefined,
        subject: data.patientId ? `Patient/${data.patientId}` : undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID CarePlan"
          hint="Opsional — kosongkan untuk semua"
          error={errors.carePlanId?.message}
        >
          <input
            {...register("carePlanId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${getInputCls(!!errors.carePlanId)} font-mono`}
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Status" error={errors.status?.message}>
            <select
              {...register("status")}
              className={getInputCls(!!errors.status)}
            >
              <option value="">Semua status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On Hold</option>
              <option value="revoked">Revoked</option>
            </select>
          </Field>
          <Field label="Patient ID" error={errors.patientId?.message}>
            <input
              {...register("patientId")}
              type="text"
              placeholder="UUID pasien"
              className={`${getInputCls(!!errors.patientId)} font-mono`}
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
}: {
  method: HttpMethod;
  onSubmit: (params: { payload: CarePlanPayload; resourceId?: string }) => void;
  loading: boolean;
}) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

  const needsId = method === "PUT" || method === "PATCH";

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<CarePlanFormValues>({
    resolver: yupResolver(
      carePlanFormSchema,
    ) as unknown as Resolver<CarePlanFormValues>,
    defaultValues: {
      title: "Perencanaan Pemulangan Pasien",
      status: "active",
      intent: "plan",
      description:
        "Pasien akan melakukan perawatan berkelanjutan. Rutin Cuci Darah setiap 1 bulan.",
      categoryCode: "736372004",
      categoryDisplay: "Discharge care plan",
      patientId: "",
      patientName: "",
      encounterId: "",
      practitionerId: "",
      created: new Date().toISOString().slice(0, 16),
      carePlanId: "",
    },
  });

  const buildPayload = (data: CarePlanFormValues): CarePlanPayload => ({
    resourceType: "CarePlan",
    title: data.title,
    status: data.status as CarePlanPayload["status"],
    intent: data.intent as CarePlanPayload["intent"],
    description: data.description,
    category: [
      {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: data.categoryCode,
            display: data.categoryDisplay,
          },
        ],
      },
    ],
    subject: {
      reference: `Patient/${data.patientId}`,
      display: data.patientName,
    },
    encounter: { reference: `Encounter/${data.encounterId}` },
    created: new Date(data.created).toISOString(),
    author: { reference: `Practitioner/${data.practitionerId}` },
  });

  const onValidForm = (data: CarePlanFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.carePlanId || undefined : undefined,
    });
  };

  const handleRawSubmit = () => {
    const parsed = safeJsonParse(rawJson);
    if (!parsed) {
      setRawError("JSON tidak valid. Periksa format payload Anda.");
      return;
    }
    setRawError(null);
    onSubmit({ payload: parsed as CarePlanPayload });
  };

  const syncRaw = () => {
    const values = getValues();
    // Validasi form terlebih dahulu sebelum sync
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

      {/* Form mode */}
      {mode === "form" && (
        <form
          onSubmit={handleSubmit(onValidForm)}
          noValidate
          className="space-y-4"
        >
          {/* ID untuk PUT/PATCH */}
          {needsId && (
            <Section title="Identifikasi">
              <Field
                label="ID CarePlan"
                required
                error={errors.carePlanId?.message}
              >
                <input
                  {...register("carePlanId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${getInputCls(!!errors.carePlanId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          <Section title="Informasi Dasar">
            <Field
              label="Judul CarePlan"
              required
              error={errors.title?.message}
            >
              <input
                {...register("title")}
                type="text"
                placeholder="Contoh: Perencanaan Pemulangan Pasien"
                className={getInputCls(!!errors.title)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" required error={errors.status?.message}>
                <select
                  {...register("status")}
                  className={getInputCls(!!errors.status)}
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="completed">Completed</option>
                  <option value="on-hold">On Hold</option>
                  <option value="revoked">Revoked</option>
                </select>
              </Field>
              <Field label="Intent" required error={errors.intent?.message}>
                <select
                  {...register("intent")}
                  className={getInputCls(!!errors.intent)}
                >
                  <option value="plan">Plan</option>
                  <option value="proposal">Proposal</option>
                  <option value="order">Order</option>
                  <option value="option">Option</option>
                </select>
              </Field>
            </div>
            <Field label="Deskripsi" error={errors.description?.message}>
              <textarea
                {...register("description")}
                rows={3}
                placeholder="Deskripsikan rencana perawatan..."
                className={`${getInputCls(!!errors.description)} resize-none`}
              />
            </Field>
            <Field
              label="Tanggal Dibuat"
              required
              error={errors.created?.message}
            >
              <input
                {...register("created")}
                type="datetime-local"
                className={getInputCls(!!errors.created)}
              />
            </Field>
          </Section>

          <Section title="Kategori SNOMED CT">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kode" required error={errors.categoryCode?.message}>
                <input
                  {...register("categoryCode")}
                  type="text"
                  placeholder="736372004"
                  className={`${getInputCls(!!errors.categoryCode)} font-mono`}
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Display"
                required
                error={errors.categoryDisplay?.message}
              >
                <input
                  {...register("categoryDisplay")}
                  type="text"
                  placeholder="Discharge care plan"
                  className={getInputCls(!!errors.categoryDisplay)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Referensi">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Patient ID"
                required
                error={errors.patientId?.message}
              >
                <div className="flex">
                  <span className="flex items-center px-2.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-xs text-slate-400 font-mono whitespace-nowrap text-[11px]">
                    Patient/
                  </span>
                  <input
                    {...register("patientId")}
                    type="text"
                    placeholder="UUID"
                    className={`${getInputCls(!!errors.patientId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
                {errors.patientId && (
                  <p
                    className="text-[11px] text-red-600 flex items-center gap-1"
                    role="alert"
                  >
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
                    {errors.patientId.message}
                  </p>
                )}
              </Field>
              <Field
                label="Nama Pasien"
                required
                error={errors.patientName?.message}
              >
                <input
                  {...register("patientName")}
                  type="text"
                  placeholder="Nama lengkap pasien"
                  className={getInputCls(!!errors.patientName)}
                />
              </Field>
            </div>
            <Field
              label="Encounter ID"
              required
              error={errors.encounterId?.message}
            >
              <div className="flex">
                <span className="flex items-center px-2.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-[11px] text-slate-400 font-mono whitespace-nowrap">
                  Encounter/
                </span>
                <input
                  {...register("encounterId")}
                  type="text"
                  placeholder="UUID"
                  className={`${getInputCls(!!errors.encounterId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
              {errors.encounterId && (
                <p
                  className="text-[11px] text-red-600 flex items-center gap-1"
                  role="alert"
                >
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
                  {errors.encounterId.message}
                </p>
              )}
            </Field>
            <Field
              label="Practitioner ID"
              required
              error={errors.practitionerId?.message}
            >
              <div className="flex">
                <span className="flex items-center px-2.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-[11px] text-slate-400 font-mono whitespace-nowrap">
                  Practitioner/
                </span>
                <input
                  {...register("practitionerId")}
                  type="text"
                  placeholder="UUID"
                  className={`${getInputCls(!!errors.practitionerId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
              {errors.practitionerId && (
                <p
                  className="text-[11px] text-red-600 flex items-center gap-1"
                  role="alert"
                >
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
                  {errors.practitionerId.message}
                </p>
              )}
            </Field>
          </Section>

          <SubmitButton method={method} loading={loading} />
        </form>
      )}

      {/* Raw JSON mode */}
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
          <textarea
            value={rawJson}
            onChange={(e) => {
              setRawJson(e.target.value);
              setRawError(null);
            }}
            rows={16}
            placeholder='{"resourceType": "CarePlan", ...}'
            className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
              rawError
                ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
            }`}
            spellCheck={false}
            aria-label="Raw JSON payload"
          />
          {rawError && (
            <p
              className="text-[11px] text-red-600 flex items-center gap-1"
              role="alert"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
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
              {rawError}
            </p>
          )}
          <button
            type="button"
            onClick={handleRawSubmit}
            disabled={loading}
            className={submitButtonCls(method, loading)}
          >
            {loading ? <LoadingSpinner /> : <>{method} /CarePlan</>}
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
    <button
      type="submit"
      disabled={loading}
      className={submitButtonCls(method, loading)}
    >
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <span className="font-mono font-bold text-xs">{method}</span>
          <span>/CarePlan</span>
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// Komponen utama: CarePlanForm
// ─────────────────────────────────────────────
export default function CarePlanForm({
  method,
  onSubmit,
  loading,
}: CarePlanFormProps) {
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
