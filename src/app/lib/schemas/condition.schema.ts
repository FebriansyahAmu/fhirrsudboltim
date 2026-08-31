/**
 * lib/schemas/condition.schema.ts
 *
 * Yup validation schema untuk form Condition.
 * Pola konsisten dengan specimen.schema.ts & allergy-intolerance.schema.ts.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/condition.html
 * Contoh payload: Postman "00. FHIR Resource - Contoh Penggunaan" → Condition.
 */

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kode diagnosis — ICD-10 ("K35.8", "R10.0", "E11") atau SNOMED (angka). */
const CODE_REGEX = /^[A-Za-z0-9.\-]{1,20}$/;

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

export const conditionFormSchema = Yup.object({
  // Identifikasi resource (hanya untuk PUT/PATCH)
  conditionId: optionalUuid("Condition ID"),

  // Status klinis
  clinicalStatusCode: Yup.string()
    .oneOf(
      ["active", "recurrence", "relapse", "inactive", "remission", "resolved"],
      "Status klinis tidak valid",
    )
    .required("Status klinis wajib dipilih"),

  // Kategori
  categoryCode: Yup.string()
    .oneOf(
      ["encounter-diagnosis", "problem-list-item"],
      "Kategori tidak valid",
    )
    .required("Kategori wajib dipilih"),

  // Sistem kode diagnosis
  codeSystem: Yup.string()
    .oneOf(["icd-10", "snomed"], "Sistem kode tidak valid")
    .required("Sistem kode wajib dipilih"),

  codeValue: Yup.string()
    .required("Kode diagnosis wajib diisi")
    .matches(CODE_REGEX, "Kode diagnosis tidak valid (huruf/angka/titik)")
    .trim(),

  codeDisplay: Yup.string()
    .required("Nama diagnosis wajib diisi")
    .max(300, "Nama diagnosis maksimal 300 karakter")
    .trim(),

  // Referensi Pasien
  subjectPatientId: Yup.string().required("Patient ID wajib diisi").trim(),
  subjectDisplay: Yup.string()
    .required("Nama pasien wajib diisi")
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // Referensi Encounter — Condition dikirim dalam konteks kunjungan
  encounterId: Yup.string().required("Encounter ID wajib diisi").trim(),
  encounterDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(300, "Display encounter maksimal 300 karakter")
    .trim(),
});

export type ConditionFormValues = {
  conditionId?: string;
  clinicalStatusCode:
    | "active"
    | "recurrence"
    | "relapse"
    | "inactive"
    | "remission"
    | "resolved";
  categoryCode: "encounter-diagnosis" | "problem-list-item";
  codeSystem: "icd-10" | "snomed";
  codeValue: string;
  codeDisplay: string;
  subjectPatientId: string;
  subjectDisplay: string;
  encounterId: string;
  encounterDisplay?: string;
};

// ─────────────────────────────────────────────
// Schema: GET (parameter query saja)
// ─────────────────────────────────────────────

export const conditionGetSchema = Yup.object({
  /** ID spesifik — jika diisi, filter lain diabaikan */
  conditionId: optionalUuid("Condition ID").default(undefined),

  /** Filter berdasarkan Patient (subject) */
  patientId: Yup.string().optional().default(undefined).trim(),

  /** Filter berdasarkan Encounter */
  encounterId: Yup.string().optional().default(undefined).trim(),
});

export type ConditionGetValues = {
  conditionId?: string;
  patientId?: string;
  encounterId?: string;
};
