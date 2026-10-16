/**
 * lib/schemas/medication-statement.schema.ts
 *
 * Yup validation schema untuk form MedicationStatement (riwayat/pernyataan
 * penggunaan obat). Pola konsisten dengan medication-dispense.schema.ts.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/medicationstatement.html
 * Contoh payload: Postman "00. FHIR Resource - Contoh Penggunaan" →
 *   Resource → MedicationStatement.
 */

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER_REGEX = /^\d+$/;

const STATUS = [
  "active",
  "completed",
  "entered-in-error",
  "intended",
  "stopped",
  "on-hold",
  "unknown",
  "not-taken",
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

const optionalInt = (label: string) =>
  Yup.string()
    .optional()
    .default(undefined)
    .test(`int-${label}`, `${label} harus berupa bilangan bulat`, (v) => {
      if (!v) return true;
      return NUMBER_REGEX.test(v.trim());
    });

// ─────────────────────────────────────────────
// Schema: POST / PUT / PATCH
// ─────────────────────────────────────────────

export const medicationStatementFormSchema = Yup.object({
  medicationStatementId: optionalUuid("MedicationStatement ID"),

  status: Yup.string()
    .oneOf(STATUS as unknown as string[], "Status tidak valid")
    .required("Status wajib dipilih"),

  categoryCode: Yup.string().required("Kode kategori wajib diisi").trim(),
  categoryDisplay: Yup.string()
    .required("Nama kategori wajib diisi")
    .max(100, "Nama kategori maksimal 100 karakter")
    .trim(),

  // Referensi Medication (obat harus terkirim dulu)
  medicationId: Yup.string().required("Medication ID wajib diisi").trim(),
  medicationDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(500, "Nama obat maksimal 500 karakter")
    .trim(),

  // Referensi Pasien (subject; juga dipakai sebagai informationSource)
  subjectPatientId: Yup.string().required("Patient ID wajib diisi").trim(),
  subjectDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // Referensi Encounter (context)
  encounterId: Yup.string().required("Encounter ID wajib diisi").trim(),

  // Aturan pakai (dosage) — opsional
  dosageText: Yup.string()
    .optional()
    .default(undefined)
    .max(250, "Aturan pakai maksimal 250 karakter")
    .trim(),
  frequency: optionalInt("Frekuensi"),
  period: optionalInt("Periode"),

  effectiveDateTime: Yup.string()
    .required("Waktu penggunaan wajib diisi")
    .test("valid-date", "Waktu tidak valid", (v) => {
      if (!v) return false;
      return !isNaN(new Date(v).getTime());
    }),
});

export type MedicationStatementFormValues = {
  medicationStatementId?: string;
  status: (typeof STATUS)[number];
  categoryCode: string;
  categoryDisplay: string;
  medicationId: string;
  medicationDisplay?: string;
  subjectPatientId: string;
  subjectDisplay?: string;
  encounterId: string;
  dosageText?: string;
  frequency?: string;
  period?: string;
  effectiveDateTime: string;
};

// ─────────────────────────────────────────────
// Schema: GET (parameter query saja)
// ─────────────────────────────────────────────

export const medicationStatementGetSchema = Yup.object({
  medicationStatementId: optionalUuid("MedicationStatement ID").default(undefined),
  patientId: Yup.string().optional().default(undefined).trim(),
  encounterId: Yup.string().optional().default(undefined).trim(),
});

export type MedicationStatementGetValues = {
  medicationStatementId?: string;
  patientId?: string;
  encounterId?: string;
};
