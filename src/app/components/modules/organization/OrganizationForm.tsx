"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useState } from "react";

import {
  organizationFormSchema,
  organizationGetSchema,
  ORG_TYPE_CODES,
  ORG_TYPE_DISPLAY,
  type OrganizationFormValues,
  type OrganizationGetValues,
} from "@/app/lib/schemas/organization.schema";
import type { OrganizationPayload } from "@/app/lib/types/fhir";
import type { HttpMethod } from "@/app/lib/types/api";
import { safeJsonParse, safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface OrganizationFormProps {
  method: HttpMethod;
  loading: boolean;
  onSubmit: (params: {
    payload?: OrganizationPayload;
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
          <span>/Organization</span>
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
  } = useForm<OrganizationGetValues>({
    resolver: yupResolver(
      organizationGetSchema,
    ) as unknown as Resolver<OrganizationGetValues>,
  });

  const onValid = (data: OrganizationGetValues) => {
    onSubmit({
      resourceId: data.organizationId || undefined,
      queryParams: {
        name: data.name || undefined,
        partof: data.partOf ? `Organization/${data.partOf}` : undefined,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <Section title="Identifikasi Langsung">
        <Field
          label="Organization ID"
          hint="Kosongkan untuk pencarian"
          error={errors.organizationId?.message}
        >
          <input
            {...register("organizationId")}
            type="text"
            placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
            className={`${ic(!!errors.organizationId)} font-mono`}
            autoComplete="off"
          />
        </Field>
      </Section>

      <Section title="Filter Pencarian">
        <Field
          label="Nama Organisasi"
          hint="Pencarian sebagian nama"
          error={errors.name?.message}
        >
          <input
            {...register("name")}
            type="text"
            placeholder="Poli Radiologi"
            className={ic(!!errors.name)}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Part Of (Induk)"
          hint="UUID organisasi induk"
          error={errors.partOf?.message}
        >
          <div className="flex">
            <RefPrefix label="Organization/" />
            <input
              {...register("partOf")}
              type="text"
              placeholder="UUID organisasi induk"
              className={`${ic(!!errors.partOf)} rounded-l-none border-l-0 font-mono`}
              autoComplete="off"
            />
          </div>
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
  onSubmit: (params: { payload: OrganizationPayload; resourceId?: string }) => void;
}) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

  const needsId = method === "PUT" || method === "PATCH";

  const orgId =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_SATU_SEHAT_ORG_ID ?? "ORG_ID_NOT_SET"
      : "ORG_ID_NOT_SET";

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors },
  } = useForm<OrganizationFormValues>({
    resolver: yupResolver(
      organizationFormSchema,
    ) as unknown as Resolver<OrganizationFormValues>,
    defaultValues: {
      organizationId: "",
      active: true,
      name: "",
      identifierValue: "",
      typeCode: "dept",
      phone: "",
      email: "",
      websiteUrl: "",
      addressLine: "",
      city: "",
      postalCode: "",
      country: "ID",
      province: "",
      cityCode: "",
      district: "",
      village: "",
      partOf: undefined,
    },
  });

  const activeValue = watch("active");

  const buildPayload = (data: OrganizationFormValues): OrganizationPayload => {
    const typeCode = data.typeCode as keyof typeof ORG_TYPE_DISPLAY;

    const telecom: OrganizationPayload["telecom"] = [];
    if (data.phone) telecom.push({ system: "phone", value: data.phone, use: "work" });
    if (data.email) telecom.push({ system: "email", value: data.email, use: "work" });
    if (data.websiteUrl) telecom.push({ system: "url", value: data.websiteUrl, use: "work" });

    const hasAddress =
      data.addressLine || data.city || data.postalCode;

    const adminCodeItems: { url: string; valueCode: string }[] = [];
    if (data.province) adminCodeItems.push({ url: "province", valueCode: data.province });
    if (data.cityCode) adminCodeItems.push({ url: "city", valueCode: data.cityCode });
    if (data.district) adminCodeItems.push({ url: "district", valueCode: data.district });
    if (data.village) adminCodeItems.push({ url: "village", valueCode: data.village });

    const address: OrganizationPayload["address"] = hasAddress
      ? [
          {
            use: "work",
            type: "both",
            line: data.addressLine ? [data.addressLine] : [],
            city: data.city ?? "",
            postalCode: data.postalCode ?? "",
            country: data.country ?? "ID",
            extension:
              adminCodeItems.length > 0
                ? [
                    {
                      url: "https://fhir.kemkes.go.id/r4/StructureDefinition/administrativeCode",
                      extension: adminCodeItems,
                    },
                  ]
                : [],
          },
        ]
      : undefined;

    return {
      resourceType: "Organization",
      active: data.active,
      identifier: [
        {
          use: "official",
          system: `http://sys-ids.kemkes.go.id/organization/${orgId}`,
          value: data.identifierValue,
        },
      ],
      type: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/organization-type",
              code: typeCode,
              display: ORG_TYPE_DISPLAY[typeCode],
            },
          ],
        },
      ],
      name: data.name,
      ...(telecom.length > 0 ? { telecom } : {}),
      ...(address ? { address } : {}),
      ...(data.partOf ? { partOf: { reference: `Organization/${data.partOf}` } } : {}),
    };
  };

  const onValidForm = (data: OrganizationFormValues) => {
    onSubmit({
      payload: buildPayload(data),
      resourceId: needsId ? data.organizationId || undefined : undefined,
    });
  };

  const handleRawSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const parsed = safeJsonParse(rawJson);
    if (!parsed) {
      setRawError("JSON tidak valid. Periksa format payload Anda.");
      return;
    }
    setRawError(null);
    onSubmit({ payload: parsed as OrganizationPayload });
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
        <form onSubmit={handleSubmit(onValidForm)} noValidate className="space-y-4">
          {needsId && (
            <Section title="Target Resource">
              <Field
                label="Organization ID"
                required
                hint="UUID resource yang akan diperbarui"
                error={errors.organizationId?.message}
              >
                <input
                  {...register("organizationId")}
                  type="text"
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className={`${ic(!!errors.organizationId)} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </Section>
          )}

          <Section title="Identitas">
            <Field label="Status Aktif">
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  {...register("active")}
                  type="checkbox"
                  className="w-4 h-4 rounded accent-teal-600"
                />
                <span className="text-sm text-slate-700">
                  {activeValue ? "Aktif" : "Tidak aktif"}
                </span>
              </label>
            </Field>

            <Field
              label="Nama Organisasi"
              required
              error={errors.name?.message}
            >
              <input
                {...register("name")}
                type="text"
                placeholder="Pos Imunisasi"
                className={ic(!!errors.name)}
                autoComplete="off"
              />
            </Field>
          </Section>

          <Section title="Identifier">
            <Field
              label="Identifier Value"
              required
              hint="Nama/kode lokal fasilitas"
              error={errors.identifierValue?.message}
            >
              <input
                {...register("identifierValue")}
                type="text"
                placeholder="Pos Imunisasi LUBUK BATANG"
                className={ic(!!errors.identifierValue)}
                autoComplete="off"
              />
            </Field>
            <p className="text-[11px] text-slate-400 font-mono break-all">
              system: http://sys-ids.kemkes.go.id/organization/{orgId}
            </p>
          </Section>

          <Section title="Tipe Organisasi">
            <Field
              label="Tipe"
              required
              error={errors.typeCode?.message}
            >
              <select {...register("typeCode")} className={ic(!!errors.typeCode)}>
                {ORG_TYPE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} — {ORG_TYPE_DISPLAY[code]}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title="Kontak">
            <Field label="Telepon" hint="Opsional" error={errors.phone?.message}>
              <input
                {...register("phone")}
                type="tel"
                placeholder="+6221-783042654"
                className={ic(!!errors.phone)}
                autoComplete="off"
              />
            </Field>

            <Field label="Email" hint="Opsional" error={errors.email?.message}>
              <input
                {...register("email")}
                type="email"
                placeholder="organisasi@example.com"
                className={ic(!!errors.email)}
                autoComplete="off"
              />
            </Field>

            <Field label="Website" hint="Opsional" error={errors.websiteUrl?.message}>
              <input
                {...register("websiteUrl")}
                type="text"
                placeholder="www.example.com"
                className={ic(!!errors.websiteUrl)}
                autoComplete="off"
              />
            </Field>
          </Section>

          <Section title="Alamat">
            <Field label="Jalan / Alamat" hint="Opsional" error={errors.addressLine?.message}>
              <input
                {...register("addressLine")}
                type="text"
                placeholder="Jalan Jati Asih No. 1"
                className={ic(!!errors.addressLine)}
                autoComplete="off"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Kota" hint="Opsional" error={errors.city?.message}>
                <input
                  {...register("city")}
                  type="text"
                  placeholder="Jakarta"
                  className={ic(!!errors.city)}
                  autoComplete="off"
                />
              </Field>

              <Field label="Kode Pos" hint="Opsional" error={errors.postalCode?.message}>
                <input
                  {...register("postalCode")}
                  type="text"
                  placeholder="55292"
                  inputMode="numeric"
                  maxLength={10}
                  className={ic(!!errors.postalCode)}
                  autoComplete="off"
                />
              </Field>
            </div>

            <Field label="Negara" error={errors.country?.message}>
              <input
                {...register("country")}
                type="text"
                placeholder="ID"
                maxLength={3}
                className={ic(!!errors.country)}
                autoComplete="off"
              />
            </Field>
          </Section>

          <Section title="Kode Wilayah (Kemendagri)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kode Provinsi" hint="2 digit" error={errors.province?.message}>
                <input
                  {...register("province")}
                  type="text"
                  placeholder="31"
                  inputMode="numeric"
                  maxLength={2}
                  className={ic(!!errors.province)}
                  autoComplete="off"
                />
              </Field>

              <Field label="Kode Kota" hint="4 digit" error={errors.cityCode?.message}>
                <input
                  {...register("cityCode")}
                  type="text"
                  placeholder="3171"
                  inputMode="numeric"
                  maxLength={4}
                  className={ic(!!errors.cityCode)}
                  autoComplete="off"
                />
              </Field>

              <Field label="Kode Kecamatan" hint="6 digit" error={errors.district?.message}>
                <input
                  {...register("district")}
                  type="text"
                  placeholder="317101"
                  inputMode="numeric"
                  maxLength={6}
                  className={ic(!!errors.district)}
                  autoComplete="off"
                />
              </Field>

              <Field label="Kode Kelurahan" hint="8 digit" error={errors.village?.message}>
                <input
                  {...register("village")}
                  type="text"
                  placeholder="31710101"
                  inputMode="numeric"
                  maxLength={8}
                  className={ic(!!errors.village)}
                  autoComplete="off"
                />
              </Field>
            </div>
          </Section>

          <Section title="Relasi">
            <Field
              label="Part Of (Induk)"
              hint="Opsional — UUID organisasi induk"
              error={errors.partOf?.message}
            >
              <div className="flex">
                <RefPrefix label="Organization/" />
                <input
                  {...register("partOf")}
                  type="text"
                  placeholder="UUID organisasi induk"
                  className={`${ic(!!errors.partOf)} rounded-l-none border-l-0 font-mono`}
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
        <form onSubmit={handleRawSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Edit payload JSON secara langsung
            </span>
            <button
              type="button"
              onClick={syncRaw}
              className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 transition-colors"
            >
              ↓ Sync dari form
            </button>
          </div>

          <textarea
            value={rawJson}
            onChange={(e) => {
              setRawJson(e.target.value);
              setRawError(null);
            }}
            rows={18}
            spellCheck={false}
            placeholder={`{\n  "resourceType": "Organization",\n  "active": true,\n  ...\n}`}
            className="w-full bg-slate-950 text-emerald-300 font-mono text-[12px] rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-teal-400/40 resize-none leading-relaxed"
          />

          {rawError && (
            <p className="flex items-center gap-1 text-[11px] text-red-600" role="alert">
              <ErrorIcon />
              {rawError}
            </p>
          )}

          <SubmitButton method={method} loading={loading} />
        </form>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────

export default function OrganizationForm({
  method,
  loading,
  onSubmit,
}: OrganizationFormProps) {
  if (method === "GET") {
    return (
      <GetForm
        loading={loading}
        onSubmit={(params) =>
          onSubmit({ resourceId: params.resourceId, queryParams: params.queryParams })
        }
      />
    );
  }

  return (
    <MutationForm
      method={method}
      loading={loading}
      onSubmit={(params) =>
        onSubmit({
          payload: params.payload,
          resourceId: params.resourceId,
        })
      }
    />
  );
}
