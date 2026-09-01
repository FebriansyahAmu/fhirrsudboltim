"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useState } from "react";

import {
  medicationDispenseFormSchema,
  medicationDispenseGetSchema,
  type MedicationDispenseFormValues,
  type MedicationDispenseGetValues,
} from "@/app/lib/schemas/medication-dispense.schema";
import type { MedicationDispensePayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

/** Payload yang di-autofill dari panel SIMGOS (Raw JSON). */
type AutofillRaw = { json: string; nonce: number } | null;

interface MedicationDispenseFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: MedicationDispensePayload;
    resourceId?: string;
    queryParams?: Record<string, string | undefined>;
  }) => void;
  autofillRaw?: AutofillRaw;
}

const CATEGORY_SYSTEM =
  "http://terminology.hl7.org/fhir/CodeSystem/medicationdispense-category";
const QTY_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm";

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
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all duration-150";
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
  } = useForm<MedicationDispenseGetValues>({
    resolver: yupResolver(
      medicationDispenseGetSchema,
    ) as unknown as Resolver<MedicationDispenseGetValues>,
  });

  const onValid = (data: MedicationDispenseGetValues) => {
    onSubmit({
      resourceId: data.medicationDispenseId || undefined,
      queryParams: {
        subject: data.patientId ? `Patient/${data.patientId}` : undefined,
        prescription: data.prescriptionId
          ? `MedicationRequest/${data.prescriptionId}`
          : undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID MedicationDispense"
          hint="Opsional — kosongkan untuk pencarian"
          error={errors.medicationDispenseId?.message}
        >
          <input
            {...register("medicationDispenseId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${cx(!!errors.medicationDispenseId)} font-mono`}
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Patient ID" error={errors.patientId?.message}>
            <input
              {...register("patientId")}
              type="text"
              placeholder="ID pasien"
              className={`${cx(!!errors.patientId)} font-mono`}
              autoComplete="off"
            />
          </Field>
          <Field label="MedicationRequest ID" error={errors.prescriptionId?.message}>
            <input
              {...register("prescriptionId")}
              type="text"
              placeholder="UUID resep"
              className={`${cx(!!errors.prescriptionId)} font-mono`}
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
    payload: MedicationDispensePayload;
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
  } = useForm<MedicationDispenseFormValues>({
    resolver: yupResolver(
      medicationDispenseFormSchema,
    ) as unknown as Resolver<MedicationDispenseFormValues>,
    defaultValues: {
      status: "completed",
      categoryCode: "outpatient",
      categoryDisplay: "Outpatient",
      medicationId: "",
      medicationDisplay: "",
      subjectPatientId: "",
      subjectDisplay: "",
      encounterId: "",
      prescriptionId: "",
      performerId: "",
      locationId: "",
      quantityValue: "",
      quantityUnit: "TAB",
      whenHandedOver: new Date().toISOString().slice(0, 16),
      medicationDispenseId: "",
    },
  });

  const buildPayload = (
    data: MedicationDispenseFormValues,
  ): MedicationDispensePayload => {
    const payload: MedicationDispensePayload = {
      resourceType: "MedicationDispense",
      status: data.status,
      category: {
        coding: [
          {
            system: CATEGORY_SYSTEM,
            code: data.categoryCode,
            display: data.categoryDisplay,
          },
        ],
      },
      medicationReference: {
        reference: `Medication/${data.medicationId}`,
        ...(data.medicationDisplay ? { display: data.medicationDisplay } : {}),
      },
      subject: {
        reference: `Patient/${data.subjectPatientId}`,
        ...(data.subjectDisplay ? { display: data.subjectDisplay } : {}),
      },
      context: { reference: `Encounter/${data.encounterId}` },
      authorizingPrescription: [
        { reference: `MedicationRequest/${data.prescriptionId}` },
      ],
      whenHandedOver: new Date(data.whenHandedOver).toISOString(),
    };

    if (data.performerId) {
      payload.performer = [
        { actor: { reference: `Practitioner/${data.performerId}` } },
      ];
    }
    if (data.locationId) {
      payload.location = { reference: `Location/${data.locationId}` };
    }
    if (data.quantityValue && data.quantityValue.trim()) {
      payload.quantity = {
        value: parseFloat(data.quantityValue),
        ...(data.quantityUnit ? { unit: data.quantityUnit, code: data.quantityUnit } : {}),
        system: QTY_SYSTEM,
      };
    }

    return payload;
  };

  const onValidForm = (data: MedicationDispenseFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.medicationDispenseId || undefined : undefined,
    });
  };

  const handleRawSubmit = () => {
    const parsed = safeJsonParse(rawJson);
    if (!parsed) {
      setRawError("JSON tidak valid. Periksa format payload Anda.");
      return;
    }
    setRawError(null);
    onSubmit({ payload: parsed as MedicationDispensePayload });
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

      <p className="rounded-xl bg-green-50/60 border border-green-100 px-3 py-2 text-[11px] text-green-800">
        Butuh <span className="font-semibold">Medication</span>,
        <span className="font-semibold"> Encounter</span> &amp;
        <span className="font-semibold"> MedicationRequest</span> yang sudah
        terkirim. Untuk <span className="font-semibold">dosageInstruction</span>{" "}
        lengkap, pakai <span className="font-semibold">Autofill</span> atau mode{" "}
        <span className="font-mono">Raw JSON</span>.
      </p>

      {/* Form mode */}
      {mode === "form" && (
        <form onSubmit={handleSubmit(onValidForm)} noValidate className="space-y-4">
          {needsId && (
            <Section title="Identifikasi">
              <Field
                label="ID MedicationDispense"
                required
                error={errors.medicationDispenseId?.message}
              >
                <input
                  {...register("medicationDispenseId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${cx(!!errors.medicationDispenseId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          <Section title="Informasi Penyerahan">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" required error={errors.status?.message}>
                <select {...register("status")} className={cx(!!errors.status)}>
                  <option value="completed">completed</option>
                  <option value="in-progress">in-progress</option>
                  <option value="preparation">preparation</option>
                  <option value="on-hold">on-hold</option>
                  <option value="cancelled">cancelled</option>
                  <option value="stopped">stopped</option>
                  <option value="declined">declined</option>
                  <option value="entered-in-error">entered-in-error</option>
                  <option value="unknown">unknown</option>
                </select>
              </Field>
              <Field
                label="Waktu Diserahkan"
                required
                error={errors.whenHandedOver?.message}
              >
                <input
                  {...register("whenHandedOver")}
                  type="datetime-local"
                  className={cx(!!errors.whenHandedOver)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Kode Kategori"
                required
                error={errors.categoryCode?.message}
              >
                <input
                  {...register("categoryCode")}
                  type="text"
                  placeholder="outpatient"
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
                  placeholder="Outpatient"
                  className={cx(!!errors.categoryDisplay)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jumlah" error={errors.quantityValue?.message}>
                <input
                  {...register("quantityValue")}
                  type="text"
                  inputMode="decimal"
                  placeholder="120"
                  className={`${cx(!!errors.quantityValue)} font-mono`}
                  autoComplete="off"
                />
              </Field>
              <Field label="Satuan" error={errors.quantityUnit?.message}>
                <input
                  {...register("quantityUnit")}
                  type="text"
                  placeholder="TAB"
                  className={`${cx(!!errors.quantityUnit)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </div>
          </Section>

          <Section title="Obat & Resep (harus terkirim dulu)">
            <Field label="Medication ID" required error={errors.medicationId?.message}>
              <div className="flex">
                <RefPrefix text="Medication/" />
                <input
                  {...register("medicationId")}
                  type="text"
                  placeholder="UUID Medication"
                  className={`${cx(!!errors.medicationId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>
            <Field label="Nama Obat" error={errors.medicationDisplay?.message}>
              <input
                {...register("medicationDisplay")}
                type="text"
                placeholder="Opsional"
                className={cx(!!errors.medicationDisplay)}
              />
            </Field>
            <Field
              label="MedicationRequest ID"
              required
              hint="authorizingPrescription"
              error={errors.prescriptionId?.message}
            >
              <div className="flex">
                <RefPrefix text="MedicationRequest/" />
                <input
                  {...register("prescriptionId")}
                  type="text"
                  placeholder="UUID resep"
                  className={`${cx(!!errors.prescriptionId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
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
                  placeholder="UUID (context)"
                  className={`${cx(!!errors.encounterId)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Practitioner ID"
                hint="Pelaksana — opsional"
                error={errors.performerId?.message}
              >
                <div className="flex">
                  <RefPrefix text="Practitioner/" />
                  <input
                    {...register("performerId")}
                    type="text"
                    placeholder="Opsional"
                    className={`${cx(!!errors.performerId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
              <Field
                label="Location ID"
                hint="Apotek — opsional"
                error={errors.locationId?.message}
              >
                <div className="flex">
                  <RefPrefix text="Location/" />
                  <input
                    {...register("locationId")}
                    type="text"
                    placeholder="Opsional"
                    className={`${cx(!!errors.locationId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
              </Field>
            </div>
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
              className="text-[11px] text-green-700 hover:text-green-900 font-medium transition-colors"
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
            placeholder='{"resourceType": "MedicationDispense", ...}'
            className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
              rawError
                ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                : "border-slate-200 focus:ring-green-400/40 focus:border-green-400"
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
            {loading ? <LoadingSpinner /> : <>{method} /MedicationDispense</>}
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
    POST: "bg-green-600 hover:bg-green-700 text-white shadow-sm shadow-green-200",
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
          <span>/MedicationDispense</span>
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// Komponen utama
// ─────────────────────────────────────────────
export default function MedicationDispenseForm({
  method,
  loading,
  onSubmit,
  autofillRaw,
}: MedicationDispenseFormProps) {
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
