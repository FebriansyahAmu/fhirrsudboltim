/**
 * components/modules/patient/PatientForm.tsx
 *
 * Form input untuk resource Patient.
 * Mendukung dua mode:
 *   - Form : field-by-field dengan validasi Yup + react-hook-form
 *   - Raw JSON : edit payload langsung
 *
 * Catatan khusus Patient:
 *   - NIK divalidasi 16 digit — identifier utama di Satu Sehat
 *   - Kode wilayah administratif (BPS): provinsi, kota, kecamatan, kelurahan
 *   - Kontak darurat — opsional, hanya disertakan jika nama diisi
 *   - Bahasa komunikasi — default Indonesian, bisa diubah via Raw JSON
 *   - meta.profile — fixed, tidak diinput user
 *
 * Pola konsisten dengan EncounterForm.tsx.
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useState } from "react";

import {
  patientFormSchema,
  patientGetSchema,
  PATIENT_GENDER_VALUES,
  MARITAL_STATUS_CODES,
  CONTACT_RELATIONSHIP_CODES,
  type PatientFormValues,
  type PatientGetValues,
  type MaritalStatusCode,
} from "@/app/lib/schemas/patient.schema";
import type { PatientPayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface PatientFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: PatientPayload;
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
        <p className="flex items-center gap-1 text-[11px] text-red-600" role="alert">
          <ErrorIcon />
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

function ErrorIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="shrink-0">
      <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 3.5V5.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="5.5" cy="7.5" r="0.5" fill="currentColor" />
    </svg>
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
  PATCH: "bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-200",
};

function SubmitButton({ method, loading }: { method: HttpMethod; loading: boolean }) {
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
          <span>/Patient</span>
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
  } = useForm<PatientGetValues>({
    resolver: yupResolver(patientGetSchema) as unknown as Resolver<PatientGetValues>,
  });

  const onValid = (data: PatientGetValues) => {
    // NIK dikirim sebagai identifier dengan system prefix (format FHIR)
    const nikParam = data.nik
      ? `https://fhir.kemkes.go.id/id/nik|${data.nik}`
      : undefined;

    onSubmit({
      resourceId: data.patientId || undefined,
      queryParams: {
        identifier: nikParam,
        name: data.name || undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="Patient ID"
          hint="Opsional — kosongkan untuk list"
          error={errors.patientId?.message}
        >
          <input
            {...register("patientId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${ic(!!errors.patientId)} font-mono`}
            autoComplete="off"
          />
        </Field>

        <Field
          label="NIK"
          hint="Opsional — filter berdasarkan NIK"
          error={errors.nik?.message}
        >
          <input
            {...register("nik")}
            type="text"
            placeholder="3212121007331111"
            maxLength={16}
            className={`${ic(!!errors.nik)} font-mono tracking-widest`}
            autoComplete="off"
            inputMode="numeric"
          />
        </Field>

        <Field
          label="Nama Pasien"
          hint="Opsional — pencarian parsial"
          error={errors.name?.message}
        >
          <input
            {...register("name")}
            type="text"
            placeholder="Dunstan"
            className={ic(!!errors.name)}
            autoComplete="off"
          />
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
  onSubmit: (params: { payload: PatientPayload; resourceId?: string }) => void;
}) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

  const needsId = method === "PUT" || method === "PATCH";

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors },
  } = useForm<PatientFormValues>({
    resolver: yupResolver(patientFormSchema) as unknown as Resolver<PatientFormValues>,
    defaultValues: {
      patientId: "",
      nik: "",
      active: true,
      name: "",
      gender: "male",
      birthDate: "",
      deceasedBoolean: false,
      addressLine: "",
      addressCity: "",
      addressPostalCode: "",
      addressCountry: "ID",
      province: "",
      cityCode: "",
      district: "",
      village: "",
      rw: "",
      rt: "",
      maritalStatusCode: "",
      multipleBirthInteger: 0,
      contactName: "",
      contactPhone: "",
      contactRelationship: "C",
    },
  });

  const contactName = watch("contactName");

  /**
   * Bangun payload FHIR R4 dari nilai form yang sudah tervalidasi.
   *
   * Catatan:
   * - `meta.profile` selalu disertakan (required oleh Satu Sehat)
   * - `address.extension` menggunakan skema administrativeCode Satu Sehat
   * - `contact` hanya disertakan jika nama kontak diisi
   * - `communication` default Indonesian, tidak diinput user
   */
  const buildPayload = (data: PatientFormValues): PatientPayload => {
    // Bangun extension kode wilayah — rw/rt opsional
    const adminExtensions: Array<{ url: string; valueCode: string }> = [
      { url: "province", valueCode: data.province },
      { url: "city", valueCode: data.cityCode },
      { url: "district", valueCode: data.district },
      { url: "village", valueCode: data.village },
    ];
    if (data.rw?.trim()) adminExtensions.push({ url: "rw", valueCode: data.rw.trim() });
    if (data.rt?.trim()) adminExtensions.push({ url: "rt", valueCode: data.rt.trim() });

    // Kontak darurat — hanya jika nama diisi
    const hasContact = data.contactName?.trim();

    return {
      resourceType: "Patient",

      meta: {
        profile: ["https://fhir.kemkes.go.id/r4/StructureDefinition/Patient"],
      },

      identifier: [
        {
          use: "official",
          system: "https://fhir.kemkes.go.id/id/nik",
          value: data.nik,
        },
      ],

      active: data.active,

      name: [
        {
          use: "official",
          text: data.name,
        },
      ],

      gender: data.gender,

      birthDate: data.birthDate,

      deceasedBoolean: data.deceasedBoolean,

      address: [
        {
          use: "home",
          line: [data.addressLine],
          city: data.addressCity,
          ...(data.addressPostalCode?.trim()
            ? { postalCode: data.addressPostalCode.trim() }
            : {}),
          country: data.addressCountry || "ID",
          extension: [
            {
              url: "https://fhir.kemkes.go.id/r4/StructureDefinition/administrativeCode",
              extension: adminExtensions,
            },
          ],
        },
      ],

      ...(data.maritalStatusCode
        ? {
            maritalStatus: {
              coding: [
                {
                  system:
                    "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
                  code: data.maritalStatusCode,
                  display:
                    MARITAL_STATUS_CODES[
                      data.maritalStatusCode as MaritalStatusCode
                    ] ?? data.maritalStatusCode,
                },
              ],
              text:
                MARITAL_STATUS_CODES[
                  data.maritalStatusCode as MaritalStatusCode
                ] ?? data.maritalStatusCode,
            },
          }
        : {}),

      multipleBirthInteger: data.multipleBirthInteger ?? 0,

      ...(hasContact
        ? {
            contact: [
              {
                relationship: [
                  {
                    coding: [
                      {
                        system:
                          "http://terminology.hl7.org/CodeSystem/v2-0131",
                        code: data.contactRelationship || "C",
                      },
                    ],
                  },
                ],
                name: {
                  use: "official",
                  text: data.contactName!.trim(),
                },
                ...(data.contactPhone?.trim()
                  ? {
                      telecom: [
                        {
                          system: "phone" as const,
                          value: data.contactPhone.trim(),
                          use: "mobile" as const,
                        },
                      ],
                    }
                  : {}),
              },
            ],
          }
        : {}),

      communication: [
        {
          language: {
            coding: [
              {
                system: "urn:ietf:bcp:47",
                code: "id-ID",
                display: "Indonesian",
              },
            ],
            text: "Indonesian",
          },
          preferred: true,
        },
      ],
    };
  };

  const onValidForm = (data: PatientFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.patientId || undefined : undefined,
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
    onSubmit({ payload: parsed as PatientPayload });
  };

  const syncRaw = () => {
    try {
      const preview = buildPayload(getValues());
      setRawJson(safeJsonStringify(preview));
    } catch {
      setRawJson(safeJsonStringify(getValues()));
    }
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
        <form onSubmit={handleSubmit(onValidForm)} noValidate className="space-y-4">

          {/* ID resource — hanya untuk PUT/PATCH */}
          {needsId && (
            <Section title="Identifikasi">
              <Field label="Patient ID" required error={errors.patientId?.message}>
                <input
                  {...register("patientId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.patientId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          {/* NIK */}
          <Section title="Identifikasi Pasien">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="NIK"
                required
                hint="16 digit Nomor Induk Kependudukan"
                error={errors.nik?.message}
              >
                <div className="flex">
                  <span className="flex items-center px-2.5 bg-blue-50 border border-r-0 border-blue-200 rounded-l-xl text-[10px] text-blue-600 font-mono whitespace-nowrap">
                    nik|
                  </span>
                  <input
                    {...register("nik")}
                    type="text"
                    placeholder="3212121007331111"
                    maxLength={16}
                    className={`${ic(!!errors.nik)} rounded-l-none border-l-0 font-mono tracking-widest`}
                    autoComplete="off"
                    inputMode="numeric"
                  />
                </div>
              </Field>

              <Field label="Status Aktif" error={errors.active?.message}>
                <div className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-xl bg-white h-[42px]">
                  <input
                    {...register("active")}
                    type="checkbox"
                    id="active"
                    className="w-4 h-4 rounded accent-teal-600"
                  />
                  <label htmlFor="active" className="text-sm text-slate-700 cursor-pointer">
                    Pasien aktif
                  </label>
                </div>
              </Field>
            </div>
          </Section>

          {/* Data Pribadi */}
          <Section title="Data Pribadi">
            <Field label="Nama Lengkap" required error={errors.name?.message}>
              <input
                {...register("name")}
                type="text"
                placeholder="DUNSTAN GAGG"
                className={`${ic(!!errors.name)} uppercase`}
                autoComplete="off"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Jenis Kelamin" required error={errors.gender?.message}>
                <select {...register("gender")} className={ic(!!errors.gender)}>
                  <option value="male">Laki-laki (male)</option>
                  <option value="female">Perempuan (female)</option>
                  <option value="other">Lainnya (other)</option>
                  <option value="unknown">Tidak diketahui (unknown)</option>
                </select>
              </Field>

              <Field
                label="Tanggal Lahir"
                required
                hint="YYYY-MM-DD"
                error={errors.birthDate?.message}
              >
                <input
                  {...register("birthDate")}
                  type="date"
                  className={ic(!!errors.birthDate)}
                />
              </Field>
            </div>

            <div className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-xl bg-white">
              <input
                {...register("deceasedBoolean")}
                type="checkbox"
                id="deceased"
                className="w-4 h-4 rounded accent-red-500"
              />
              <label htmlFor="deceased" className="text-sm text-slate-700 cursor-pointer">
                Pasien telah meninggal dunia (deceasedBoolean)
              </label>
            </div>
          </Section>

          {/* Alamat */}
          <Section title="Alamat Domisili">
            <Field
              label="Alamat Lengkap"
              required
              hint="address.line[0]"
              error={errors.addressLine?.message}
            >
              <input
                {...register("addressLine")}
                type="text"
                placeholder="Jl. H.R. Rasuna Said Blok X5 Kav. 4-9 Kuningan"
                className={ic(!!errors.addressLine)}
                autoComplete="off"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Kota / Kabupaten" required error={errors.addressCity?.message}>
                <input
                  {...register("addressCity")}
                  type="text"
                  placeholder="Jakarta"
                  className={ic(!!errors.addressCity)}
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Kode Pos"
                hint="5 digit"
                error={errors.addressPostalCode?.message}
              >
                <input
                  {...register("addressPostalCode")}
                  type="text"
                  placeholder="12950"
                  maxLength={5}
                  className={`${ic(!!errors.addressPostalCode)} font-mono`}
                  autoComplete="off"
                  inputMode="numeric"
                />
              </Field>

              <Field label="Negara" error={errors.addressCountry?.message}>
                <input
                  {...register("addressCountry")}
                  type="text"
                  placeholder="ID"
                  className={`${ic(!!errors.addressCountry)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </div>
          </Section>

          {/* Kode Wilayah Administratif */}
          <Section title="Kode Wilayah (BPS / Kemendagri)">
            <p className="text-[11px] text-slate-400">
              Kode wilayah sesuai data BPS. Digunakan oleh Satu Sehat untuk verifikasi alamat pasien.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field
                label="Provinsi"
                required
                hint="2 digit"
                error={errors.province?.message}
              >
                <input
                  {...register("province")}
                  type="text"
                  placeholder="32"
                  maxLength={2}
                  className={`${ic(!!errors.province)} font-mono tracking-widest`}
                  autoComplete="off"
                  inputMode="numeric"
                />
              </Field>

              <Field
                label="Kota/Kab."
                required
                hint="4 digit"
                error={errors.cityCode?.message}
              >
                <input
                  {...register("cityCode")}
                  type="text"
                  placeholder="3212"
                  maxLength={4}
                  className={`${ic(!!errors.cityCode)} font-mono tracking-widest`}
                  autoComplete="off"
                  inputMode="numeric"
                />
              </Field>

              <Field
                label="Kecamatan"
                required
                hint="6 digit"
                error={errors.district?.message}
              >
                <input
                  {...register("district")}
                  type="text"
                  placeholder="321212"
                  maxLength={6}
                  className={`${ic(!!errors.district)} font-mono tracking-widest`}
                  autoComplete="off"
                  inputMode="numeric"
                />
              </Field>

              <Field
                label="Kelurahan/Desa"
                required
                hint="10 digit"
                error={errors.village?.message}
              >
                <input
                  {...register("village")}
                  type="text"
                  placeholder="3212122013"
                  maxLength={10}
                  className={`${ic(!!errors.village)} font-mono tracking-widest`}
                  autoComplete="off"
                  inputMode="numeric"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="RW"
                hint="Opsional"
                error={errors.rw?.message}
              >
                <input
                  {...register("rw")}
                  type="text"
                  placeholder="4"
                  maxLength={3}
                  className={`${ic(!!errors.rw)} font-mono`}
                  autoComplete="off"
                  inputMode="numeric"
                />
              </Field>

              <Field
                label="RT"
                hint="Opsional"
                error={errors.rt?.message}
              >
                <input
                  {...register("rt")}
                  type="text"
                  placeholder="50"
                  maxLength={3}
                  className={`${ic(!!errors.rt)} font-mono`}
                  autoComplete="off"
                  inputMode="numeric"
                />
              </Field>
            </div>
          </Section>

          {/* Status Pernikahan & Kelahiran */}
          <Section title="Status Pernikahan & Kelahiran">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Status Pernikahan"
                hint="Opsional"
                error={errors.maritalStatusCode?.message}
              >
                <select
                  {...register("maritalStatusCode")}
                  className={ic(!!errors.maritalStatusCode)}
                >
                  <option value="">— Tidak diisi —</option>
                  {(Object.entries(MARITAL_STATUS_CODES) as [string, string][]).map(
                    ([code, label]) => (
                      <option key={code} value={code}>
                        {code} — {label}
                      </option>
                    ),
                  )}
                </select>
              </Field>

              <Field
                label="Status Kembar"
                hint="0 = bukan kembar; ≥1 = urutan kembar"
                error={errors.multipleBirthInteger?.message}
              >
                <input
                  {...register("multipleBirthInteger", { valueAsNumber: true })}
                  type="number"
                  min={0}
                  max={9}
                  className={`${ic(!!errors.multipleBirthInteger)} font-mono`}
                />
              </Field>
            </div>
          </Section>

          {/* Kontak Darurat */}
          <Section title="Kontak Darurat (Opsional)">
            <p className="text-[11px] text-slate-400">
              Kosongkan nama jika tidak ada kontak darurat.
            </p>

            <Field
              label="Nama Kontak"
              hint="Opsional"
              error={errors.contactName?.message}
            >
              <input
                {...register("contactName")}
                type="text"
                placeholder="HESTIA BAYBUTT"
                className={`${ic(!!errors.contactName)} uppercase`}
                autoComplete="off"
              />
            </Field>

            {Boolean(contactName?.trim()) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Hubungan"
                  error={errors.contactRelationship?.message}
                >
                  <select
                    {...register("contactRelationship")}
                    className={ic(!!errors.contactRelationship)}
                  >
                    {(Object.entries(CONTACT_RELATIONSHIP_CODES) as [string, string][]).map(
                      ([code, label]) => (
                        <option key={code} value={code}>
                          {code} — {label}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <Field
                  label="Nomor Telepon"
                  hint="Nomor HP kontak darurat"
                  error={errors.contactPhone?.message}
                >
                  <input
                    {...register("contactPhone")}
                    type="tel"
                    placeholder="0690383372"
                    className={`${ic(!!errors.contactPhone)} font-mono`}
                    autoComplete="off"
                  />
                </Field>
              </div>
            )}
          </Section>

          {/* Info komunikasi — fixed Indonesian */}
          <div className="px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[11px] text-slate-500">
              <span className="font-semibold">Komunikasi:</span> Default Indonesian (id-ID) —
              ubah via Raw JSON jika berbeda.
            </p>
          </div>

          <SubmitButton method={method} loading={loading} />
        </form>
      )}

      {/* ── Raw JSON mode ── */}
      {mode === "raw" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Raw JSON Payload</span>
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
              rows={28}
              placeholder='{"resourceType": "Patient", ...}'
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
                rawError
                  ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                  : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
              }`}
              spellCheck={false}
              aria-label="Raw JSON payload Patient"
            />

            {rawError && (
              <p className="flex items-center gap-1 text-[11px] text-red-600" role="alert">
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
                  : (SUBMIT_COLOR[method] ?? "bg-slate-600 text-white hover:bg-slate-700")
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
                  /Patient
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

export default function PatientForm({
  method,
  loading,
  onSubmit,
}: PatientFormProps) {
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
