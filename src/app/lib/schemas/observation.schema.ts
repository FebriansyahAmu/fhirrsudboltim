/**
 * lib/schemas/observation.schema.ts
 *
 * Yup validation schema untuk form Observation.
 * Pola konsisten dengan condition.schema.ts & careplan.schemas.ts.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/observation.html
 * Contoh payload: Postman "00. FHIR Resource - Contoh Penggunaan" →
 *   Resource → Observation - TTV.
 */

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kode observasi — LOINC ("8867-4") atau SNOMED (angka). */
const CODE_REGEX = /^[A-Za-z0-9.\-]{1,20}$/;

/** Angka desimal (opsional tanda minus/titik). */
const NUMBER_REGEX = /^-?\d+(\.\d+)?$/;

const OBSERVATION_STATUS = [
  "registered",
  "preliminary",
  "final",
  "amended",
  "corrected",
  "cancelled",
  "entered-in-error",
  "unknown",
] as const;

const optionalUuid = (label: string) =>
  Yup.string()
    .optional()
    .default(undefined)
    .test(`uuid-if-present-${label}`, `${label} harus dalam format UUID`, (v) => {
      if (!v) return true;
      return UUID_REGEX.test(v);
    })
    .trim();

// ─────────────────────────────────────────────
// Schema: POST / PUT / PATCH
// ─────────────────────────────────────────────

export const observationFormSchema = Yup.object({
  // Identifikasi resource (hanya untuk PUT/PATCH)
  observationId: optionalUuid("Observation ID"),

  // Status
  status: Yup.string()
    .oneOf(OBSERVATION_STATUS as unknown as string[], "Status tidak valid")
    .required("Status wajib dipilih"),

  // Kategori (mis. vital-signs)
  categoryCode: Yup.string().required("Kode kategori wajib diisi").trim(),
  categoryDisplay: Yup.string()
    .required("Nama kategori wajib diisi")
    .max(100, "Nama kategori maksimal 100 karakter")
    .trim(),

  // Kode observasi
  codeSystem: Yup.string()
    .oneOf(["loinc", "snomed"], "Sistem kode tidak valid")
    .required("Sistem kode wajib dipilih"),
  codeValue: Yup.string()
    .required("Kode observasi wajib diisi")
    .matches(CODE_REGEX, "Kode observasi tidak valid (huruf/angka/titik/strip)")
    .trim(),
  codeDisplay: Yup.string()
    .required("Nama observasi wajib diisi")
    .max(300, "Nama observasi maksimal 300 karakter")
    .trim(),

  // Referensi Pasien
  subjectPatientId: Yup.string().required("Patient ID wajib diisi").trim(),
  subjectDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // Referensi Encounter — Observation dikirim dalam konteks kunjungan
  encounterId: Yup.string().required("Encounter ID wajib diisi").trim(),

  // Pelaksana (Practitioner) — opsional
  performerId: Yup.string().optional().default(undefined).trim(),

  // Waktu efektif
  effectiveDateTime: Yup.string()
    .required("Tanggal efektif wajib diisi")
    .test("is-valid-date", "Tanggal tidak valid", (v) => {
      if (!v) return false;
      return !isNaN(new Date(v).getTime());
    }),

  // Nilai (value[x]) — pilih Quantity ATAU String.
  // Angka → valueQuantity; teks → valueString. Keduanya opsional.
  valueNumber: Yup.string()
    .optional()
    .default(undefined)
    .test("is-number", "Nilai harus berupa angka", (v) => {
      if (!v) return true;
      return NUMBER_REGEX.test(v.trim());
    }),
  valueUnit: Yup.string()
    .optional()
    .default(undefined)
    .max(50, "Satuan maksimal 50 karakter")
    .trim(),
  valueUcumCode: Yup.string()
    .optional()
    .default(undefined)
    .max(50, "Kode UCUM maksimal 50 karakter")
    .trim(),
  valueString: Yup.string()
    .optional()
    .default(undefined)
    .max(500, "Teks nilai maksimal 500 karakter")
    .trim(),
});

export type ObservationFormValues = {
  observationId?: string;
  status: (typeof OBSERVATION_STATUS)[number];
  categoryCode: string;
  categoryDisplay: string;
  codeSystem: "loinc" | "snomed";
  codeValue: string;
  codeDisplay: string;
  subjectPatientId: string;
  subjectDisplay?: string;
  encounterId: string;
  performerId?: string;
  effectiveDateTime: string;
  valueNumber?: string;
  valueUnit?: string;
  valueUcumCode?: string;
  valueString?: string;
};

// ─────────────────────────────────────────────
// Schema: GET (parameter query saja)
// ─────────────────────────────────────────────

export const observationGetSchema = Yup.object({
  /** ID spesifik — jika diisi, filter lain diabaikan */
  observationId: optionalUuid("Observation ID").default(undefined),

  /** Filter berdasarkan Patient (subject) */
  patientId: Yup.string().optional().default(undefined).trim(),

  /** Filter berdasarkan Encounter */
  encounterId: Yup.string().optional().default(undefined).trim(),
});

export type ObservationGetValues = {
  observationId?: string;
  patientId?: string;
  encounterId?: string;
};
