/**
 * components/modules/location/LocationForm.tsx
 *
 * Form input untuk resource Location.
 * Mendukung dua mode:
 *   - Form : field-by-field dengan validasi Yup + react-hook-form
 *   - Raw JSON : edit payload langsung
 *
 * Pola konsisten dengan EncounterForm.tsx dan AllergyIntoleranceForm.tsx.
 *
 * Catatan khusus Location:
 *   - `identifier.system` menggunakan Org_id dari env (tidak diinput user)
 *   - Telecom terdiri dari 3 field tetap: phone, email, url — semua opsional
 *   - `position` opsional — kosongkan jika tidak ada koordinat GPS
 *   - `managingOrganization` adalah Org_Poli yang diinput user (bukan Org_id utama)
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useState } from "react";

import {
  locationFormSchema,
  locationGetSchema,
  LOCATION_PHYSICAL_TYPE_DISPLAY,
  type LocationFormValues,
  type LocationGetValues,
} from "@/app/lib/schemas/location.schema";
import type { LocationPayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface LocationFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: LocationPayload;
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
          <span>/Location</span>
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
  } = useForm<LocationGetValues>({
    resolver: yupResolver(locationGetSchema) as unknown as Resolver<LocationGetValues>,
  });

  const onValid = (data: LocationGetValues) => {
    onSubmit({
      resourceId: data.locationId || undefined,
      queryParams: {
        name: data.name || undefined,
        status: data.status || undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Parameter Pencarian">
        <Field
          label="ID Location"
          hint="Opsional — kosongkan untuk list"
          error={errors.locationId?.message}
        >
          <input
            {...register("locationId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${ic(!!errors.locationId)} font-mono`}
            autoComplete="off"
          />
        </Field>

        <Field label="Nama Lokasi" hint="Opsional" error={errors.name?.message}>
          <input
            {...register("name")}
            type="text"
            placeholder="PENYAKIT DALAM"
            className={ic(!!errors.name)}
          />
        </Field>

        <Field label="Status" error={errors.status?.message}>
          <select {...register("status")} className={ic(!!errors.status)}>
            <option value="">Semua status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
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
  onSubmit: (params: { payload: LocationPayload; resourceId?: string }) => void;
}) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

  const needsId = method === "PUT" || method === "PATCH";

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<LocationFormValues>({
    resolver: yupResolver(locationFormSchema) as unknown as Resolver<LocationFormValues>,
    defaultValues: {
      locationId: "",
      identifierValue: "SS-UKP-POLI-ROOM",
      status: "active",
      mode: "instance",
      name: "PENYAKIT DALAM",
      description: "PENYAKIT DALAM",
      physicalTypeCode: "ro",
      telecomPhone: "",
      telecomEmail: "",
      telecomUrl: "",
      latitude: undefined,
      longitude: undefined,
      altitude: 0,
      managingOrganizationId: crypto.randomUUID(),
    },
  });

  /**
   * Bangun payload FHIR R4 dari nilai form yang sudah tervalidasi.
   *
   * - identifier.system  pakai Org_id dari env
   * - telecom            hanya sertakan channel yang ada nilainya
   * - position           hanya sertakan jika latitude dan longitude diisi
   */
  const buildPayload = (data: LocationFormValues): LocationPayload => {
    const orgId = process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET";

    // Telecom — hanya sertakan channel yang diisi
    const telecom = [
      data.telecomPhone
        ? { system: "phone" as const, value: data.telecomPhone, use: "work" as const }
        : null,
      data.telecomEmail
        ? { system: "email" as const, value: data.telecomEmail, use: "work" as const }
        : null,
      data.telecomUrl
        ? { system: "url" as const, value: data.telecomUrl, use: "work" as const }
        : null,
    ].filter(Boolean) as LocationPayload["telecom"];

    // Position — hanya sertakan jika kedua koordinat ada
    const hasPosition =
      data.latitude !== undefined && data.longitude !== undefined;
    const position = hasPosition
      ? {
          longitude: data.longitude!,
          latitude: data.latitude!,
          altitude: data.altitude ?? 0,
        }
      : undefined;

    return {
      resourceType: "Location",

      identifier: [
        {
          system: `http://sys-ids.kemkes.go.id/location/${orgId}`,
          value: data.identifierValue,
        },
      ],

      status: data.status,
      name: data.name,
      ...(data.description ? { description: data.description } : {}),
      mode: data.mode,

      ...(telecom && telecom.length > 0 ? { telecom } : {}),

      physicalType: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/location-physical-type",
            code: data.physicalTypeCode,
            display: LOCATION_PHYSICAL_TYPE_DISPLAY[data.physicalTypeCode],
          },
        ],
      },

      ...(position ? { position } : {}),

      managingOrganization: {
        reference: `Organization/${data.managingOrganizationId}`,
      },
    };
  };

  const onValidForm = (data: LocationFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.locationId || undefined : undefined,
    });
  };

  const handleRawSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = safeJsonParse(rawJson);
    if (!parsed) {
      setRawError("JSON tidak valid. Periksa format payload Anda.");
      return;
    }
    setRawError(null);
    onSubmit({ payload: parsed as LocationPayload });
  };

  const syncRaw = () => {
    const values = getValues();
    const orgId = process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET";

    const preview = {
      resourceType: "Location",
      identifier: [
        {
          system: `http://sys-ids.kemkes.go.id/location/${orgId}`,
          value: values.identifierValue,
        },
      ],
      status: values.status,
      name: values.name,
      description: values.description,
      mode: values.mode,
      telecom: [
        values.telecomPhone && { system: "phone", value: values.telecomPhone, use: "work" },
        values.telecomEmail && { system: "email", value: values.telecomEmail, use: "work" },
        values.telecomUrl && { system: "url", value: values.telecomUrl, use: "work" },
      ].filter(Boolean),
      physicalType: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/location-physical-type",
            code: values.physicalTypeCode,
            display: LOCATION_PHYSICAL_TYPE_DISPLAY[values.physicalTypeCode] ?? values.physicalTypeCode,
          },
        ],
      },
      position:
        values.latitude !== undefined && values.longitude !== undefined
          ? { longitude: values.longitude, latitude: values.latitude, altitude: values.altitude ?? 0 }
          : undefined,
      managingOrganization: {
        reference: `Organization/${values.managingOrganizationId}`,
      },
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
        <form onSubmit={handleSubmit(onValidForm)} noValidate className="space-y-4">
          {/* ID resource — hanya untuk PUT/PATCH */}
          {needsId && (
            <Section title="Identifikasi">
              <Field label="ID Location" required error={errors.locationId?.message}>
                <input
                  {...register("locationId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.locationId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          {/* Identifier lokal */}
          <Section title="Identifier Lokal">
            <Field
              label="Kode Lokasi"
              required
              hint="Kode lokasi dari sistem fasilitas"
              error={errors.identifierValue?.message}
            >
              <div className="flex">
                <span className="flex items-center px-2.5 bg-emerald-50 border border-r-0 border-emerald-200 rounded-l-xl text-[10px] text-emerald-600 font-mono whitespace-nowrap max-w-45 truncate">
                  sys-ids.kemkes.go.id/location/…
                </span>
                <input
                  {...register("identifierValue")}
                  type="text"
                  placeholder="SS-UKP-POLI-ROOM"
                  className={`${ic(!!errors.identifierValue)} rounded-l-none border-l-0 font-mono`}
                  autoComplete="off"
                />
              </div>
            </Field>
          </Section>

          {/* Status, Mode, Tipe Fisik */}
          <Section title="Status & Klasifikasi">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Status" required error={errors.status?.message}>
                <select {...register("status")} className={ic(!!errors.status)}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>

              <Field label="Mode" required error={errors.mode?.message}>
                <select {...register("mode")} className={ic(!!errors.mode)}>
                  <option value="instance">Instance — Lokasi nyata</option>
                  <option value="kind">Kind — Template generik</option>
                </select>
              </Field>

              <Field
                label="Tipe Fisik"
                required
                hint="physical-type"
                error={errors.physicalTypeCode?.message}
              >
                <select
                  {...register("physicalTypeCode")}
                  className={ic(!!errors.physicalTypeCode)}
                >
                  <option value="ro">ro — Room</option>
                  <option value="wa">wa — Ward</option>
                  <option value="bu">bu — Building</option>
                  <option value="wi">wi — Wing</option>
                  <option value="lvl">lvl — Level</option>
                  <option value="co">co — Corridor</option>
                  <option value="bd">bd — Bed</option>
                  <option value="si">si — Site</option>
                  <option value="ve">ve — Vehicle</option>
                  <option value="ho">ho — House</option>
                  <option value="ca">ca — Cabinet</option>
                  <option value="rd">rd — Road</option>
                  <option value="area">area — Area</option>
                  <option value="jdn">jdn — Junction</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* Nama & Deskripsi */}
          <Section title="Nama & Deskripsi">
            <Field label="Nama Lokasi" required error={errors.name?.message}>
              <input
                {...register("name")}
                type="text"
                placeholder="PENYAKIT DALAM"
                className={ic(!!errors.name)}
              />
            </Field>

            <Field label="Deskripsi" hint="Opsional" error={errors.description?.message}>
              <input
                {...register("description")}
                type="text"
                placeholder="PENYAKIT DALAM"
                className={ic(!!errors.description)}
              />
            </Field>
          </Section>

          {/* Telecom */}
          <Section title="Kontak (Telecom)">
            <p className="text-[11px] text-slate-400">
              Semua opsional — kosongkan jika tidak ada.
            </p>

            <Field label="Nomor Telepon" hint="phone" error={errors.telecomPhone?.message}>
              <div className="flex">
                <RefPrefix label="phone" />
                <input
                  {...register("telecomPhone")}
                  type="tel"
                  placeholder="089698533212"
                  className={`${ic(!!errors.telecomPhone)} rounded-l-none border-l-0`}
                />
              </div>
            </Field>

            <Field label="Email" hint="email" error={errors.telecomEmail?.message}>
              <div className="flex">
                <RefPrefix label="email" />
                <input
                  {...register("telecomEmail")}
                  type="email"
                  placeholder="int@gmail.com"
                  className={`${ic(!!errors.telecomEmail)} rounded-l-none border-l-0`}
                />
              </div>
            </Field>

            <Field label="URL Website" hint="url" error={errors.telecomUrl?.message}>
              <div className="flex">
                <RefPrefix label="url" />
                <input
                  {...register("telecomUrl")}
                  type="text"
                  placeholder="dto.kemkes.go.id"
                  className={`${ic(!!errors.telecomUrl)} rounded-l-none border-l-0`}
                />
              </div>
            </Field>
          </Section>

          {/* Posisi GPS */}
          <Section title="Koordinat GPS">
            <p className="text-[11px] text-slate-400">
              Opsional — kosongkan jika tidak ada data koordinat.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Latitude" error={errors.latitude?.message}>
                <input
                  {...register("latitude", { valueAsNumber: true })}
                  type="number"
                  step="any"
                  placeholder="-6.23115"
                  className={ic(!!errors.latitude)}
                />
              </Field>

              <Field label="Longitude" error={errors.longitude?.message}>
                <input
                  {...register("longitude", { valueAsNumber: true })}
                  type="number"
                  step="any"
                  placeholder="106.83239"
                  className={ic(!!errors.longitude)}
                />
              </Field>

              <Field label="Altitude" hint="default 0" error={errors.altitude?.message}>
                <input
                  {...register("altitude", { valueAsNumber: true })}
                  type="number"
                  step="any"
                  placeholder="0"
                  className={ic(!!errors.altitude)}
                />
              </Field>
            </div>
          </Section>

          {/* Managing Organization */}
          <Section title="Managing Organization">
            <Field
              label="Organization ID (Org Poli)"
              required
              hint="Organisasi yang mengelola lokasi ini"
              error={errors.managingOrganizationId?.message}
            >
              <div className="flex gap-2">
                <div className="flex flex-1">
                  <RefPrefix label="Organization/" />
                  <input
                    {...register("managingOrganizationId")}
                    type="text"
                    placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                    className={`${ic(!!errors.managingOrganizationId)} rounded-l-none border-l-0 font-mono`}
                    autoComplete="off"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setValue("managingOrganizationId", crypto.randomUUID(), { shouldValidate: true })}
                  className="shrink-0 px-3 py-2.5 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl border border-slate-200 transition-colors whitespace-nowrap"
                >
                  ↻ Generate
                </button>
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
              rows={22}
              placeholder='{"resourceType": "Location", ...}'
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-mono text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 transition-all ${
                rawError
                  ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                  : "border-slate-200 focus:ring-teal-400/40 focus:border-teal-400"
              }`}
              spellCheck={false}
              aria-label="Raw JSON payload Location"
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
                  /Location
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

export default function LocationForm({
  method,
  loading,
  onSubmit,
}: LocationFormProps) {
  if (method === "GET") {
    return <GetForm loading={loading} onSubmit={(params) => onSubmit(params)} />;
  }

  return (
    <MutationForm
      method={method}
      loading={loading}
      onSubmit={(params) => onSubmit(params)}
    />
  );
}
