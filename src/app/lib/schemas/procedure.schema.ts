/**
 * lib/schemas/procedure.schema.ts
 *
 * Yup validation schema untuk form Procedure.
 * Pola konsisten dengan observation.schema.ts & condition.schema.ts.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/procedure.html
 * Contoh payload: Postman "00. FHIR Resource - Contoh Penggunaan" →
 *   Resource → Procedure.
 */

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kode tindakan — ICD-9-CM ("87.44") / SNOMED / ICD-10 ("A15.0"). */
const CODE_REGEX = /^[A-Za-z0-9.\-]{1,20}$/;

const PROCEDURE_STATUS = [
  "preparation",
  "in-progress",
  "not-done",
  "on-hold",
  "stopped",
  "completed",
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

export const procedureFormSchema = Yup.object({
  // Identifikasi resource (hanya untuk PUT/PATCH)
  procedureId: optionalUuid("Procedure ID"),

  // Status
  status: Yup.string()
    .oneOf(PROCEDURE_STATUS as unknown as string[], "Status tidak valid")
    .required("Status wajib dipilih"),

  // Kategori (SNOMED)
  categoryCode: Yup.string().required("Kode kategori wajib diisi").trim(),
  categoryDisplay: Yup.string()
    .required("Nama kategori wajib diisi")
    .max(150, "Nama kategori maksimal 150 karakter")
    .trim(),

  // Kode tindakan
  codeSystem: Yup.string()
    .oneOf(["icd-9-cm", "snomed"], "Sistem kode tidak valid")
    .required("Sistem kode wajib dipilih"),
  codeValue: Yup.string()
    .required("Kode tindakan wajib diisi")
    .matches(CODE_REGEX, "Kode tindakan tidak valid (huruf/angka/titik/strip)")
    .trim(),
  codeDisplay: Yup.string()
    .required("Nama tindakan wajib diisi")
    .max(300, "Nama tindakan maksimal 300 karakter")
    .trim(),

  // Referensi Pasien
  subjectPatientId: Yup.string().required("Patient ID wajib diisi").trim(),
  subjectDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // Referensi Encounter — Procedure dikirim dalam konteks kunjungan
  encounterId: Yup.string().required("Encounter ID wajib diisi").trim(),

  // Pelaksana (Practitioner) — opsional
  performerId: Yup.string().optional().default(undefined).trim(),

  // Waktu pelaksanaan (performedPeriod)
  performedStart: Yup.string()
    .required("Waktu mulai wajib diisi")
    .test("valid-start", "Waktu mulai tidak valid", (v) => {
      if (!v) return false;
      return !isNaN(new Date(v).getTime());
    }),
  performedEnd: Yup.string()
    .optional()
    .default(undefined)
    .test("valid-end", "Waktu selesai tidak valid", (v) => {
      if (!v) return true;
      return !isNaN(new Date(v).getTime());
    }),

  // Catatan (opsional)
  note: Yup.string()
    .optional()
    .default(undefined)
    .max(1000, "Catatan maksimal 1000 karakter")
    .trim(),
});

export type ProcedureFormValues = {
  procedureId?: string;
  status: (typeof PROCEDURE_STATUS)[number];
  categoryCode: string;
  categoryDisplay: string;
  codeSystem: "icd-9-cm" | "snomed";
  codeValue: string;
  codeDisplay: string;
  subjectPatientId: string;
  subjectDisplay?: string;
  encounterId: string;
  performerId?: string;
  performedStart: string;
  performedEnd?: string;
  note?: string;
};

// ─────────────────────────────────────────────
// Schema: GET (parameter query saja)
// ─────────────────────────────────────────────

export const procedureGetSchema = Yup.object({
  /** ID spesifik — jika diisi, filter lain diabaikan */
  procedureId: optionalUuid("Procedure ID").default(undefined),

  /** Filter berdasarkan Patient (subject) */
  patientId: Yup.string().optional().default(undefined).trim(),

  /** Filter berdasarkan Encounter */
  encounterId: Yup.string().optional().default(undefined).trim(),
});

export type ProcedureGetValues = {
  procedureId?: string;
  patientId?: string;
  encounterId?: string;
};
